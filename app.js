// Commit2Code Python Lab: tabs, code editors, and running Python.
(function () {
  "use strict";

  const C2C = (window.C2C = window.C2C || {});

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
  C2C.storage = { get: storageGet, set: storageSet, remove: storageRemove };

  // ---------- Tabs ----------
  // The address looks like #loops or #games/debug/variables. The part before
  // the first "/" picks the tab; the Game Room reads the rest.
  const panels = Array.from(document.querySelectorAll(".tab-panel"));
  const tabIds = panels.map((p) => p.id.replace("tab-", ""));
  const tabLinks = Array.from(document.querySelectorAll("[data-tab]"));
  let currentTab = null;

  function showTab(hash, scroll) {
    let id = (hash || "").split("/")[0];
    if (!tabIds.includes(id)) id = tabIds[0];
    const changed = id !== currentTab;
    currentTab = id;
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
    if (scroll && changed) window.scrollTo(0, 0);
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

  // ---------- Python runner (shared by lessons and games) ----------
  // Python.run({ code, onText(text), onInput(prompt, reply), onDone(error),
  //              onStopped(reason), timeoutMs }) -> false if something is already running.
  const Python = (function () {
    let worker = null;
    let ready = false;
    let queued = null;
    let job = null;

    function workerUrl() {
      const base = new URLSearchParams(location.search).get("pyodide");
      return base ? "py-worker.js?base=" + encodeURIComponent(base) : "py-worker.js";
    }

    function loadFailed() {
      setStatus("error");
      if (job) finish({ name: "LoadError", message: "Python couldn't start. Check the internet connection and refresh the page.", line: null });
    }

    function start() {
      ready = false;
      setStatus("loading");
      worker = new Worker(workerUrl());
      worker.onmessage = onMessage;
      worker.onerror = loadFailed;
    }

    function send(j) {
      worker.postMessage({ type: "run", code: j.code });
    }

    function onMessage(event) {
      const msg = event.data;
      if (msg.type === "ready") {
        ready = true;
        setStatus("ready");
        if (queued) { const q = queued; queued = null; send(q); }
        return;
      }
      if (msg.type === "load-error") { loadFailed(); return; }
      if (!job) return;
      if (msg.type === "out") {
        if (job.onText) job.onText(msg.text);
      } else if (msg.type === "input") {
        const j = job;
        const reply = (value) => { if (job === j) worker.postMessage({ type: "input-reply", value: String(value) }); };
        if (j.onInput) j.onInput(msg.prompt, reply);
        else reply("");
      } else if (msg.type === "done") {
        finish(msg.error);
      }
    }

    function finish(error) {
      const j = job;
      job = null;
      if (!j) return;
      clearTimeout(j.timer);
      if (j.onDone) j.onDone(error || null);
    }

    function run(opts) {
      if (job) return false;
      job = Object.assign({}, opts);
      if (opts.timeoutMs) job.timer = setTimeout(() => stop("timeout"), opts.timeoutMs);
      if (ready) send(job);
      else queued = job;
      return true;
    }

    function stop(reason) {
      if (!job) return;
      const j = job;
      job = null;
      queued = null;
      clearTimeout(j.timer);
      worker.terminate();
      start();
      if (j.onStopped) j.onStopped(reason || "stopped");
    }

    return {
      start: start,
      run: run,
      stop: stop,
      isBusy: () => !!job,
      isReady: () => ready,
    };
  })();
  C2C.Python = Python;

  // ---------- Showing errors ----------
  const TIPS = {
    NameError: "Check your spelling and capital letters. Text needs quotes around it.",
    SyntaxError: "Look for a missing quote, parenthesis ( ), or colon :",
    IndentationError: "Check the spaces at the start of your lines. Code inside an if or a loop needs 4 spaces.",
    TypeError: "You might be mixing text and numbers. Try int() or str().",
    ValueError: "int() only works on whole numbers like 12, not words.",
    ZeroDivisionError: "You can't divide by zero!",
  };

  function renderError(container, error) {
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
    container.appendChild(box);
    return box;
  }
  C2C.renderError = renderError;

  // Adds a typing box for input() to an output area. Calls done(value) on Enter.
  function addInputBox(pre, prompt, done) {
    if (prompt) pre.appendChild(document.createTextNode(prompt));
    const box = document.createElement("input");
    box.type = "text";
    box.className = "stdin";
    box.setAttribute("aria-label", "Type your answer and press Enter");
    box.placeholder = "type here, then Enter";
    box.autocomplete = "off";
    box.spellcheck = false;
    pre.appendChild(box);
    box.focus();
    box.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const value = box.value;
      const span = document.createElement("span");
      span.className = "you";
      span.textContent = value;
      box.replaceWith(span);
      pre.appendChild(document.createTextNode("\n"));
      done(value);
    });
    return box;
  }
  C2C.addInputBox = addInputBox;

  // ---------- Lesson exercises ----------
  let active = null; // the exercise currently running

  function clearWaiting(run) {
    if (run.waiting) { run.waiting.remove(); run.waiting = null; }
  }

  function setRunning(ex, running) {
    ex.querySelector(".btn-run").hidden = running;
    ex.querySelector(".btn-stop").hidden = !running;
    if (running) ex.querySelector(".btn-stop").focus();
  }
  function setAllRunButtons(disabled) {
    document.querySelectorAll(".exercise .btn-run").forEach((b) => { b.disabled = disabled; });
  }

  function endExercise(run) {
    if (active === run) active = null;
    clearWaiting(run);
    run.pre.querySelectorAll("input.stdin").forEach((b) => b.remove());
    setRunning(run.ex, false);
    setAllRunButtons(false);
  }

  function runExercise(ex) {
    if (active || Python.isBusy()) return;
    const editor = ex.querySelector("textarea.editor");
    const out = ex.querySelector(".output");
    const pre = out.querySelector(".output-text");
    out.hidden = false;
    out.querySelectorAll(".error-box").forEach((b) => b.remove());
    pre.textContent = "";
    const waiting = document.createElement("span");
    waiting.className = "muted";
    waiting.textContent = Python.isReady() ? "Running…" : "Starting Python… (the first time can take a few seconds)";
    pre.appendChild(waiting);

    const run = { ex, out, pre, printed: false, chars: 0, waiting };
    active = run;
    setAllRunButtons(true);
    setRunning(ex, true);

    Python.run({
      code: editor.value,
      onText(text) {
        if (!text) return;
        clearWaiting(run);
        run.chars += text.length;
        pre.appendChild(document.createTextNode(text));
        run.printed = true;
        if (run.chars > MAX_OUTPUT_CHARS) Python.stop("too-much");
      },
      onInput(prompt, reply) {
        clearWaiting(run);
        addInputBox(pre, prompt, (value) => { run.printed = true; reply(value); });
      },
      onDone(error) {
        endExercise(run);
        if (error) {
          renderError(out, error);
        } else if (!run.printed) {
          const note = document.createElement("span");
          note.className = "muted";
          note.textContent = "Your program ran, but it didn't print anything. Did you forget print()?";
          pre.appendChild(note);
        }
      },
      onStopped(reason) {
        endExercise(run);
        const note = document.createElement("span");
        note.className = "muted";
        note.textContent = "\n" + (reason === "too-much"
          ? "Stopped: your program printed too much. Is there a loop that never ends?"
          : "Program stopped.");
        pre.appendChild(note);
      },
    });
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

  // Makes a textarea behave like a code editor: Tab indents, Enter keeps the
  // indent (and adds one after a colon), Ctrl+Enter calls onRun.
  function enhanceEditor(el, onRun) {
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
        if (onRun) onRun();
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
  }
  C2C.enhanceEditor = enhanceEditor;

  function setupSavedEditor(el, saveKey, onRun) {
    const starter = el.value;
    el.dataset.starter = starter;
    const saved = storageGet(saveKey);
    if (saved !== null) el.value = saved;
    let timer = null;
    el.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(() => storageSet(saveKey, el.value), 300);
    });
    enhanceEditor(el, onRun);
  }

  document.querySelectorAll(".exercise").forEach((ex) => {
    const id = ex.dataset.ex;
    const editor = ex.querySelector("textarea.editor");
    const saveKey = STORE_PREFIX + id;
    setupSavedEditor(editor, saveKey, () => runExercise(ex));

    ex.querySelector(".btn-run").addEventListener("click", () => runExercise(ex));
    ex.querySelector(".btn-stop").addEventListener("click", () => Python.stop("stopped"));

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

  Python.start();
})();
