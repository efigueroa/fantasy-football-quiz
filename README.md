
# 🏈 Fig Fam Draft Quiz 🏈

This site was vibe coded and spat out in an afternoon and strictly meant to be used for my family's fantasy football draft game.

Site: [ffquiz.figgy.foo](https://ffquiz.figgy.foo/)

- 4 random questions per game, drawn from the question bank
- Chip system: start with 1 chip, earn one more for each correct answer
- Legend: ⭐ for correct, ❌ for wrong, ⚪ for unanswered
- Each browser remembers the questions it has already asked, so one draft night does not repeat a question until the bank runs out
- **Play Again** on the results screen starts the next drafter. No page reload

<div align="center">
  <img src="game-screenshot.jpg" alt="Game Screenshot" width="300">
</div>

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `1` | Mark correct |
| `2` | Mark wrong |
| `←` | Previous question |
| `→` | Next question, or finish the game |

## Adding questions

Add entries to `quiz-data.json`. Each one needs a question and an answer:

```json
{
  "question": "Which team plays in Lambeau Field?",
  "answer": "Packers"
}
```

Write questions that stay true. "Which team drafted Aaron Rodgers?" does not go stale. "What team does Aaron Rodgers play for?" goes stale every March.

## Tests

```sh
node test.js
```

This runs the game logic against a stub DOM and checks the scoring rules and the question rotation. It needs no dependencies and no browser.
