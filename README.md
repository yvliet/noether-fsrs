# Spaced Repetition (FSRS) for Noether

State-of-the-art Free Spaced Repetition Scheduler (FSRS) flashcard review system built right inside Noether.

---

## 1. Overview & User Experience

Taking notes is only the first half of learning. Retaining what you read requires active recall over spaced intervals.

The **Spaced Repetition (FSRS)** extension integrates the modern **Free Spaced Repetition Scheduler (FSRS)** algorithm directly into Noether. Turn bullet points, Q&A blocks, and vocabulary lists in your notes into interactive flashcards without switching to external apps like Anki.

### Where It Lives in Noether
- **Left Action Rail**: Click the flashcard deck icon to open your Due Review session.
- **Status Bar**: Displays how many flashcards are due for review today (e.g. `12 cards due`).
- **In-Note Flashcard Blocks**: Type `Q:` and `A:` or use `::` delimiters to define flashcards inside normal Markdown notes.

## 2. Features & Step-by-Step Guide

### 1. Defining Flashcards in Notes
Create flashcards using simple, human-readable syntax in any note:

```markdown
What is Hooke's Law?::F = -k * x

Q: What algorithm does this extension use?
A: Free Spaced Repetition Scheduler (FSRS v4.5)
```

### 2. Reviewing Due Cards
1. Click the **Flashcards** icon in the Left Action Rail (or press `Ctrl+Shift+R`).
2. Read the prompt, then click **Show Answer** (or press `Spacebar`).
3. Grade your recall using the 4 FSRS rating buttons:
   - **Again** (`1`): Complete blackout, resets repetition interval.
   - **Hard** (`2`): Correct but required significant effort.
   - **Good** (`3`): Correct with normal recall speed.
   - **Easy** (`4`): Instant, effortless recall.
4. FSRS computes the exact optimal interval until your next review.

## 3. Architecture & SDK Blueprint (For Extension Builders)

The Spaced Repetition extension demonstrates how to implement specialized learning algorithms using the `ts-fsrs` state machine, register custom review views, and manage review queues via the Noether SDK.

### SDK Extension Points Used
- `this.registerView()`: Mounts the interactive flashcard review canvas.
- `this.addActionRailIcon()`: Adds the review launcher with a dynamic badge showing cards due today.
- `this.defineTable()`: Stores card stability, difficulty, state, and review logs in SQLite.
- `this.registerTool()`: Exposes MCP tools for fetching due flashcards.

### Real SDK Implementation Pattern

```typescript
import { Extension, NoetherApp } from 'noether';

export default class FsrsExtension extends Extension {
  async onload(): Promise<void> {
    this.addActionRailIcon({
      id: 'fsrs-action-rail',
      title: 'Review Due Flashcards',
      icon: 'brain-02',
      badge: () => this.getDueCount(),
      onClick: (app: NoetherApp) => {
        app.workspace.openTab('fsrs-review');
      },
    });
  }
}
```

## 4. MCP Tools Reference

### 1. `fsrs-spaced-repetition_get_due_cards`
- **Description**: Retrieves all flashcards currently due for spaced repetition review across the vault.
- **Parameters**: None.
- **Returns**: Array of due card objects with `id`, `question`, `answer`, `documentId`, and FSRS metrics.

## 5. Development & Local Building

To build and test this community extension locally:

```bash
git clone https://github.com/yvliet/noether-fsrs.git
cd noether-fsrs
npm install
npm run build
```

Copy the compiled bundle `dist/main.js` and `manifest.json` into your vault's `.noether/extensions/noether-fsrs/` directory and reload Noether.

## 6. License

MIT © [Yuliet Li](https://github.com/yvliet)
