// Commit2Code Python Lab: tabs, code editors, and running Python.
(function () {
  "use strict";

  // ---------- Small helpers ----------
  const STORE_PREFIX = "c2c-code-";
  const MAX_OUTPUT_CHARS = 100000;

  function storageGet(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* ignore */ }
  }
  function storageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  // ---------- Tabs ----------
  const panels = Array.from(document.querySelectorAll(".tab-panel"));
  const tabIds = panels.map((p) => p.id.replace("tab-", ""));
  const tabLinks = Array.from(document.querySelectorAll("[data-tab]"));

  function showTab(id, scroll) {
    if (!tabIds.includes(id)) id = tabIds[0];
    panels.forEach((p) => { p.hidden = p.id !== "tab-" + id; });
    tabLinks.forEach((a) => {
      if (a.dataset.tab === id) {
        a.setAttribute("aria-current", "page");
        // On phones the menu scrolls sideways: keep the current tab in view.
        const nav = a.closest(".side-nav");
        if (nav && nav.scrollWidth > nav.clientWidth) {
          nav.scrollLeft = a.offsetLeft - nav.offsetLeft - 16;
        }
      } else {
        a.removeAttribute("aria-current");
      }
    });
    if (scroll) window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", () => showTab(location.hash.slice(1), true));
  showTab(location.hash.slice(1), false);

  // ---------- Python status ----------
  const statusEl = document.getElementById("py-status");
  function setStatus(state) {
    if (!statusEl) return;
    statusEl.dataset.state = state;
    statusEl.textContent =
      state === "ready" ? "Python ready" :
      state === "error" ? "Python didn't load. Check the internet and refresh." :
      "Loading Python…";
  }

  // ---------- Python worker ----------
  let worker = null;
  let ready = false;
  let queued = null;   // a run waiting for Python to finish loading
  let active = null;   // the exercise currently running

  function workerUrl() {
    const base = new URLSearchParams(location.search).get("pyodide");
    return base ? "py-worker.js?base=" + encodeURIComponent(base) : "py-worker.js";
  }

  function startWorker() {
    ready = false;
    setStatus("loading");
    worker = new Worker(workerUrl());
    worker.onmessage = onWorkerMessage;
    worker.onerror = () => {
      setStatus("error");
      if (active) finish({ name: "LoadError", message: "Python couldn't start. Check the internet connection and refresh the page.", line: null });
    };
  }

  function onWorkerMessage(event) {
    const msg = event.data;
    if (msg.type === "ready") {
      ready = true;
      setStatus("ready");
      if (queued) { const q = queued; queued = null; sendRun(q); }
      return;
    }
    if (msg.type === "load-error") {
      setStatus("error");
      if (active) finish({ name: "LoadError", message: "Python couldn't start. Check the internet connection and refresh the page.", line: null });
      return;
    }
    if (!active) return;
    if (msg.type === "out") appendText(msg.text);
    else if (msg.type === "input") askForInput(msg.prompt);
    else if (msg.type === "done") finish(msg.error);
  }

  // ---------- Output ----------
  function appendText(text) {
    if (!active || !text) return;
    if (active.waiting) { active.waiting.remove(); active.waiting = null; }
    active.chars += text.length;
    active.pre.appendChild(document.createTextNode(text));
    active.printed = true;
    if (active.chars > MAX_OUTPUT_CHARS) {
      stopProgram("Stopped: your program printed too much. Is there a loop that never ends?");
    }
  }

  function askForInput(prompt) {
    if (active.waiting) { active.waiting.remove(); active.waiting = null; }
    if (prompt) active.pre.appendChild(document.createTextNode(prompt));
    const box = document.createElement("input");
    box.type = "text";
    box.className = "stdin";
    box.setAttribute("aria-label", "Type your answer and press Enter");
    box.placeholder = "type here, then Enter";
    box.autocomplete = "off";
    box.spellcheck = false;
    active.pre.appendChild(box);
    box.focus();
    box.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const value = box.value;
      const span = document.createElement("span");
      span.className = "you";
      span.textContent = value;
      box.replaceWith(span);
      active.pre.appendChild(document.createTextNode("\n"));
      active.printed = true;
      worker.postMessage({ type: "input-reply", value: value });
    });
  }

  const TIPS = {
    NameError: "Check your spelling and capital letters. Text needs quotes around it.",
    SyntaxError: "Look for a missing quote, parenthesis ( ), or colon :",
    IndentationError: "Check the spaces at the start of your lines. Code inside an if needs 4 spaces.",
    TypeError: "You might be mixing text and numbers. Try int() or str().",
    ValueError: "int() only works on whole numbers like 12, not words.",
    ZeroDivisionError: "You can't divide by zero!",
  };

  function finish(error) {
    if (!active) return;
    const run = active;
    active = null;
    if (run.waiting) { run.waiting.remove(); run.waiting = null; }
    run.pre.querySelectorAll("input.stdin").forEach((b) => b.remove());
    if (error) {
      const box = document.createElement("div");
      box.className = "error-box";
      const title = document.createElement("p");
      title.className = "error-title";
      title.textContent = error.line ? "Error on line " + error.line : "Error";
      const msg = document.createElement("pre");
      msg.className = "error-msg";
      msg.textContent = error.name + ": " + error.message;
      box.append(title, msg);
      const tip = TIPS[error.name];
      if (tip) {
        const t = document.createElement("p");
        t.className = "error-tip";
        t.textContent = "Tip: " + tip;
        box.appendChild(t);
      }
      run.out.appendChild(box);
    } else if (!run.printed) {
      const note = document.createElement("span");
      note.className = "muted";
      note.textContent = "Your program ran, but it didn't print anything. Did you forget print()?";
      run.pre.appendChild(note);
    }
    setRunning(run.ex, false);
    setAllRunButtons(false);
  }

  function stopProgram(message) {
    if (!active) return;
    const run = active;
    worker.terminate();
    run.pre.querySelectorAll("input.stdin").forEach((b) => b.remove());
    if (run.waiting) { run.waiting.remove(); run.waiting = null; }
    const note = document.createElement("span");
    note.className = "muted";
    note.textContent = "\n" + (message || "Program stopped.");
    run.pre.appendChild(note);
    active = null;
    queued = null;
    setRunning(run.ex, false);
    setAllRunButtons(false);
    startWorker();
  }

  function setRunning(ex, running) {
    ex.querySelector(".btn-run").hidden = running;
    ex.querySelector(".btn-stop").hidden = !running;
    if (running) ex.querySelector(".btn-stop").focus();
  }
  function setAllRunButtons(disabled) {
    document.querySelectorAll(".btn-run").forEach((b) => { b.disabled = disabled; });
  }

  function sendRun(run) {
    worker.postMessage({ type: "run", code: run.code });
  }

  function runExercise(ex) {
    if (active) return;
    const editor = ex.querySelector("textarea.editor");
    const out = ex.querySelector(".output");
    const pre = out.querySelector(".output-text");
    out.hidden = false;
    out.querySelectorAll(".error-box").forEach((b) => b.remove());
    pre.textContent = "";
    const waiting = document.createElement("span");
    waiting.className = "muted";
    waiting.textContent = ready ? "Running…" : "Starting Python… (the first time can take a few seconds)";
    pre.appendChild(waiting);
    active = { ex, out, pre, code: editor.value, printed: false, chars: 0, waiting };
    setAllRunButtons(true);
    setRunning(ex, true);
    if (ready) sendRun(active);
    else queued = active;
  }

  // ---------- Editors ----------
  function insertText(el, text) {
    el.focus();
    let ok = false;
    try { ok = document.execCommand("insertText", false, text); } catch (e) { ok = false; }
    if (!ok) {
      el.setRangeText(text, el.selectionStart, el.selectionEnd, "end");
      el.dispatchEvent(new Event("input"));
    }
  }

  function setupEditor(el, saveKey) {
    const starter = el.value;
    el.dataset.starter = starter;
    const saved = storageGet(saveKey);
    if (saved !== null) el.value = saved;

    let timer = null;
    el.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => storageSet(saveKey, el.value), 300);
    });

    el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { el.dataset.escaped = "1"; return; }
      if (e.key === "Tab") {
        if (el.dataset.escaped === "1") { delete el.dataset.escaped; return; } // let Tab move focus
        e.preventDefault();
        if (e.shiftKey) {
          const start = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1;
          const lead = el.value.slice(start).match(/^ {1,4}/);
          if (lead) {
            el.setSelectionRange(start, start + lead[0].length);
            insertText(el, "");
          }
        } else {
          insertText(el, "    ");
        }
        return;
      }
      delete el.dataset.escaped;
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const ex = el.closest(".exercise");
        if (ex) runExercise(ex);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
        const before = el.value.slice(0, el.selectionStart);
        const line = before.slice(before.lastIndexOf("\n") + 1);
        let indent = line.match(/^ */)[0];
        if (/:\s*$/.test(line)) indent += "    ";
        if (indent) { e.preventDefault(); insertText(el, "\n" + indent); }
      }
    });
    return starter;
  }

  document.querySelectorAll(".exercise").forEach((ex) => {
    const id = ex.dataset.ex;
    const editor = ex.querySelector("textarea.editor");
    const saveKey = STORE_PREFIX + id;
    setupEditor(editor, saveKey);

    ex.querySelector(".btn-run").addEventListener("click", () => runExercise(ex));
    ex.querySelector(".btn-stop").addEventListener("click", () => stopProgram());

    const hintBtn = ex.querySelector(".btn-hint");
    const hint = ex.querySelector(".hint");
    if (hintBtn && hint) {
      hintBtn.addEventListener("click", () => {
        hint.hidden = !hint.hidden;
        hintBtn.setAttribute("aria-expanded", String(!hint.hidden));
        hintBtn.textContent = hint.hidden ? "Hint" : "Hide hint";
      });
    }

    const resetBtn = ex.querySelector(".btn-reset");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        editor.value = editor.dataset.starter;
        storageRemove(saveKey);
        editor.focus();
      });
    }

    const dlBtn = ex.querySelector(".btn-download");
    if (dlBtn) {
      dlBtn.addEventListener("click", () => {
        const blob = new Blob([editor.value], { type: "text/x-python" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "my_code.py";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      });
    }
  });

  startWorker();
})();
