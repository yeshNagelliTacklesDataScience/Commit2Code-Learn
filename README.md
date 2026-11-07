# Commit2Code Python Lab

A website where students read lessons, do practice exercises, play team coding
games, and run real Python right in the browser. No accounts, no server, and no
installs. Live at **learn.commit2code.org**.

## What's in this folder

| File | What it does |
|---|---|
| `index.html` | All the lesson content: every tab, reference card, and exercise |
| `styles.css` | Colors, fonts, and layout |
| `app.js` | Tabs, Run/Stop buttons, hints, autosave, and Download |
| `py-worker.js` | Runs the students' Python code (using Pyodide) |
| `games.js` | The Game Room: Debug Race, Escape Room, Coding Relay, and the projector scoreboard |
| `game-data.js` | Every game round, sorted by topic. **This is the file to edit to add rounds.** |
| `CNAME` | Keeps the custom domain (learn.commit2code.org) working. Don't delete it. |
| `README.md` | These instructions |

## Before each class

Open the site **on one of the club's computers** and run one exercise.

- The first time, the site downloads Python (about 10 MB), which can take 10–30
  seconds. The top bar says **Python ready** with a green dot when it's done. After
  that it loads much faster.
- If it stays on "Loading Python…" or shows an error, the club's network may be
  blocking `cdn.jsdelivr.net`. Ask whoever manages the network to allow that
  address.

## The Game Room

Open **Game Room** in the sidebar. There are three games, and each one works
with any topic or a mix of topics:

- **Debug Race**: teams fix broken code. The site checks each fix automatically.
- **Escape Room**: teams predict what code prints to unlock each door. Easy doors
  come first.
- **Coding Relay**: one shared editor per team. Each player adds one line, then
  passes the keyboard. The site checks the finished program.

Every game shuffles its rounds, so playing again gives different ones.

**Sharing a game:** pick a game and topics, and the setup screen shows a link,
like `learn.commit2code.org/#games/debug/variables+loops`. Put it on a slide or
a QR code so every team lands on the right game.

**Check codes:** when a team finishes a round or a game, their screen shows a
3-letter check code. They call it out, and you can type it into **Check a code**
on the scoreboard to confirm it's real before awarding points.

### Projector scoreboard

In the Game Room, click **Projector scoreboard** on the computer hooked up to
the projector (or go to `#games/scoreboard`).

- Click a team name to rename it. Add up to 8 teams.
- **Keys:** 1–8 give that team a point, Shift + 1–8 take one away, Space
  starts/pauses the timer, Esc closes the scoreboard.
- Timer presets: 1, 3, 5, or 10 minutes, plus +30 seconds. The screen flashes and
  beeps when time runs out.
- **Show winner** puts the leading team on screen with confetti.
- Scores are saved on that computer, so a refresh won't lose them. Use **Reset
  scores** to start fresh.

### Adding game rounds

Open `game-data.js`. Each round is one line inside `DEBUG`, `ESCAPE`, or `RELAY`,
and each has a `topic`. Copy an existing round, give it a new `id`, and change
the code. Write each line of Python as its own `"..."` inside `L( )`, with 4
spaces for an indent.

- **Debug Race:** `code` is the broken code, and `expected` is exactly what the
  fixed program prints. Use `\n` between lines.
- **Escape Room:** just write the `code`. The site runs it to find the answer.
  Avoid `input()`.
- **New topic (like Lists):** add it to `TOPICS` at the top of the file, then add
  rounds with that topic. All three games will offer it automatically.

## How students' work is saved

Each exercise saves automatically **in that browser on that computer**. If a
student switches computers or the browser data gets cleared, their code is gone.
For anything they want to keep, they can use **Download** in the Playground.

## Making changes later

To fix a typo or add a lesson, edit `index.html`, then upload it again on GitHub:
open the repository, click **Add file**, then **Upload files**, and drag in the
new version. The live site updates in a minute or two.

Each tab is a `<section class="tab-panel">` in `index.html`, and each exercise is
an `<article class="exercise">`. To add a new tab, copy an existing section, give
it a new `id` (like `tab-lists`), and add a matching link in the sidebar
(`href="#lists" data-tab="lists"`). The Run buttons, hints, and saving work
automatically for anything you add this way. Give each new exercise a unique
`data-ex` value (the next free one is `e23`).

## Keyboard tips for students

- **Ctrl + Enter** runs the code.
- **Tab** indents a line by 4 spaces, and **Shift + Tab** un-indents it.
- After a line ending in `:`, pressing Enter indents the next line automatically.
- To leave a code box with the keyboard, press **Esc** and then **Tab**.
