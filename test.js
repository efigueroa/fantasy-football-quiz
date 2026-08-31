// Self-check for the game logic in index.html. No dependencies: node test.js
// Runs the page's <script> in a vm with a stub DOM, then asserts the rules
// that are easy to break by accident.

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');

const js = fs.readFileSync('index.html', 'utf8').split('<script>')[1].split('</script>')[0];

// Exactly two rounds' worth of each difficulty, so two games in a row
// should use every question exactly once and then rotate.
const mk = (difficulty, n) => Array.from({ length: n },
    (_, i) => ({ question: `${difficulty}-${i}`, answer: `A${i}`, difficulty }));
const BANK = [...mk('easy', 4), ...mk('medium', 4), ...mk('hard', 2)];

function newGame(bank = BANK) {
    const store = {};
    const sandbox = {
        console,
        BANK: JSON.parse(JSON.stringify(bank)),
        document: {
            getElementById: () => ({ textContent: '', style: {}, disabled: false }),
            addEventListener: () => {},
        },
        window: { addEventListener: () => {} },
        localStorage: {
            getItem: k => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
        },
        setTimeout: () => 0,
        clearTimeout: () => {},
    };
    vm.createContext(sandbox);
    vm.runInContext(js, sandbox);
    const run = expr => vm.runInContext(expr, sandbox);
    run('quizData = BANK');
    return run;
}

// An answered question stays answered, so Previous cannot be used to farm chips
{
    const run = newGame();
    run('startGame()');
    run('mark(true)');
    assert.strictEqual(run('chipCount()'), 1, 'one correct answer should be worth one chip');

    // Navigate away and back, then try to change the score
    run('nextQuestion()');
    run('previousQuestion()');
    run('mark(false)');
    assert.strictEqual(run('chipCount()'), 1, 'an answered question must not be flipped to wrong');

    run('mark(true)');
    assert.strictEqual(run('chipCount()'), 1, 're-marking an answered question must not add a chip');
}

// Scores must not stick to the shared question bank between games
{
    const run = newGame();
    run('startGame()');
    run('mark(true)');
    assert.strictEqual(
        run('quizData.some(q => "userAnswer" in q)'), false,
        'answers leaked into quizData, so a repeat question would arrive pre-answered');

    run('startGame()');
    assert.strictEqual(run('chipCount()'), 0, 'a new game starts back at zero chips');
}

// Every round ramps: two easy, two medium, one hard, in that order
{
    const run = newGame();
    run('startGame()');
    assert.deepStrictEqual(
        JSON.parse(run('JSON.stringify(gameQuestions.map(q => q.difficulty))')),
        ['easy', 'easy', 'medium', 'medium', 'hard'],
        'a round must deal 2 easy, 2 medium then 1 hard, in that order');
}

// The seen list should exhaust each difficulty before it repeats anything
{
    const run = newGame();
    run('startGame()');
    const first = run('JSON.stringify(gameQuestions.map(q => q.question))');
    run('startGame()');
    const second = run('JSON.stringify(gameQuestions.map(q => q.question))');
    const all = [...JSON.parse(first), ...JSON.parse(second)];
    assert.strictEqual(new Set(all).size, 10, 'two games out of a ten-question bank must not repeat');

    // Bank is used up now, so the third game rotates back to the start
    run('startGame()');
    assert.strictEqual(run('gameQuestions.length'), 5, 'the rotation must reset instead of running dry');
}

// A difficulty that runs dry must not reset the others
{
    // Only one hard question, so hard rotates every single game
    const run = newGame([...mk('easy', 4), ...mk('medium', 4), ...mk('hard', 1)]);
    run('startGame()');
    const firstEasy = JSON.parse(run(
        'JSON.stringify(gameQuestions.filter(q => q.difficulty === "easy").map(q => q.question))'));
    run('startGame()');
    const secondEasy = JSON.parse(run(
        'JSON.stringify(gameQuestions.filter(q => q.difficulty === "easy").map(q => q.question))'));
    assert.strictEqual(firstEasy.filter(q => secondEasy.includes(q)).length, 0,
        'a short hard list must not reset the easy rotation');
}

// The chip strip always shows the starting chip plus one slot per round
{
    const run = newGame();
    run('startGame()');
    assert.strictEqual(run('[...chipString()].length'), 5, 'chip strip should be one slot per question');
    run('mark(false)');
    assert.ok(run('chipString().includes("❌")'), 'a wrong answer should show an X');
}

console.log('All checks passed');
