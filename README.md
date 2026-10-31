# Commit2Code Python Lab

A website where students read lessons, do practice exercises, and run real Python
right in the browser. No accounts, no server, and no installs.

## What's in this folder

| File | What it does |
|---|---|
| `index.html` | All the lesson content: every tab, reference card, and exercise |
| `styles.css` | Colors, fonts, and layout |
| `app.js` | Tabs, Run/Stop buttons, hints, autosave, and Download |
| `py-worker.js` | Runs the students' Python code (using Pyodide) |
| `README.md` | These instructions |

## Put it online with GitHub Pages (free, about 10 minutes)

1. Go to **github.com** and sign up for a free account (for example, `commit2code`).
2. Click the **+** in the top right corner, then **New repository**.
   - Name it `python-lab` (or anything you like).
   - Choose **Public**.
   - Click **Create repository**.
3. On the next page, click **uploading an existing file**.
4. Drag in all five files from this folder, then click **Commit changes**.
5. Go to **Settings**, then **Pages** (in the left menu).
   - Under **Branch**, choose **main** and **/ (root)**, then click **Save**.
6. Wait 1–2 minutes, then refresh the Pages screen. Your site's address appears at
   the top, like `https://commit2code.github.io/python-lab/`.

Share that link with students, or turn it into a QR code to put on a slide.

## Before your first class

Open the site **on one of the club's computers** and run one exercise.

- The first time, the site downloads Python (about 10 MB), which can take 10–30
  seconds. The top bar says **Python ready** with a green dot when it's done. After
  that it loads much faster.
- If it stays on "Loading Python…" or shows an error, the club's network may be
  blocking `cdn.jsdelivr.net`. Ask whoever manages the network to allow that
  address.

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
it a new `id` (like `tab-loops`), and add a matching link in the sidebar
(`href="#loops" data-tab="loops"`). The Run buttons, hints, and saving work
automatically for anything you add this way.

## Keyboard tips for students

- **Ctrl + Enter** runs the code.
- **Tab** indents a line by 4 spaces, and **Shift + Tab** un-indents it.
- After a line ending in `:`, pressing Enter indents the next line automatically.
- To leave a code box with the keyboard, press **Esc** and then **Tab**.
