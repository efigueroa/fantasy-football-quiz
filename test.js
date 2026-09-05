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
    (_, i) => ({ question: `${difficulty}-${i}`, answer: `A${i}`, difficulty,
                 source: `https://en.wikipedia.org/wiki/${difficulty}_${i}` }));
const BANK = [...mk('easy', 4), ...mk('medium', 4), ...mk('hard', 2)];

const mkEl = () => ({
    textContent: '', className: '', disabled: false, style: {}, children: [],
    appendChild(child) { this.children.push(child); return child; },
});

function newGame(bank = BANK) {
    const store = {};
    const els = {};
    const sandbox = {
        console,
        els,
        BANK: JSON.parse(JSON.stringify(bank)),
        document: {
            getElementById: id => (els[id] ||= mkEl()),
            createElement: tag => Object.assign(mkEl(), { tag }),
            addEventListener: () => {},
        },
        window: { addEventListener: () => {} },
        localStorage: {
            getItem: k => (k in store ? store[k] : null),
            setItem: (k, v) => { store[k] = String(v); },
        },
        setTimeout: () => 0,
        clearTimeout: () => {},
        setInterval: () => 1,
        clearInterval: () => {},
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

// Next must double back to anything skipped rather than ending the round
{
    const run = newGame();
    run('startGame()');
    run('nextQuestion()');                       // skip question 1 outright

    for (let i = 0; i < 4; i++) { run('mark(true)'); run('nextQuestion()'); }

    assert.strictEqual(run('currentQuestionIndex'), 0,
        'Next on the last question must cycle back to the skipped one');
    assert.notStrictEqual(run('els["final-results"].style.display'), 'block',
        'the round must not end while a question is unanswered');
    assert.strictEqual(run('els["next-btn"].textContent'), 'Next \u2192',
        'a mid-round question should still offer a plain Next');

    run('mark(true)');                           // nothing left unanswered
    assert.strictEqual(run('currentQuestionIndex'), 0, 'answering must not move on by itself');
    // 0 -> 4 takes four presses, and a fifth at the last card ends it
    for (let i = 0; i < 5; i++) run('nextQuestion()');
    assert.strictEqual(run('els["final-results"].style.display'), 'block',
        'once everything is answered Next must finish the round');
}

// The last question labels itself by what Next will actually do
{
    const run = newGame();
    run('startGame()');
    for (let i = 0; i < 4; i++) run('nextQuestion()');
    assert.strictEqual(run('els["next-btn"].textContent'), 'Skipped \u2192',
        'with questions outstanding the last card should offer Skipped');
    assert.strictEqual(run('els["next-btn"].disabled'), false,
        'Next must never be a dead end');
}

// The answer links to its source and opens in a new tab
{
    const run = newGame();
    run('startGame()');
    const link = JSON.parse(run(`JSON.stringify((() => {
        const a = els['answer-text'].children[0];
        return { tag: a.tag, href: a.href, target: a.target, rel: a.rel, text: a.textContent };
    })())`));
    assert.strictEqual(link.tag, 'a', 'the answer should be rendered as a link');
    assert.strictEqual(link.target, '_blank', 'the link must open in a new tab');
    assert.ok(/noopener/.test(link.rel), 'a new-tab link needs rel=noopener');
    assert.strictEqual(link.href, run('gameQuestions[0].source'), 'link must point at the source');
    assert.strictEqual(link.text, run('gameQuestions[0].answer'), 'link text is the answer');
}

// An entry with no source still renders, so a half-populated bank cannot break the game
{
    const bare = BANK.map(({ source, ...rest }) => rest);
    const run = newGame(bare);
    run('startGame()');
    assert.strictEqual(run('els["answer-text"].children.length'), 0, 'no source means no link');
    assert.strictEqual(run('els["answer-text"].textContent'), run('gameQuestions[0].answer'),
        'the answer text must still show without a source');
}

// The chip strip always shows the starting chip plus one slot per round
{
    const run = newGame();
    run('startGame()');
    assert.strictEqual(run('[...chipString()].length'), 5, 'chip strip should be one slot per question');
    run('mark(false)');
    assert.ok(run('chipString().includes("❌")'), 'a wrong answer should show an X');
}

// The draft clock banks time, pauses without losing it, and resets
{
    const run = newGame();

    assert.strictEqual(run('formatTime(0)'), '0:00');
    assert.strictEqual(run('formatTime(65)'), '1:05');
    assert.strictEqual(run('formatTime(600)'), '10:00', 'minutes must not wrap at ten');

    assert.strictEqual(run('timerRunning'), false, 'the clock is off until time is added');
    assert.strictEqual(run('timerSeconds()'), 0);

    run('addMinute()');
    assert.strictEqual(run('timerSeconds()'), 60, '+1 min should bank a minute');
    assert.strictEqual(run('timerRunning'), true, 'adding time should start the clock');
    assert.strictEqual(run('els["timer-panel"].open'), true,
        'adding time should open the panel so Pause is reachable');

    run('addMinute()');
    assert.strictEqual(run('timerSeconds()'), 120, 'a second minute should stack');

    run('toggleTimer()');
    assert.strictEqual(run('timerRunning'), false, 'Pause should stop the clock');
    assert.strictEqual(run('timerSeconds()'), 120, 'pausing must not lose banked time');
    assert.strictEqual(run('els["timer-pause"].textContent'), 'Resume',
        'a paused clock should offer Resume');

    run('addMinute()');
    assert.strictEqual(run('timerSeconds()'), 180, '+1 min should work while paused');
    assert.strictEqual(run('timerRunning'), true, 'adding time should resume a paused clock');

    run('toggleTimer()');
    run('toggleTimer()');
    assert.strictEqual(run('timerRunning'), true, 'Resume should restart the clock');

    run('resetTimer()');
    assert.strictEqual(run('timerSeconds()'), 0, 'Reset should clear the clock');
    assert.strictEqual(run('timerRunning'), false);
    assert.strictEqual(run('els["timer-pause"].disabled'), true, 'nothing to pause at zero');
    assert.strictEqual(run('els["timer-reset"].disabled'), true, 'nothing to reset at zero');

    run('toggleTimer()');
    assert.strictEqual(run('timerRunning'), false, 'Resume must do nothing with no time banked');
}

// The last thirty seconds are marked urgent, and only those
{
    const run = newGame();
    run('timerRunning = true; timerEnd = Date.now() + 31000; timerLoop();');
    assert.ok(!/urgent/.test(run('els["timer-display"].className')), '31s is not urgent yet');
    run('timerEnd = Date.now() + 30000; timerLoop();');
    assert.ok(/urgent/.test(run('els["timer-display"].className')), '30s should read as urgent');
    run('timerEnd = Date.now(); timerLoop();');
    assert.ok(!/urgent/.test(run('els["timer-display"].className')), 'zero is spent, not urgent');
    assert.strictEqual(run('timerRunning'), false, 'the clock stops when it reaches zero');
}

console.log('All checks passed');
