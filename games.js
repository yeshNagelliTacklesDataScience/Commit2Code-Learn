// Commit2Code Game Room: Debug Race, Escape Room, Coding Relay, and the
// projector scoreboard. Rounds live in game-data.js.
(function () {
  "use strict";

  const C2C = window.C2C;
  const DATA = window.C2C_GAMES;
  const app = document.getElementById("games-app");
  if (!app) return;
  if (!C2C || !C2C.Python || !DATA) {
    // Usually means the browser kept an old copy of a file after an update.
    app.innerHTML = '<p class="not-yet">The games didn\'t finish loading. Refresh the page with <b>Ctrl + Shift + R</b> (or <b>Cmd + Shift + R</b> on a Mac).</p>';
    return;
  }
  const Python = C2C.Python;

  const HINT_PENALTY_MS = 30000;
  const WRONG_PENALTY_MS = 15000;
  const RUN_TIMEOUT_MS = 5000;
  const MAX_GAME_OUTPUT = 20000;

  // ---------------------------------------------------------------- helpers
  // h("div", { class: "x", text: "hi", onclick: fn, attrs: { "aria-label": "…" } }, child, child)
  function h(tag, props, ...children) {
    const node = document.createElement(tag);
    const p = props || {};
    Object.keys(p).forEach((k) => {
      const v = p[k];
      if (v === undefined || v === null || v === false) return;
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k === "attrs") Object.keys(v).forEach((a) => node.setAttribute(a, v[a]));
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node[k] = v;
    });
    children.flat().forEach((c) => {
      if (c === null || c === undefined || c === false) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  // Shuffles a copy of the list. With the same random() (from seededRandom),
  // every computer gets the same order, which live games rely on.
  function shuffle(list, random) {
    const rnd = random || Math.random;
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function seededRandom(seed) {
    let t = seed >>> 0;
    return function () {
      t = (t + 0x6d2b79f5) >>> 0;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Where game screens are drawn: the Game Room normally, the Join tab for live games.
  let stageRoot = app;

  const CODE_CHARS = "ACDEFHJKMNPRTUVWXY3479";
  function checkCode(key) {
    let hash = 2166136261;
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    let code = "";
    for (let i = 0; i < 3; i++) {
      code += CODE_CHARS[hash % CODE_CHARS.length];
      hash = Math.floor(hash / CODE_CHARS.length);
    }
    return code;
  }

  function fmtTime(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  const topicLabel = (id) => (DATA.TOPICS.find((t) => t.id === id) || { label: id }).label;
  const topicsText = (ids) => ids.map(topicLabel).join(" + ");
  const topicsKey = (ids) => DATA.TOPICS.map((t) => t.id).filter((id) => ids.includes(id)).join("+");

  // Output comparison
  function normOutput(s) {
    return String(s).replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").replace(/\n+$/, "");
  }
  function normGuess(s) {
    return String(s).toLowerCase().replace(/["']/g, "").replace(/[,\s]+/g, " ").trim();
  }

  // Simple Python coloring for code shown in games
  const TOKEN_RE = /("[^"\n]*"?|'[^'\n]*'?)|(#[^\n]*)|\b(if|elif|else|for|while|in|break|and|or|not|import)\b|\b(True|False|None)\b|\b(print|input|int|str|range|float|len)\b|\b(\d+(?:\.\d+)?)\b/g;
  function codeBlock(code) {
    const pre = h("pre", { class: "code" });
    let last = 0;
    code.replace(TOKEN_RE, (match, str, comment, kw, bool, fn, num, offset) => {
      if (offset > last) pre.appendChild(document.createTextNode(code.slice(last, offset)));
      const cls = str ? "s" : comment ? "c" : kw ? "k" : bool ? "n" : fn ? "f" : "n";
      pre.appendChild(h("span", { class: cls, text: match }));
      last = offset + match.length;
      return match;
    });
    if (last < code.length) pre.appendChild(document.createTextNode(code.slice(last)));
    return pre;
  }

  // Icons (inline SVG strings are fixed, not user content)
  function icon(name, size) {
    const s = size || 20;
    const paths = {
      bug: '<path d="M8 2l1.9 1.9M16 2l-1.9 1.9M9 7.1V7a3 3 0 0 1 6 0v.1"></path><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z"></path><path d="M12 20v-9M6 13H2M22 13h-4M3 21c0-2.1 1.6-3.8 3.5-4M21 21c0-2.1-1.6-3.8-3.5-4M3 7c0 2.1 1.8 3.8 4 4M21 7c0 2.1-1.8 3.8-4 4"></path>',
      lock: '<rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 8 0v4"></path>',
      unlock: '<rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V7a4 4 0 0 1 7.5-2"></path>',
      relay: '<circle cx="6" cy="6" r="3"></circle><circle cx="18" cy="18" r="3"></circle><path d="M9 6h6a3 3 0 0 1 3 3v6M15 18H9a3 3 0 0 1-3-3V9"></path>',
      board: '<rect x="3" y="4" width="18" height="14" rx="2"></rect><path d="M8 22h8M12 18v4M7 13l3-3 2 2 5-5"></path>',
      clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>',
      crown: '<path d="M3 18h18l-2-10-5 4-2-6-2 6-5-4z"></path>',
      check: '<path d="M5 12l5 5 9-10"></path>',
      x: '<path d="M6 6l12 12M18 6L6 18"></path>',
    };
    const span = h("span", { class: "icon", attrs: { "aria-hidden": "true" } });
    span.innerHTML = '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + paths[name] + "</svg>";
    return span;
  }

  const TEAM_NAMES = ["Bug Squashers", "Code Crushers", "Syntax Squad", "Loop Legends", "Python Pack", "Byte Force", "The Debuggers", "Pixel Pirates"];
  const randomTeamName = () => TEAM_NAMES[Math.floor(Math.random() * TEAM_NAMES.length)];

  const ESCAPE_HINTS = {
    print: "Go line by line. Each print() starts a new line, and + glues text together exactly, spaces and all.",
    variables: "Draw a box for each variable. When a variable gets a new value, cross out the old one.",
    types: "Quotes mean text, no quotes mean a number. Dividing with / always gives a decimal.",
    conditionals: "Work out whether each condition is True or False. Only the first True branch in an if/elif/else runs.",
    loops: "Make a little table: write down the loop variable and any totals after each trip through the loop.",
  };

  // ------------------------------------------------------------ game list
  const GAMES = {
    debug: {
      title: "Debug Race",
      icon: "bug",
      blurb: "Fix broken code as fast as you can. The site checks your fix automatically.",
      how: ["Each round shows broken code and what it should print.", "Fix it and press Run & check.", "Hints help, but add 30 seconds to your time."],
    },
    escape: {
      title: "Escape Room",
      icon: "lock",
      blurb: "You're locked in the Python Lab! Predict what the code prints to unlock each door.",
      how: ["Read the code, then type exactly what it will print.", "Wrong guesses add 15 seconds. Hints add 30.", "Unlock every door to escape."],
    },
    relay: {
      title: "Coding Relay",
      icon: "relay",
      blurb: "Build a program together. Each player adds one line, then passes the keyboard.",
      how: ["The banner shows whose turn it is.", "Add ONE line, then press Done to pass to the next player.", "When you think it's finished, press Submit to check it."],
    },
  };

  // Every check code the site can produce, so the scoreboard can confirm one.
  const CODE_BOOK = (function () {
    const book = {};
    const add = (key, label) => { const c = checkCode(key); if (!book[c]) book[c] = label; };
    DATA.DEBUG.forEach((r) => add("round:" + r.id, "Debug Race round solved (" + topicLabel(r.topic) + ")"));
    DATA.RELAY.forEach((r) => add("relay:" + r.id, "Coding Relay complete: " + r.title));
    const ids = DATA.TOPICS.map((t) => t.id);
    for (let mask = 1; mask < 1 << ids.length; mask++) {
      const chosen = ids.filter((_, i) => mask & (1 << i));
      add("done:debug:" + chosen.join("+"), "Debug Race finished (" + topicsText(chosen) + ")");
      add("done:escape:" + chosen.join("+"), "Escape Room escaped (" + topicsText(chosen) + ")");
    }
    return book;
  })();

  // --------------------------------------------------------------- routing
  let session = null; // the game being played right now

  function parseRoute() {
    const parts = location.hash.slice(1).split("/");
    if (parts[0] !== "games") return null;
    return { game: parts[1] || "", topics: (parts[2] || "").split("+").filter(Boolean) };
  }

  function onRoute() {
    const r = parseRoute();
    if (!r) return;
    if (r.game === "scoreboard") { Scoreboard.open(); return; }
    const key = r.game + "/" + topicsKey(r.topics);
    if (session && !session.finished && !session.live) {
      // Coming back to the Game Room (from another tab) keeps the game going.
      if (key === session.routeKey || r.game === "") {
        history.replaceState(null, "", "#games/" + session.routeKey);
        return;
      }
      if (!window.confirm("Leave the game in progress?")) {
        history.replaceState(null, "", "#games/" + session.routeKey);
        return;
      }
    }
    if (!(session && session.live)) endSession();
    if (GAMES[r.game]) renderSetup(r.game, r.topics);
    else renderMenu();
  }
  window.addEventListener("hashchange", onRoute);

  function endSession() {
    if (session) {
      clearInterval(session.tick);
      clearInterval(session.turnTick);
      if (Python.isBusy() && session.running) Python.stop("left");
    }
    session = null;
  }

  function goTo(hash) {
    if (location.hash === "#" + hash) onRoute();
    else location.hash = hash;
  }

  // ------------------------------------------------------------------ menu
  function renderMenu() {
    stageRoot = app;
    document.getElementById("tab-games").classList.remove("is-playing");
    app.replaceChildren(
      h("div", { class: "game-menu" },
        Object.keys(GAMES).map((id) => {
          const g = GAMES[id];
          return h("a", { class: "game-card", href: "#games/" + id },
            h("span", { class: "game-card-icon" }, icon(g.icon, 28)),
            h("h2", { text: g.title }),
            h("p", { text: g.blurb }),
            h("span", { class: "game-card-go", text: "Play →" }));
        }),
        h("button", { type: "button", class: "game-card game-card-teacher", onclick: () => Scoreboard.open() },
          h("span", { class: "game-card-icon" }, icon("board", 28)),
          h("h2", { text: "Projector scoreboard" }),
          h("p", { text: "For the teacher: team scores, a big timer, and a place to check codes." }),
          h("span", { class: "game-card-go", text: "Open →" }))
      )
    );
  }

  // ----------------------------------------------------------------- setup
  function renderSetup(gameId, preselected) {
    stageRoot = app;
    document.getElementById("tab-games").classList.remove("is-playing");
    const g = GAMES[gameId];
    const pool = gameId === "debug" ? DATA.DEBUG : gameId === "escape" ? DATA.ESCAPE : DATA.RELAY;
    const available = DATA.TOPICS.filter((t) => pool.some((r) => r.topic === t.id));
    const chosen = new Set(preselected.filter((id) => available.some((t) => t.id === id)));
    if (!chosen.size && available.length) chosen.add(available[available.length - 1].id);

    const linkOut = h("code", { class: "share-link" });
    const errorMsg = h("p", { class: "setup-error", attrs: { role: "alert" } });
    const updateLink = () => {
      const key = topicsKey(Array.from(chosen));
      linkOut.textContent = location.origin + location.pathname + "#games/" + gameId + (key ? "/" + key : "");
    };

    const topicBoxes = available.map((t) => {
      const box = h("input", { type: "checkbox", id: "topic-" + t.id, checked: chosen.has(t.id) });
      box.addEventListener("change", () => {
        if (box.checked) chosen.add(t.id); else chosen.delete(t.id);
        updateLink();
        history.replaceState(null, "", "#games/" + gameId + "/" + topicsKey(Array.from(chosen)));
      });
      return h("label", { class: "topic-pill", attrs: { for: "topic-" + t.id } }, box, h("span", { text: t.label }));
    });

    const teamInput = h("input", { type: "text", class: "text-input", id: "team-name", value: randomTeamName(), maxLength: 30, autocomplete: "off" });
    const fields = [h("div", { class: "field" }, h("label", { class: "field-label", attrs: { for: "team-name" }, text: "Team name" }), teamInput)];

    let roundsSelect = null, playersSelect = null, namesInput = null, turnSelect = null, challengeSelect = null;
    if (gameId === "debug" || gameId === "escape") {
      roundsSelect = h("select", { class: "select", id: "round-count" },
        [3, 5, 8].map((n) => h("option", { value: String(n), text: n + (gameId === "escape" ? " doors" : " rounds"), selected: n === 5 })));
      fields.push(h("div", { class: "field" }, h("label", { class: "field-label", attrs: { for: "round-count" }, text: gameId === "escape" ? "Doors to unlock" : "Rounds" }), roundsSelect));
    } else {
      playersSelect = h("select", { class: "select", id: "player-count" },
        [2, 3, 4, 5, 6].map((n) => h("option", { value: String(n), text: n + " players", selected: n === 4 })));
      turnSelect = h("select", { class: "select", id: "turn-time" },
        [[30, "30 seconds"], [60, "1 minute"], [90, "90 seconds"], [0, "No timer"]].map(([v, t]) => h("option", { value: String(v), text: t, selected: v === 60 })));
      namesInput = h("input", { type: "text", class: "text-input", id: "player-names", placeholder: "Maya, Jordan, Leo, Sam", autocomplete: "off" });
      challengeSelect = h("select", { class: "select", id: "challenge" });
      const fillChallenges = () => {
        const list = DATA.RELAY.filter((r) => chosen.has(r.topic));
        challengeSelect.replaceChildren(h("option", { value: "", text: "Surprise us!" }),
          ...list.map((r) => h("option", { value: r.id, text: r.title + " (" + topicLabel(r.topic) + ")" })));
      };
      fillChallenges();
      topicBoxes.forEach((lab) => lab.querySelector("input").addEventListener("change", fillChallenges));
      fields.push(
        h("div", { class: "field" }, h("label", { class: "field-label", attrs: { for: "player-count" }, text: "Players" }), playersSelect),
        h("div", { class: "field" }, h("label", { class: "field-label", attrs: { for: "turn-time" }, text: "Time per turn" }), turnSelect),
        h("div", { class: "field field-wide" }, h("label", { class: "field-label", attrs: { for: "player-names" }, text: "Player names (optional, separated by commas)" }), namesInput),
        h("div", { class: "field field-wide" }, h("label", { class: "field-label", attrs: { for: "challenge" }, text: "Challenge" }), challengeSelect));
    }

    const start = () => {
      const topics = Array.from(chosen);
      if (!topics.length) { errorMsg.textContent = "Pick at least one topic."; return; }
      errorMsg.textContent = "";
      const team = teamInput.value.trim() || "Team";
      const routeKey = gameId + "/" + topicsKey(topics);
      if (gameId === "debug") startDebug(team, topics, Number(roundsSelect.value), routeKey);
      else if (gameId === "escape") startEscape(team, topics, Number(roundsSelect.value), routeKey);
      else {
        const count = Number(playersSelect.value);
        const typed = namesInput.value.split(",").map((s) => s.trim()).filter(Boolean);
        const players = [];
        for (let i = 0; i < count; i++) players.push(typed[i] || "Player " + (i + 1));
        let challenge = DATA.RELAY.find((r) => r.id === challengeSelect.value);
        if (!challenge) {
          const list = DATA.RELAY.filter((r) => chosen.has(r.topic));
          challenge = list[Math.floor(Math.random() * list.length)];
        }
        startRelay(team, players, Number(turnSelect.value), challenge, routeKey);
      }
    };

    updateLink();
    app.replaceChildren(
      h("div", { class: "game-setup" },
        h("a", { class: "back-link", href: "#games", text: "← All practice games" }),
        h("div", { class: "setup-head" }, h("span", { class: "game-card-icon" }, icon(g.icon, 28)), h("h2", { text: g.title })),
        h("p", { class: "setup-blurb", text: g.blurb }),
        h("ol", { class: "how-list" }, g.how.map((t) => h("li", { text: t }))),
        h("fieldset", { class: "topic-set" },
          h("legend", { class: "field-label", text: "Topics (pick more than one for a mixed review)" }),
          h("div", { class: "topic-pills" }, topicBoxes)),
        h("div", { class: "setup-fields" }, fields),
        errorMsg,
        h("div", { class: "actions" }, h("button", { type: "button", class: "btn-run btn-big", onclick: start, text: "Start game" })),
        h("p", { class: "share-note" }, "Link to this game with these topics: ", linkOut)
      )
    );
  }

  // ------------------------------------------------------- shared pieces
  // opts (live games only): { container, seed, startedAt, resume, live: { onProgress, onFinish } }
  function newSession(type, team, topics, routeKey, opts) {
    const o = opts || {};
    endSession();
    stageRoot = o.container || app;
    session = { type, team, topics, routeKey, started: o.startedAt || Date.now(), penalty: 0, hints: 0, finished: false, running: false, live: o.live || null, done: 0 };
    if (!o.live) history.replaceState(null, "", "#games/" + routeKey);
    const panel = stageRoot.closest(".tab-panel");
    if (panel) {
      panel.classList.add("is-playing");
      window.scrollTo(0, panel.offsetTop - 8);
    }
    return session;
  }

  // Tells a live game's leaderboard how far this player has gotten.
  function report(s, solvedCount) {
    if (s.live && s.live.onProgress) s.live.onProgress({ done: s.done, solved: solvedCount, penalty: s.penalty });
  }

  function elapsed(s) {
    return (s.finishedAt || Date.now()) - s.started + s.penalty;
  }

  function gameBar(s, title, progressEl, extra) {
    const clock = h("span", { class: "game-clock" }, icon("clock", 18), h("span", { class: "clock-text", text: "0:00" }));
    s.tick = setInterval(() => { clock.querySelector(".clock-text").textContent = fmtTime(elapsed(s)); }, 250);
    const quit = s.live ? null : h("button", { type: "button", class: "btn-ghost btn-small", text: "Quit", onclick: () => {
      if (s.finished || window.confirm("Quit this game?")) { endSession(); goTo("games"); }
    } });
    return h("div", { class: "game-bar" },
      h("div", { class: "game-bar-left" },
        h("p", { class: "game-bar-title", text: title }),
        h("p", { class: "game-bar-team", text: s.team + " · " + topicsText(s.topics) })),
      progressEl,
      h("div", { class: "game-bar-right" }, clock, extra || null, quit));
  }

  // Runs code without a person typing. Feeds "inputs" automatically.
  // Calls done({ transcript, stdout, error, stopped }).
  function runSilently(code, inputs, display, done) {
    const queue = (inputs || []).slice();
    const result = { transcript: "", stdout: "", error: null, stopped: null };
    if (display) display.textContent = "";
    const add = (text, cls) => {
      result.transcript += text;
      if (display) {
        if (cls) display.appendChild(h("span", { class: cls, text: text }));
        else display.appendChild(document.createTextNode(text));
      }
    };
    if (session) session.running = true;
    const ok = Python.run({
      code: code,
      timeoutMs: RUN_TIMEOUT_MS,
      onText(text) {
        result.stdout += text;
        add(text);
        if (result.transcript.length > MAX_GAME_OUTPUT) Python.stop("too-much");
      },
      onInput(prompt, reply) {
        add(prompt);
        if (queue.length) {
          const v = queue.shift();
          add(v, "you");
          add("\n");
          reply(v);
        } else if (display) {
          C2C.addInputBox(display, "", (v) => { result.transcript += v + "\n"; reply(v); });
        } else {
          reply("");
        }
      },
      onDone(error) {
        if (session) session.running = false;
        result.error = error;
        done(result);
      },
      onStopped(reason) {
        if (session) session.running = false;
        result.stopped = reason;
        done(result);
      },
    });
    if (!ok) {
      if (session) session.running = false;
      result.error = { name: "Busy", message: "Another program is still running. Wait for it to finish or press Stop.", line: null };
      done(result);
    }
  }

  function stoppedMessage(reason) {
    if (reason === "timeout") return "Your program didn't finish within 5 seconds. Is there a loop that never ends?";
    if (reason === "too-much") return "Your program printed way too much. Is there a loop that never ends?";
    return "Program stopped.";
  }

  function solvedBanner(title, code, extra) {
    return h("div", { class: "solved-banner", attrs: { role: "status" } },
      h("span", { class: "solved-icon" }, icon("check", 28)),
      h("div", { class: "solved-text" },
        h("p", { class: "solved-title", text: title }),
        code ? h("p", { class: "solved-code" }, "Check code: ", h("b", { text: code })) : null,
        extra || null));
  }

  function finishScreen(s, heading, lines, code, onAgain) {
    clearInterval(s.tick);
    s.finished = true;
    s.finishedAt = s.finishedAt || Date.now();
    if (s.live) code = null; // live games score themselves
    stageRoot.replaceChildren(
      h("div", { class: "finish" },
        h("p", { class: "eyebrow", text: GAMES[s.type].title }),
        h("h2", { class: "finish-title", text: heading }),
        h("p", { class: "finish-team", text: s.team }),
        h("div", { class: "finish-stats" },
          h("div", { class: "stat" }, h("p", { class: "stat-num", text: fmtTime(elapsed(s)) }), h("p", { class: "stat-label", text: "Total time" })),
          lines.map(([num, label]) => h("div", { class: "stat" }, h("p", { class: "stat-num", text: String(num) }), h("p", { class: "stat-label", text: label })))),
        code ? h("div", { class: "finish-code" }, h("p", { text: "Show your teacher this check code" }), h("p", { class: "finish-code-big", text: code })) : null,
        s.live
          ? h("p", { class: "finish-live", text: s.live.finishNote || "Look at the big screen to see where you placed!" })
          : h("div", { class: "actions" },
            h("button", { type: "button", class: "btn-run", onclick: onAgain, text: "Play again" }),
            h("a", { class: "btn-ghost", href: "#games", text: "Back to practice games" }))));
  }

  // ----------------------------------------------------------- DEBUG RACE
  function startDebug(team, topics, count, routeKey, opts) {
    const o = opts || {};
    const pool = shuffle(DATA.DEBUG.filter((r) => topics.includes(r.topic)), o.seed ? seededRandom(o.seed) : null);
    const rounds = pool.slice(0, Math.min(count, pool.length));
    const s = newSession("debug", team, topics, routeKey, o);
    s.rounds = rounds;
    s.index = 0;
    s.solved = [];
    s.skipped = 0;
    if (o.resume) {
      s.index = s.done = Math.min(o.resume.done || 0, rounds.length);
      s.solved = new Array(Math.min(o.resume.solved || 0, s.index)).fill("earlier");
      s.skipped = s.index - s.solved.length;
      s.penalty = o.resume.penalty || 0;
    }

    const progress = h("p", { class: "game-progress" });
    const skipBtn = h("button", { type: "button", class: "btn-ghost btn-small", text: "Skip round", onclick: () => nextRound(false) });
    const bar = gameBar(s, "Debug Race", progress, skipBtn);
    const stage = h("div", { class: "game-stage" });
    stageRoot.replaceChildren(h("div", { class: "game-play" }, bar, stage));

    function nextRound(solved) {
      if (!solved) {
        s.skipped++;
        s.done = s.index + 1;
        report(s, s.solved.length);
      }
      s.index++;
      if (s.index >= s.rounds.length) return finish();
      showRound();
    }

    function finish() {
      s.finishedAt = s.finishedAt || Date.now();
      if (s.live && s.live.onFinish) s.live.onFinish({ done: s.rounds.length, solved: s.solved.length, penalty: s.penalty, finished: Math.max(1, Math.round(elapsed(s))) });
      const code = s.solved.length === s.rounds.length ? checkCode("done:debug:" + topicsKey(topics)) : null;
      finishScreen(s, s.solved.length === s.rounds.length ? "Race finished!" : "Race over!",
        [[s.solved.length + " / " + s.rounds.length, "Rounds fixed"], [s.hints, "Hints used"]],
        code, () => startDebug(team, topics, count, routeKey));
    }

    function showRound() {
      const round = s.rounds[s.index];
      progress.textContent = "Round " + (s.index + 1) + " of " + s.rounds.length;
      const editor = h("textarea", { class: "editor", id: "race-editor", rows: Math.max(4, round.code.split("\n").length + 2), spellcheck: false, autocapitalize: "off", autocomplete: "off", value: round.code });
      const out = h("div", { class: "output", hidden: true }, h("p", { class: "output-label", text: "Your output" }));
      const outPre = h("pre", { class: "output-text", attrs: { "aria-live": "polite" } });
      out.appendChild(outPre);
      const result = h("div", { class: "round-result" });
      const hint = h("p", { class: "hint", hidden: true, text: round.hint || "Read the error message carefully. It tells you the line number." });
      const hintBtn = h("button", { type: "button", class: "btn-ghost", text: "Hint (+30 sec)" });
      hintBtn.addEventListener("click", () => {
        if (hint.hidden) { hint.hidden = false; s.penalty += HINT_PENALTY_MS; s.hints++; hintBtn.disabled = true; hintBtn.textContent = "Hint shown"; }
      });
      const runBtn = h("button", { type: "button", class: "btn-run", text: "Run & check" });
      const resetBtn = h("button", { type: "button", class: "btn-ghost", text: "Reset code", onclick: () => { editor.value = round.code; editor.focus(); } });

      const check = () => {
        if (s.running) return;
        runBtn.disabled = true;
        out.hidden = false;
        out.querySelectorAll(".error-box").forEach((b) => b.remove());
        result.replaceChildren();
        outPre.textContent = Python.isReady() ? "Running…" : "Starting Python…";
        runSilently(editor.value, round.inputs, outPre, (r) => {
          runBtn.disabled = false;
          if (r.stopped) {
            outPre.appendChild(h("span", { class: "muted", text: "\n" + stoppedMessage(r.stopped) }));
            result.replaceChildren(h("p", { class: "not-yet", text: "Not fixed yet. Keep going!" }));
            return;
          }
          if (r.error) {
            C2C.renderError(out, r.error);
            result.replaceChildren(h("p", { class: "not-yet", text: "Still a bug in there. Read the error and try again!" }));
            return;
          }
          if (normOutput(r.transcript) === normOutput(round.expected)) {
            s.solved.push(round.id);
            s.done = s.index + 1;
            report(s, s.solved.length);
            const code = checkCode("round:" + round.id);
            const nextBtn = h("button", { type: "button", class: "btn-run", text: s.index + 1 < s.rounds.length ? "Next round →" : "See results", onclick: () => nextRound(true) });
            result.replaceChildren(solvedBanner("Round " + (s.index + 1) + " fixed!", code), h("div", { class: "actions" }, nextBtn));
            runBtn.disabled = true;
            editor.readOnly = true;
            nextBtn.focus();
          } else {
            if (!r.transcript) outPre.appendChild(h("span", { class: "muted", text: "(nothing was printed)" }));
            result.replaceChildren(h("p", { class: "not-yet", text: "It runs, but the output doesn't match the goal yet. Compare them line by line." }));
          }
        });
      };
      runBtn.addEventListener("click", check);
      C2C.enhanceEditor(editor, check);

      stage.replaceChildren(
        h("div", { class: "round-card" },
          h("div", { class: "round-head" },
            h("span", { class: "badge", text: topicLabel(round.topic) }),
            h("h3", { text: "Round " + (s.index + 1) + ": fix the bug" })),
          h("div", { class: "goal" }, h("p", { class: "field-label", text: "Goal: make it print exactly" }), h("pre", { class: "goal-text", text: round.expected })),
          round.inputs ? h("p", { class: "round-note", text: "When the program asks a question, the site will type: " + round.inputs.join(", ") }) : null,
          h("label", { class: "field-label", attrs: { for: "race-editor" }, text: "Broken code" }),
          editor,
          h("div", { class: "actions" }, runBtn, hintBtn, resetBtn),
          hint, out, result));
      editor.focus();
    }

    if (s.index >= s.rounds.length) finish();
    else showRound();
  }

  // ---------------------------------------------------------- ESCAPE ROOM
  function startEscape(team, topics, count, routeKey, opts) {
    const o = opts || {};
    const pool = DATA.ESCAPE.filter((r) => topics.includes(r.topic));
    const picked = shuffle(pool, o.seed ? seededRandom(o.seed) : null).slice(0, Math.min(count, pool.length));
    picked.sort((a, b) => (a.level || 1) - (b.level || 1)); // easy doors first
    const s = newSession("escape", team, topics, routeKey, o);
    s.rooms = picked;
    s.index = 0;
    s.wrong = 0;
    if (o.resume) {
      s.index = s.done = Math.min(o.resume.done || 0, picked.length);
      s.penalty = o.resume.penalty || 0;
    }

    const locks = h("div", { class: "lock-row", attrs: { "aria-hidden": "true" } });
    const progressText = h("p", { class: "game-progress" });
    const progress = h("div", { class: "escape-progress" }, locks, progressText);
    const bar = gameBar(s, "Escape Room", progress);
    const stage = h("div", { class: "game-stage" });
    stageRoot.replaceChildren(h("div", { class: "game-play" }, bar, stage));

    function drawLocks() {
      locks.replaceChildren(...s.rooms.map((_, i) => h("span", { class: "lock" + (i < s.index ? " open" : i === s.index ? " current" : "") }, icon(i < s.index ? "unlock" : "lock", 22))));
      progressText.textContent = "Door " + Math.min(s.index + 1, s.rooms.length) + " of " + s.rooms.length;
    }

    function finish() {
      s.index = s.rooms.length;
      drawLocks();
      s.finishedAt = s.finishedAt || Date.now();
      if (s.live && s.live.onFinish) s.live.onFinish({ done: s.rooms.length, solved: s.rooms.length, penalty: s.penalty, finished: Math.max(1, Math.round(elapsed(s))) });
      finishScreen(s, "You escaped!", [[s.rooms.length, "Doors unlocked"], [s.wrong, "Wrong guesses"], [s.hints, "Hints used"]],
        checkCode("done:escape:" + topicsKey(topics)), () => startEscape(team, topics, count, routeKey));
    }

    function showRoom() {
      drawLocks();
      const room = s.rooms[s.index];
      let answer = null; // filled in by running the code
      let waiters = [];
      runSilently(room.code, [], null, (r) => {
        answer = r.error || r.stopped ? null : r.stdout;
        const w = waiters; waiters = []; w.forEach((f) => f());
      });
      const whenAnswer = (f) => { if (answer !== null || !s.running) f(); else waiters.push(f); };

      const guess = h("textarea", { class: "guess-box", id: "escape-guess", rows: 3, spellcheck: false, autocapitalize: "off", autocomplete: "off", placeholder: "Type the output here. Put each line on its own line." });
      const feedback = h("div", { class: "round-result", attrs: { "aria-live": "polite" } });
      const hint = h("p", { class: "hint", hidden: true, text: ESCAPE_HINTS[room.topic] || "Go through the code one line at a time." });
      const hintBtn = h("button", { type: "button", class: "btn-ghost", text: "Hint (+30 sec)" });
      hintBtn.addEventListener("click", () => {
        if (hint.hidden) { hint.hidden = false; s.penalty += HINT_PENALTY_MS; s.hints++; hintBtn.disabled = true; hintBtn.textContent = "Hint shown"; }
      });
      const tryBtn = h("button", { type: "button", class: "btn-run", text: "Try the lock" });
      const card = h("div", { class: "round-card escape-card" });

      const attempt = () => {
        if (!guess.value.trim()) { guess.focus(); return; }
        tryBtn.disabled = true;
        whenAnswer(() => {
          tryBtn.disabled = false;
          if (answer === null) {
            feedback.replaceChildren(h("p", { class: "not-yet", text: "This lock is jammed. Press Try again in a moment." }));
            return;
          }
          if (normGuess(guess.value) === normGuess(answer)) {
            tryBtn.disabled = true;
            guess.readOnly = true;
            s.done = s.index + 1;
            report(s, s.done);
            const last = s.index + 1 >= s.rooms.length;
            const nextBtn = h("button", { type: "button", class: "btn-run", text: last ? "Escape! →" : "Next door →", onclick: () => { s.index++; if (s.index >= s.rooms.length) finish(); else showRoom(); } });
            feedback.replaceChildren(solvedBanner("Unlocked!", null, h("pre", { class: "answer-reveal", text: answer.replace(/\n$/, "") })), h("div", { class: "actions" }, nextBtn));
            nextBtn.focus();
          } else {
            s.wrong++;
            s.penalty += WRONG_PENALTY_MS;
            card.classList.remove("shake");
            void card.offsetWidth;
            card.classList.add("shake");
            feedback.replaceChildren(h("p", { class: "not-yet", text: "The lock won't budge. +15 seconds. Check your answer and try again!" }));
          }
        });
      };
      tryBtn.addEventListener("click", attempt);
      guess.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); attempt(); } });

      card.append(
        h("div", { class: "round-head" },
          h("span", { class: "badge", text: topicLabel(room.topic) + " · Level " + (room.level || 1) }),
          h("h3", { text: "Door " + (s.index + 1) })),
        h("p", { class: "ex-task", text: "The lock opens when you type exactly what this code prints." }),
        codeBlock(room.code),
        h("label", { class: "field-label", attrs: { for: "escape-guess" }, text: "What will it print?" }),
        guess,
        h("div", { class: "actions" }, tryBtn, hintBtn),
        hint, feedback);
      stage.replaceChildren(card);
      guess.focus();
    }

    if (s.index >= s.rooms.length) finish();
    else showRoom();
  }

  // ---------------------------------------------------------- CODING RELAY
  function startRelay(team, players, turnSeconds, challenge, routeKey, opts) {
    const o = opts || {};
    const s = newSession("relay", team, [challenge.topic], routeKey, o);
    s.players = players;
    s.turn = 0;
    s.turnSeconds = turnSeconds;
    // Live relays keep the team's code in this tab, so a refresh doesn't lose it.
    const saveKey = o.saveKey ? "c2c-relay-" + o.saveKey : null;
    const loadSaved = () => { try { return saveKey ? JSON.parse(window.sessionStorage.getItem(saveKey)) : null; } catch (e) { return null; } };
    const storeSaved = (code) => { try { if (saveKey) window.sessionStorage.setItem(saveKey, JSON.stringify({ code: code, turn: s.turn })); } catch (e) { /* ignore */ } };
    const saved = loadSaved();
    if (saved) s.turn = saved.turn || 0;

    const progress = h("p", { class: "game-progress", text: challenge.title });
    const bar = gameBar(s, "Coding Relay", progress);

    const turnName = h("p", { class: "turn-name" });
    const turnTimer = h("p", { class: "turn-timer" });
    const turnMsg = h("p", { class: "turn-msg", attrs: { "aria-live": "polite" } });
    const doneBtn = h("button", { type: "button", class: "btn-run btn-big", text: "Done: pass to next player" });
    const banner = h("div", { class: "turn-banner", attrs: { role: "status" } },
      h("div", {}, turnName, turnMsg), h("div", { class: "turn-right" }, turnTimer, doneBtn));

    const starter = "# Team " + team + ": " + challenge.title + "\n# Each player adds ONE line below.\n";
    const editor = h("textarea", { class: "editor", id: "relay-editor", rows: 12, spellcheck: false, autocapitalize: "off", autocomplete: "off", value: saved && saved.code ? saved.code : starter });
    editor.addEventListener("input", () => storeSaved(editor.value));
    const out = h("div", { class: "output", hidden: true }, h("p", { class: "output-label", text: "Output" }));
    const outPre = h("pre", { class: "output-text", attrs: { "aria-live": "polite" } });
    out.appendChild(outPre);
    const results = h("div", { class: "round-result" });
    const testBtn = h("button", { type: "button", class: "btn-ghost", text: "Test run" });
    const stopBtn = h("button", { type: "button", class: "btn-stop", hidden: true, text: "Stop" });
    const submitBtn = h("button", { type: "button", class: "btn-run", text: "Submit program" });

    const codeLines = (code) => code.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;
    let linesAtTurnStart = codeLines(starter);

    function beginTurn() {
      const who = s.players[s.turn % s.players.length];
      turnName.textContent = who + ", your turn!";
      turnMsg.textContent = "Add one line, then press Done.";
      banner.classList.remove("times-up");
      linesAtTurnStart = codeLines(editor.value);
      clearInterval(s.turnTick);
      if (s.turnSeconds) {
        const ends = Date.now() + s.turnSeconds * 1000;
        const draw = () => {
          const left = ends - Date.now();
          turnTimer.textContent = fmtTime(left);
          banner.classList.toggle("hurry", left <= 10000);
          if (left <= 0) {
            clearInterval(s.turnTick);
            nextTurn("Time's up! Pass the keyboard.");
          }
        };
        draw();
        s.turnTick = setInterval(draw, 250);
      } else {
        turnTimer.textContent = "";
      }
      editor.focus();
    }

    function nextTurn(message) {
      s.turn++;
      storeSaved(editor.value);
      beginTurn();
      if (message) {
        turnMsg.textContent = message + " Add one line, then press Done.";
        banner.classList.add("times-up");
      }
    }

    doneBtn.addEventListener("click", () => {
      const added = codeLines(editor.value) - linesAtTurnStart;
      if (added > 1 && !doneBtn.dataset.warned) {
        doneBtn.dataset.warned = "1";
        turnMsg.textContent = "You added " + added + " lines! The rule is one line per turn. Press Done again to pass anyway.";
        return;
      }
      delete doneBtn.dataset.warned;
      nextTurn();
    });

    function setRunningUi(running) {
      testBtn.disabled = running;
      submitBtn.disabled = running;
      stopBtn.hidden = !running;
    }

    testBtn.addEventListener("click", () => {
      if (s.running) return;
      out.hidden = false;
      out.querySelectorAll(".error-box").forEach((b) => b.remove());
      results.replaceChildren();
      outPre.textContent = "";
      setRunningUi(true);
      s.running = true;
      let printed = false;
      const started = Python.run({
        code: editor.value,
        onText(t) { outPre.appendChild(document.createTextNode(t)); printed = true; if (outPre.textContent.length > MAX_GAME_OUTPUT) Python.stop("too-much"); },
        onInput(prompt, reply) { C2C.addInputBox(outPre, prompt, reply); },
        onDone(err) {
          s.running = false; setRunningUi(false);
          outPre.querySelectorAll("input.stdin").forEach((b) => b.remove());
          if (err) C2C.renderError(out, err);
          else if (!printed) outPre.appendChild(h("span", { class: "muted", text: "(nothing was printed yet)" }));
        },
        onStopped(reason) {
          s.running = false; setRunningUi(false);
          outPre.querySelectorAll("input.stdin").forEach((b) => b.remove());
          outPre.appendChild(h("span", { class: "muted", text: "\n" + stoppedMessage(reason) }));
        },
      });
      if (!started) {
        s.running = false;
        setRunningUi(false);
        outPre.textContent = "Another program is still running. Wait a moment and try again.";
      }
    });
    stopBtn.addEventListener("click", () => Python.stop("stopped"));

    function evaluate(code, r) {
      const c = challenge.check || {};
      const plain = code.split("\n").map((l) => l.replace(/#.*$/, "")).join("\n");
      const uses = (w) => (/^\w+$/.test(w) ? new RegExp("\\b" + w + "\\b").test(plain) : plain.includes(w));
      const checks = [{ label: "Runs without errors", ok: !r.error && !r.stopped }];
      (c.mustUse || []).forEach((w) => checks.push({ label: "Uses " + w, ok: uses(w) }));
      if (c.mustUseAny) checks.push({ label: "Uses " + c.mustUseAny.join(" or "), ok: c.mustUseAny.some(uses) });
      if (c.minLines) checks.push({ label: "At least " + c.minLines + " lines of code", ok: codeLines(code) >= c.minLines });
      if (c.minOutputLines) checks.push({ label: "Prints at least " + c.minOutputLines + " line" + (c.minOutputLines > 1 ? "s" : ""), ok: r.stdout.split("\n").filter((l) => l.trim()).length >= c.minOutputLines });
      if (c.outputIncludes) checks.push({ label: "Output includes " + c.outputIncludes + (challenge.inputs ? " (when the answer is " + challenge.inputs[0] + ")" : ""), ok: r.transcript.includes(c.outputIncludes) });
      if (c.expected) checks.push({ label: "Output matches the goal exactly", ok: normOutput(r.transcript) === normOutput(c.expected) });
      return checks;
    }

    submitBtn.addEventListener("click", () => {
      if (s.running) return;
      out.hidden = false;
      out.querySelectorAll(".error-box").forEach((b) => b.remove());
      results.replaceChildren(h("p", { class: "muted-text", text: "Checking…" }));
      setRunningUi(true);
      const code = editor.value;
      runSilently(code, challenge.inputs || [], outPre, (r) => {
        setRunningUi(false);
        if (r.error) C2C.renderError(out, r.error);
        if (r.stopped) outPre.appendChild(h("span", { class: "muted", text: "\n" + stoppedMessage(r.stopped) }));
        const checks = evaluate(code, r);
        const list = h("ul", { class: "check-list" }, checks.map((ch) =>
          h("li", { class: ch.ok ? "ok" : "no" }, icon(ch.ok ? "check" : "x", 18), h("span", { text: (ch.ok ? "" : "Not yet: ") + ch.label }))));
        if (checks.every((ch) => ch.ok)) {
          clearInterval(s.turnTick);
          s.finishedAt = Date.now();
          const code3 = checkCode("relay:" + challenge.id);
          editor.readOnly = true;
          doneBtn.disabled = true;
          submitBtn.disabled = true;
          if (s.live) {
            if (s.live.onFinish) s.live.onFinish({ done: 1, solved: 1, penalty: 0, finished: Math.max(1, Math.round(elapsed(s))) });
            results.replaceChildren(list, solvedBanner("Program complete in " + fmtTime(elapsed(s)) + "!", null,
              h("p", { class: "finish-live-small", text: "Look at the big screen to see where your team placed!" })));
          } else {
            results.replaceChildren(list, solvedBanner("Program complete in " + fmtTime(elapsed(s)) + "!", code3),
              h("div", { class: "actions" },
                h("button", { type: "button", class: "btn-run", text: "Play again", onclick: () => startRelay(team, players, turnSeconds, challenge, routeKey) }),
                h("a", { class: "btn-ghost", href: "#games", text: "Back to practice games" })));
          }
          s.finished = true;
          clearInterval(s.tick);
        } else {
          results.replaceChildren(list, h("p", { class: "not-yet", text: "Almost! Keep passing the keyboard and fix what's missing." }));
        }
      });
    });

    C2C.enhanceEditor(editor, () => testBtn.click());

    stageRoot.replaceChildren(
      h("div", { class: "game-play" }, bar,
        h("div", { class: "game-stage" },
          banner,
          h("div", { class: "round-card" },
            h("div", { class: "round-head" }, h("span", { class: "badge", text: topicLabel(challenge.topic) }), h("h3", { text: challenge.title })),
            h("p", { class: "ex-task", text: challenge.goal }),
            h("div", { class: "goal" },
              h("p", { class: "field-label", text: challenge.check && challenge.check.expected ? "It must print exactly" : "Example output (yours can be different)" }),
              h("pre", { class: "goal-text", text: challenge.example })),
            h("p", { class: "round-note", text: "Players: " + players.join(" → ") }),
            h("label", { class: "field-label", attrs: { for: "relay-editor" }, text: "Team code" }),
            editor,
            h("div", { class: "actions" }, testBtn, stopBtn, submitBtn),
            out, results))));
    if (o.resume && o.resume.done >= 1) {
      // This team already finished before a refresh.
      s.finished = true;
      clearInterval(s.tick);
      editor.readOnly = true;
      doneBtn.disabled = true;
      submitBtn.disabled = true;
      banner.hidden = true;
      results.replaceChildren(solvedBanner("Your team already finished this program!", null,
        h("p", { class: "finish-live-small", text: "Look at the big screen to see where your team placed!" })));
      return;
    }
    beginTurn();
  }

  // ----------------------------------------------------------- SCOREBOARD
  const Scoreboard = (function () {
    const KEY = "c2c-scoreboard";
    const COLORS = ["#1f6fb2", "#c2410c", "#2b8a3e", "#9c36b5", "#c92a2a", "#0b7285", "#5f3dc4", "#8a6300"];
    let state = load();
    let root = null;
    let tick = null;
    let lastFocus = null;

    function defaultState() {
      return {
        teams: TEAM_NAMES.slice(0, 4).map((name, i) => ({ name, score: 0, color: COLORS[i] })),
        timer: { duration: 5 * 60000, remaining: 5 * 60000, running: false, endAt: 0 },
      };
    }
    function load() {
      try {
        const saved = JSON.parse(C2C.storage.get(KEY));
        if (saved && Array.isArray(saved.teams) && saved.timer) {
          saved.timer.running = false; // never resume a timer after a refresh
          return saved;
        }
      } catch (e) { /* ignore */ }
      return defaultState();
    }
    function save() { C2C.storage.set(KEY, JSON.stringify(state)); }

    function remaining() {
      const t = state.timer;
      return t.running ? Math.max(0, t.endAt - Date.now()) : t.remaining;
    }

    function beep() {
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx();
        [0, 0.35, 0.7].forEach((at) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.value = 880;
          g.gain.value = 0.2;
          o.connect(g); g.connect(ctx.destination);
          o.start(ctx.currentTime + at);
          o.stop(ctx.currentTime + at + 0.2);
        });
      } catch (e) { /* no sound available */ }
    }

    function setTimer(ms) {
      state.timer = { duration: ms, remaining: ms, running: false, endAt: 0 };
      save(); draw();
    }
    function toggleTimer() {
      const t = state.timer;
      if (t.running) { t.remaining = remaining(); t.running = false; }
      else {
        if (t.remaining <= 0) t.remaining = t.duration;
        t.endAt = Date.now() + t.remaining; t.running = true;
      }
      save(); draw();
    }
    function addTime(ms) {
      const t = state.timer;
      if (t.running) t.endAt += ms; else t.remaining += ms;
      save(); draw();
    }

    function changeScore(i, delta) {
      const team = state.teams[i];
      if (!team) return;
      team.score += delta;
      save(); draw();
      const tile = root && root.querySelectorAll(".sb-tile")[i];
      if (tile) { tile.classList.remove("bump"); void tile.offsetWidth; tile.classList.add("bump"); }
    }

    function showWinner() {
      if (!state.teams.length) return;
      const top = Math.max(...state.teams.map((t) => t.score));
      const winners = state.teams.filter((t) => t.score === top);
      const text = winners.length === 1 ? winners[0].name + " win!" : "It's a tie: " + winners.map((w) => w.name).join(" & ") + "!";
      const layer = h("div", { class: "sb-winner", onclick: () => layer.remove() },
        h("div", { class: "sb-winner-card" }, icon("crown", 64), h("p", { class: "sb-winner-text", text: text }), h("p", { class: "sb-winner-sub", text: top + " points" })));
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        for (let i = 0; i < 90; i++) {
          layer.appendChild(h("span", { class: "confetti", attrs: { style: "left:" + Math.random() * 100 + "%;background:" + COLORS[i % COLORS.length] + ";animation-delay:" + (Math.random() * 1.5).toFixed(2) + "s;animation-duration:" + (2.5 + Math.random() * 2).toFixed(2) + "s" } }));
        }
      }
      root.appendChild(layer);
      setTimeout(() => layer.remove(), 9000);
    }

    function checkTyped(input, resultEl) {
      const code = input.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (!code) return;
      const label = CODE_BOOK[code];
      resultEl.className = "sb-code-result " + (label ? "ok" : "no");
      resultEl.textContent = label ? "✓ " + code + " is real: " + label : "✗ " + code + " doesn't match any game";
    }

    function build() {
      root = h("div", { class: "sb", attrs: { role: "dialog", "aria-modal": "true", "aria-label": "Projector scoreboard" } });
      document.addEventListener("keydown", (e) => { if (root && !root.hidden) onKey(e); });
      document.body.appendChild(root);
    }

    function draw() {
      if (!root) return;
      const active = document.activeElement;
      const activeId = active && root.contains(active) ? active.id : null;
      const t = state.timer;
      const left = remaining();
      const top = state.teams.length ? Math.max(...state.teams.map((x) => x.score)) : 0;

      const codeInput = h("input", { type: "text", class: "sb-code-input", id: "sb-code", placeholder: "K7P", maxLength: 6, autocomplete: "off", attrs: { "aria-label": "Check code" } });
      const codeResult = h("p", { class: "sb-code-result", attrs: { "aria-live": "polite" } });
      codeInput.addEventListener("keydown", (e) => { if (e.key === "Enter") checkTyped(codeInput, codeResult); });

      root.replaceChildren(
        h("div", { class: "sb-top" },
          h("p", { class: "sb-title", text: "Scoreboard" }),
          h("div", { class: "sb-timer" + (t.running ? " running" : "") + (left <= 10000 && t.running ? " hurry" : "") },
            h("p", { class: "sb-time", id: "sb-time", text: fmtTime(left) }),
            h("div", { class: "sb-timer-buttons" },
              [1, 3, 5, 10].map((m) => h("button", { type: "button", class: "sb-btn", id: "sb-preset-" + m, text: m + " min", onclick: () => setTimer(m * 60000) })),
              h("button", { type: "button", class: "sb-btn", id: "sb-plus30", text: "+30s", onclick: () => addTime(30000) }),
              h("button", { type: "button", class: "sb-btn sb-btn-main", id: "sb-startstop", text: t.running ? "Pause" : "Start", onclick: toggleTimer }),
              h("button", { type: "button", class: "sb-btn", id: "sb-reset-timer", text: "Reset", onclick: () => setTimer(t.duration) }))),
          h("div", { class: "sb-top-right" },
            h("button", { type: "button", class: "sb-btn", id: "sb-full", text: document.fullscreenElement ? "Exit full screen" : "Full screen", onclick: () => {
              if (document.fullscreenElement) document.exitFullscreen(); else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
            } }),
            h("button", { type: "button", class: "sb-btn", id: "sb-close", text: "Close", onclick: close }))),
        h("div", { class: "sb-grid sb-count-" + state.teams.length },
          state.teams.map((team, i) => {
            const nameInput = h("input", { type: "text", class: "sb-name", id: "sb-name-" + i, value: team.name, maxLength: 24, attrs: { "aria-label": "Team " + (i + 1) + " name" } });
            nameInput.addEventListener("change", () => { team.name = nameInput.value.trim() || "Team " + (i + 1); save(); });
            return h("div", { class: "sb-tile", attrs: { style: "background:" + team.color } },
              h("div", { class: "sb-tile-top" },
                h("span", { class: "sb-key", text: String(i + 1) }),
                top > 0 && team.score === top ? h("span", { class: "sb-crown", attrs: { title: "In the lead" } }, icon("crown", 28)) : null,
                h("button", { type: "button", class: "sb-remove", id: "sb-remove-" + i, attrs: { "aria-label": "Remove " + team.name }, onclick: () => { state.teams.splice(i, 1); save(); draw(); } }, icon("x", 18))),
              nameInput,
              h("p", { class: "sb-score", text: String(team.score), attrs: { "aria-live": "polite" } }),
              h("div", { class: "sb-score-buttons" },
                h("button", { type: "button", class: "sb-btn", id: "sb-minus-" + i, text: "−1", attrs: { "aria-label": "Take 1 point from " + team.name }, onclick: () => changeScore(i, -1) }),
                h("button", { type: "button", class: "sb-btn sb-btn-main", id: "sb-plus-" + i, text: "+1", attrs: { "aria-label": "Give 1 point to " + team.name }, onclick: () => changeScore(i, 1) }),
                h("button", { type: "button", class: "sb-btn", id: "sb-plus2-" + i, text: "+2", attrs: { "aria-label": "Give 2 points to " + team.name }, onclick: () => changeScore(i, 2) })));
          })),
        h("div", { class: "sb-bottom" },
          h("div", { class: "sb-bottom-left" },
            h("button", { type: "button", class: "sb-btn", id: "sb-add", text: "+ Add team", disabled: state.teams.length >= 8, onclick: () => {
              const i = state.teams.length;
              const used = state.teams.map((x) => x.name);
              state.teams.push({ name: TEAM_NAMES.find((n) => !used.includes(n)) || "Team " + (i + 1), score: 0, color: COLORS.find((c) => !state.teams.some((x) => x.color === c)) || COLORS[i % 8] });
              save(); draw();
            } }),
            h("button", { type: "button", class: "sb-btn", id: "sb-zero", text: "Reset scores", onclick: () => { if (window.confirm("Set every team's score back to 0?")) { state.teams.forEach((x) => { x.score = 0; }); save(); draw(); } } }),
            h("button", { type: "button", class: "sb-btn sb-btn-main", id: "sb-winner", text: "Show winner", onclick: showWinner })),
          h("div", { class: "sb-check" },
            h("label", { attrs: { for: "sb-code" }, text: "Check a code" }), codeInput,
            h("button", { type: "button", class: "sb-btn", id: "sb-check-btn", text: "Check", onclick: () => checkTyped(codeInput, codeResult) }),
            codeResult),
          h("p", { class: "sb-keys", text: "Keys: 1–8 add a point · Shift + 1–8 take one away · Space starts/pauses the timer · Esc closes" })));
      if (activeId) {
        const again = document.getElementById(activeId);
        if (again) again.focus();
      }
    }

    function onTick() {
      if (!root) return;
      const t = state.timer;
      const timeEl = document.getElementById("sb-time");
      const left = remaining();
      if (timeEl) timeEl.textContent = fmtTime(left);
      const timerBox = root.querySelector(".sb-timer");
      if (timerBox) timerBox.classList.toggle("hurry", t.running && left <= 10000);
      if (t.running && left <= 0) {
        t.running = false;
        t.remaining = 0;
        save();
        draw();
        root.classList.remove("times-up");
        void root.offsetWidth;
        root.classList.add("times-up");
        beep();
      }
    }

    function onKey(e) {
      const tag = (e.target.tagName || "").toLowerCase();
      if (e.key === "Escape") { if (!document.fullscreenElement) close(); return; }
      if (tag === "input" || tag === "textarea") return;
      const m = /^Digit([1-8])$/.exec(e.code);
      if (m && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        changeScore(Number(m[1]) - 1, e.shiftKey ? -1 : 1);
        return;
      }
      if (e.code === "Space" && tag !== "button") { e.preventDefault(); toggleTimer(); }
    }

    function open() {
      if (!root) build();
      lastFocus = document.activeElement;
      state = load();
      root.hidden = false;
      document.body.classList.add("sb-open");
      draw();
      clearInterval(tick);
      tick = setInterval(onTick, 200);
      root.tabIndex = -1;
      root.focus();
    }

    function close() {
      if (!root) return;
      if (state.timer.running) { state.timer.remaining = remaining(); state.timer.running = false; save(); }
      root.hidden = true;
      document.body.classList.remove("sb-open");
      clearInterval(tick);
      if (location.hash === "#games/scoreboard") history.replaceState(null, "", "#games");
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    document.addEventListener("fullscreenchange", () => { if (root && !root.hidden) draw(); });

    return { open, close };
  })();

  C2C.Scoreboard = Scoreboard;

  // Used by live.js to play Debug Race / Escape Room inside the Join tab.
  C2C.Games = {
    GAMES: GAMES,
    RELAY: DATA.RELAY,
    topicLabel: topicLabel,
    topicsText: topicsText,
    startLive(o) {
      const opts = {
        container: o.container,
        seed: o.seed,
        startedAt: o.startedAt,
        resume: o.resume,
        live: { onProgress: o.onProgress, onFinish: o.onFinish },
      };
      if (o.type === "escape") startEscape(o.name, o.topics, o.count, "live", opts);
      else if (o.type === "relay") {
        const challenge = DATA.RELAY.find((r) => r.id === o.challenge) || DATA.RELAY[0];
        opts.saveKey = o.saveKey;
        startRelay(o.name, o.players && o.players.length ? o.players : ["Player 1", "Player 2", "Player 3"], o.turnSeconds || 0, challenge, "live", opts);
      } else startDebug(o.name, o.topics, o.count, "live", opts);
    },
    // The teacher ended the game while this player was still going.
    forceEnd(message) {
      const s = session;
      if (!s || !s.live) return;
      if (!s.finished) {
        if (Python.isBusy() && s.running) Python.stop("left");
        clearInterval(s.turnTick);
        s.live.finishNote = message;
        if (s.type === "relay") {
          finishScreen(s, "Time's up!", [["Not yet", "Program finished"]], null, null);
        } else {
          const total = s.rounds ? s.rounds.length : s.rooms.length;
          const solved = s.solved ? s.solved.length : s.done;
          finishScreen(s, "Time's up!", [[solved + " / " + total, s.type === "escape" ? "Doors unlocked" : "Rounds fixed"]], null, null);
        }
      }
      session = null;
    },
    leave() {
      if (session && session.live) endSession();
    },
    isPlayingLive: () => !!(session && session.live && !session.finished),
  };
  C2C.checkCodeBook = CODE_BOOK;

  // First render
  if (parseRoute()) onRoute();
  else renderMenu();
})();
