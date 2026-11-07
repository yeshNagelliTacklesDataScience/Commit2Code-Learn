// Commit2Code live games: students join with a room code, and the teacher's
// projector shows a leaderboard that updates by itself. Uses Firebase
// (Realtime Database + sign-in). The security rules in Firebase decide who
// can change what; nothing secret lives in this file.
(function () {
  "use strict";

  const C2C = window.C2C;
  const DATA = window.C2C_GAMES;
  const joinApp = document.getElementById("join-app");
  if (!C2C || !DATA || !joinApp) return;

  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDrZhJSHfbA7PAfTuAX2RhCn39ooOlyaUs",
    authDomain: "commit2code-games.firebaseapp.com",
    databaseURL: "https://commit2code-games-default-rtdb.firebaseio.com",
    projectId: "commit2code-games",
    storageBucket: "commit2code-games.firebasestorage.app",
    messagingSenderId: "551122879284",
    appId: "1:551122879284:web:ce5daec504294971b7db61",
  };
  const SDK_URLS = [
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js",
    "https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js",
  ];
  const QR_URL = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
  const CODE_CHARS = "ACDEFHJKMNPRTUVWXY3479";
  const ROOM_MAX_AGE_MS = 12 * 60 * 60 * 1000;
  const SAVED_KEY = "c2c-live-player";
  const HOST_PREFS_KEY = "c2c-live-host-prefs";

  // ---------------------------------------------------------------- helpers
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

  function fmtTime(ms) {
    const total = Math.max(0, Math.round(ms / 1000));
    return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Couldn't load " + src));
      document.head.appendChild(s);
    });
  }

  function readJSON(key) {
    try { return JSON.parse(C2C.storage.get(key)); } catch (e) { return null; }
  }

  // Where this player last joined. sessionStorage belongs to this browser tab,
  // so a refresh rejoins automatically even on a shared computer.
  const savedPlayer = {
    get() {
      try { const t = JSON.parse(window.sessionStorage.getItem(SAVED_KEY)); if (t) return Object.assign({ tab: true }, t); } catch (e) { /* ignore */ }
      return readJSON(SAVED_KEY);
    },
    set(v) {
      try { window.sessionStorage.setItem(SAVED_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
      C2C.storage.set(SAVED_KEY, JSON.stringify(v));
    },
    clear() {
      try { window.sessionStorage.removeItem(SAVED_KEY); } catch (e) { /* ignore */ }
      C2C.storage.remove(SAVED_KEY);
    },
  };

  // Firebase loads only when someone uses a live game, so lessons stay fast.
  let fbReady = null;
  let serverOffset = 0;
  function connect() {
    if (fbReady) return fbReady;
    const mock = new URLSearchParams(location.search).get("firebasemock"); // for local testing only
    const urls = mock ? [mock] : SDK_URLS;
    fbReady = urls.reduce((p, u) => p.then(() => loadScript(u)), Promise.resolve()).then(() => {
      const fb = window.firebase;
      if (!fb.apps.length) fb.initializeApp(FIREBASE_CONFIG);
      fb.database().ref(".info/serverTimeOffset").on("value", (snap) => { serverOffset = snap.val() || 0; });
      return fb;
    });
    fbReady.catch(() => { fbReady = null; });
    return fbReady;
  }
  const serverNow = () => Date.now() + serverOffset;
  const TIMESTAMP = () => window.firebase.database.ServerValue.TIMESTAMP;

  function waitForAuth(fb) {
    return new Promise((resolve) => {
      const stop = fb.auth().onAuthStateChanged((user) => { stop(); resolve(user); });
    });
  }

  async function studentUser(fb) {
    let user = fb.auth().currentUser || (await waitForAuth(fb));
    if (!user) user = (await fb.auth().signInAnonymously()).user;
    return user;
  }

  const CONNECT_ERROR = "Couldn't connect to live games. Check the internet connection and try again. If this keeps happening, the network may be blocking Google's Firebase service.";

  function friendlyError(e) {
    const code = (e && e.code) || "";
    if (code.includes("permission") || /permission/i.test(e && e.message)) return "That isn't allowed. The game may have ended, or the teacher removed you.";
    if (code.includes("network")) return CONNECT_ERROR;
    return (e && e.message) || "Something went wrong. Try again.";
  }

  function cleanName(s) {
    return String(s || "").replace(/\s+/g, " ").trim().slice(0, 24);
  }

  function gameSummary(room) {
    const g = C2C.Games.GAMES[room.game];
    const topics = String(room.topics || "").split("+").filter(Boolean);
    if (room.game === "relay") {
      const ch = C2C.Games.RELAY.find((r) => r.id === room.challenge);
      return "Coding Relay · " + (ch ? ch.title : "Team challenge") + " · " + C2C.Games.topicsText(topics);
    }
    return (g ? g.title : "Game") + " · " + C2C.Games.topicsText(topics) + " · " + room.count + (room.game === "escape" ? " doors" : " rounds");
  }

  // =================================================================== JOIN
  const Join = (function () {
    let state = null; // { fb, uid, code, name, roomRef, playerRef, listeners, started }

    function render(...nodes) {
      joinApp.replaceChildren(...nodes);
    }

    function stopListening() {
      if (!state) return;
      state.listeners.forEach(([ref, ev, fn]) => ref.off(ev, fn));
      state.listeners = [];
    }

    function showForm(message, prefill) {
      stopListening();
      C2C.Games.leave();
      state = null;
      document.getElementById("tab-join").classList.remove("is-playing");
      const saved = savedPlayer.get();
      const codeInput = h("input", { type: "text", class: "text-input join-code", id: "join-code", maxLength: 5, autocomplete: "off", autocapitalize: "characters", spellcheck: false, placeholder: "ABCDE", value: (prefill && prefill.code) || "" });
      const nameInput = h("input", { type: "text", class: "text-input", id: "join-name", maxLength: 24, autocomplete: "off", placeholder: "First name, or team name for a relay", value: (prefill && prefill.name) || (saved && saved.name) || "" });
      const msg = h("p", { class: "join-msg", attrs: { role: "alert" }, text: message || "" });
      const btn = h("button", { type: "submit", class: "btn-run btn-big", text: "Join" });
      codeInput.addEventListener("input", () => {
        const pos = codeInput.selectionStart;
        codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
        codeInput.setSelectionRange(pos, pos);
      });
      const form = h("form", { class: "join-card", attrs: { novalidate: "" } },
        h("div", { class: "field" }, h("label", { class: "field-label", attrs: { for: "join-code" }, text: "Game code" }), codeInput),
        h("div", { class: "field" }, h("label", { class: "field-label", attrs: { for: "join-name" }, text: "Your name (or team name)" }), nameInput),
        h("p", { class: "join-note", text: "Use your first name or your team's name only. For a Coding Relay, one person types the team name for the whole team." }),
        msg,
        h("div", { class: "actions" }, btn));
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const code = codeInput.value.trim().toUpperCase();
        const name = cleanName(nameInput.value);
        if (code.length !== 5) { msg.textContent = "The game code has 5 letters and numbers. Check the big screen."; codeInput.focus(); return; }
        if (!name) { msg.textContent = "Type your name so your teacher knows who you are."; nameInput.focus(); return; }
        btn.disabled = true;
        btn.textContent = "Joining…";
        join(code, name).catch((err) => {
          btn.disabled = false;
          btn.textContent = "Join";
          msg.textContent = err.userMessage || friendlyError(err);
        });
      });

      const nodes = [form, h("p", { class: "teacher-link" }, "Teacher? ", h("a", { href: "#games/host", text: "Host a live game" }))];
      if (saved && saved.code && !(prefill && prefill.code)) {
        nodes.unshift(h("div", { class: "rejoin" },
          h("p", {}, "Were you in game ", h("b", { text: saved.code }), " as ", h("b", { text: saved.name }), "?"),
          h("button", { type: "button", class: "btn-ghost", text: "Rejoin", onclick: (e) => {
            e.target.disabled = true;
            join(saved.code, saved.name).catch((err) => showForm(err.userMessage || friendlyError(err), { name: saved.name }));
          } })));
      }
      render(...nodes);
      (codeInput.value ? nameInput : codeInput).focus();
    }

    function userError(text) {
      const e = new Error(text);
      e.userMessage = text;
      return e;
    }

    async function join(code, name) {
      let fb;
      try { fb = await connect(); } catch (e) { throw userError(CONNECT_ERROR); }
      const user = await studentUser(fb);
      const roomRef = fb.database().ref("rooms/" + code);
      let snap;
      try { snap = await roomRef.once("value"); } catch (e) { throw userError("No game found with code " + code + ". Check the big screen."); }
      const room = snap.val();
      if (!room || !room.status) throw userError("No game found with code " + code + ". Check the big screen.");
      if (room.status === "ended") throw userError("That game has already ended.");
      if (room.banned && room.banned[user.uid]) throw userError("Your teacher removed you from this game.");

      const playerRef = roomRef.child("players/" + user.uid);
      const existing = (room.players && room.players[user.uid]) || null;
      const record = { name: name, online: true, joinedAt: existing && existing.joinedAt ? existing.joinedAt : TIMESTAMP() };
      if (!existing) { record.done = 0; record.solved = 0; record.penalty = 0; }
      await playerRef.update(record);
      playerRef.child("online").onDisconnect().set(false);
      savedPlayer.set({ code: code, name: name });
      if (location.hash !== "#join/" + code) history.replaceState(null, "", "#join/" + code);

      stopListening();
      state = { fb, uid: user.uid, code, name, roomRef, playerRef, listeners: [], started: false, room: room, ended: false };
      listen(roomRef, "value", onRoom);
      listen(roomRef.child("banned/" + user.uid), "value", (s) => { if (s.val()) removed(); });
      showLobby(room);
    }

    function listen(ref, ev, fn) {
      ref.on(ev, fn, () => { /* permission errors after removal are expected */ });
      state.listeners.push([ref, ev, fn]);
    }

    function removed() {
      const name = state ? state.name : "";
      savedPlayer.clear();
      if (C2C.Games.isPlayingLive()) C2C.Games.forceEnd("Your teacher removed you from this game.");
      showForm("Your teacher removed you from this game.", { name: name });
    }

    function onRoom(snap) {
      if (!state) return;
      const room = snap.val();
      if (!room) {
        // Teacher closed the room.
        savedPlayer.clear();
        if (C2C.Games.isPlayingLive()) { C2C.Games.forceEnd("Your teacher closed this game."); stopListening(); state = null; return; }
        showForm("Your teacher closed that game.");
        return;
      }
      state.room = room;
      const me = room.players && room.players[state.uid];
      if (!me && state.started) { removed(); return; }
      if (room.status === "lobby") {
        if (state.started) {
          // Teacher started a new round with the same room: go back to waiting.
          C2C.Games.leave();
          state.started = false;
        }
        showLobby(room);
      } else if (room.status === "playing") {
        if (!state.started || state.startedAt !== room.startedAt) startGame(room, me);
      } else if (room.status === "ended") {
        if (C2C.Games.isPlayingLive()) C2C.Games.forceEnd("Your teacher ended the game. Look at the big screen for the results!");
        else if (!state.started) showForm("That game has ended.");
        state.ended = true;
      }
    }

    function showLobby(room) {
      const count = room.players ? Object.keys(room.players).length : 0;
      const relay = room.game === "relay";
      const countText = count + (relay ? (count === 1 ? " team" : " teams") : (count === 1 ? " player" : " players")) + " in the game";
      const existing = joinApp.querySelector(".lobby-card");
      if (existing && existing.dataset.game === room.game) {
        existing.querySelector(".lobby-count").textContent = countText;
        existing.querySelector(".lobby-info").textContent = gameSummary(room);
        return;
      }
      let team = null;
      if (relay) {
        const prev = state.team || { count: 3, names: "" };
        const countSel = h("select", { class: "select", id: "team-count" }, [2, 3, 4, 5, 6].map((n) => h("option", { value: String(n), text: n + " players", selected: n === prev.count })));
        const names = h("input", { type: "text", class: "text-input", id: "team-names", placeholder: "Maya, Jordan, Leo", autocomplete: "off", value: prev.names });
        const sync = () => { state.team = { count: Number(countSel.value), names: names.value }; };
        countSel.addEventListener("change", sync);
        names.addEventListener("input", sync);
        sync();
        team = h("div", { class: "team-setup" },
          h("p", { class: "field-label", text: "Who's on your team? You'll take turns in this order." }),
          h("div", { class: "setup-fields" },
            h("div", { class: "field" }, h("label", { class: "field-label", attrs: { for: "team-count" }, text: "Players" }), countSel),
            h("div", { class: "field field-wide" }, h("label", { class: "field-label", attrs: { for: "team-names" }, text: "Names (optional, separated by commas)" }), names)));
      }
      const card = h("div", { class: "lobby-card" },
        h("p", { class: "eyebrow-dark", text: relay ? "Your team is in!" : "You're in!" }),
        h("h2", { class: "lobby-name", text: state.name }),
        h("p", { class: "lobby-wait" }, h("span", { class: "pulse-dot", attrs: { "aria-hidden": "true" } }), "Waiting for your teacher to start the game…"),
        h("p", { class: "lobby-info", text: gameSummary(room) }),
        h("p", { class: "lobby-count", text: countText }),
        team,
        h("div", { class: "actions" }, h("button", { type: "button", class: "btn-ghost", text: "Leave game", onclick: leave })));
      card.dataset.game = room.game;
      render(card);
    }

    function teamPlayers() {
      const t = state.team || { count: 3, names: "" };
      const typed = String(t.names || "").split(",").map((x) => x.trim()).filter(Boolean);
      const list = [];
      for (let i = 0; i < t.count; i++) list.push(typed[i] || "Player " + (i + 1));
      return list;
    }

    function leave() {
      if (!state) return;
      const ref = state.playerRef;
      const name = state.name;
      stopListening();
      savedPlayer.clear();
      ref.remove().catch(() => {});
      history.replaceState(null, "", "#join");
      showForm("", { name: name });
    }

    function startGame(room, me) {
      state.started = true;
      state.startedAt = room.startedAt;
      const container = h("div", { class: "join-play" });
      render(container);
      const finished = me && me.finished;
      C2C.Games.startLive({
        container: container,
        type: room.game,
        name: state.name,
        topics: String(room.topics).split("+").filter(Boolean),
        count: room.count,
        seed: room.seed,
        startedAt: room.startedAt - serverOffset,
        resume: me ? { done: me.done || 0, solved: me.solved || 0, penalty: me.penalty || 0 } : null,
        challenge: room.challenge,
        turnSeconds: room.turnSeconds || 0,
        players: room.game === "relay" ? teamPlayers() : null,
        saveKey: state.code + "-" + room.startedAt,
        onProgress: (p) => { if (state) state.playerRef.update(p).catch(() => {}); },
        onFinish: (f) => {
          if (!state || finished) return;
          f.finishedAt = TIMESTAMP();
          state.playerRef.update(f).catch(() => {});
        },
      });
    }

    function onHash() {
      const parts = location.hash.slice(1).split("/");
      if (parts[0] !== "join") return;
      const code = (parts[1] || "").toUpperCase();
      if (state) {
        if (!code || code === state.code) { history.replaceState(null, "", "#join/" + state.code); return; }
      }
      // After a refresh, go straight back into the same game.
      const saved = savedPlayer.get();
      if (!state && saved && saved.tab && saved.code === code && saved.name) {
        render(h("p", { class: "lobby-wait" }, h("span", { class: "pulse-dot", attrs: { "aria-hidden": "true" } }), "Rejoining game " + code + "…"));
        join(code, saved.name).catch((err) => showForm(err.userMessage || friendlyError(err), { code: code, name: saved.name }));
        return;
      }
      showForm("", { code: code });
    }

    return { showForm, onHash };
  })();

  window.addEventListener("hashchange", Join.onHash);
  if (location.hash.slice(1).split("/")[0] === "join") Join.onHash();
  else Join.showForm("", {});

  // =================================================================== HOST
  const Host = (function () {
    let root = null;
    let fb = null;
    let user = null;
    let roomCode = null;
    let roomRef = null;
    let room = null;
    let roomListener = null;
    let tick = null;
    let lastFocus = null;

    function prefs() {
      return Object.assign({ game: "debug", topics: ["loops"], count: 5, perRound: 1, bonus: true, challenge: "", turnSeconds: 60 }, readJSON(HOST_PREFS_KEY) || {});
    }

    function build() {
      root = h("div", { class: "sb live-host", attrs: { role: "dialog", "aria-modal": "true", "aria-label": "Live game host" } });
      document.body.appendChild(root);
      document.addEventListener("keydown", (e) => {
        if (!root || root.hidden) return;
        if (e.key === "Escape" && !document.fullscreenElement && !["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) close();
      });
    }

    function topBar(title, extra) {
      return h("div", { class: "sb-top" },
        h("p", { class: "sb-title", text: title }),
        h("div", { class: "sb-top-right" },
          extra || null,
          user && !user.isAnonymous ? h("button", { type: "button", class: "sb-btn", id: "live-signout", text: "Sign out", onclick: signOut }) : null,
          h("button", { type: "button", class: "sb-btn", id: "live-full", text: document.fullscreenElement ? "Exit full screen" : "Full screen", onclick: () => {
            if (document.fullscreenElement) document.exitFullscreen(); else if (root.requestFullscreen) root.requestFullscreen().catch(() => {});
          } }),
          h("button", { type: "button", class: "sb-btn", id: "live-close", text: "Close", onclick: close })));
    }

    function show(...nodes) {
      root.replaceChildren(...nodes.flat().filter(Boolean));
    }

    async function open() {
      if (!root) build();
      lastFocus = document.activeElement;
      root.hidden = false;
      document.body.classList.add("sb-open");
      root.tabIndex = -1;
      root.focus();
      if (roomCode && room) { draw(); return; }
      show(topBar("Live game"), h("p", { class: "live-status", text: "Connecting…" }));
      try {
        fb = await connect();
      } catch (e) {
        show(topBar("Live game"), h("p", { class: "live-status error", text: CONNECT_ERROR }));
        return;
      }
      user = fb.auth().currentUser || (await waitForAuth(fb));
      if (!user || user.isAnonymous) signInScreen();
      else afterSignIn();
    }

    function close() {
      if (!root) return;
      root.hidden = true;
      document.body.classList.remove("sb-open");
      if (location.hash === "#games/host") history.replaceState(null, "", "#games");
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function signInScreen(message) {
      const email = h("input", { type: "email", class: "live-input", id: "live-email", autocomplete: "username", placeholder: "teacher@example.com" });
      const pass = h("input", { type: "password", class: "live-input", id: "live-pass", autocomplete: "current-password" });
      const msg = h("p", { class: "live-msg", attrs: { role: "alert" }, text: message || "" });
      const btn = h("button", { type: "submit", class: "sb-btn sb-btn-main", text: "Sign in" });
      const form = h("form", { class: "live-panel live-signin" },
        h("h2", { class: "live-h2", text: "Teacher sign-in" }),
        h("p", { class: "live-p", text: "Only the teacher account can start live games." }),
        h("label", { attrs: { for: "live-email" }, text: "Email" }), email,
        h("label", { attrs: { for: "live-pass" }, text: "Password" }), pass,
        msg,
        h("div", { class: "live-actions" }, btn),
        h("p", { class: "live-tip", text: "On a shared computer, use a private/incognito window and press Sign out when you're done." }));
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        btn.disabled = true;
        msg.textContent = "";
        try {
          // Signing in only lasts until this browser window closes.
          await fb.auth().setPersistence(window.firebase.auth.Auth.Persistence.SESSION).catch(() => {});
          user = (await fb.auth().signInWithEmailAndPassword(email.value.trim(), pass.value)).user;
          afterSignIn();
        } catch (err) {
          btn.disabled = false;
          const c = (err && err.code) || "";
          msg.textContent = /wrong-password|invalid-credential|user-not-found|invalid-email|invalid-login/.test(c)
            ? "That email or password isn't right."
            : /too-many-requests/.test(c) ? "Too many tries. Wait a minute and try again." : friendlyError(err);
        }
      });
      show(topBar("Live game"), form);
      email.focus();
    }

    async function signOut() {
      detach();
      roomCode = null; room = null;
      try { await fb.auth().signOut(); } catch (e) { /* ignore */ }
      user = null;
      signInScreen("You're signed out.");
    }

    async function afterSignIn() {
      show(topBar("Live game"), h("p", { class: "live-status", text: "Checking for open games…" }));
      let rooms = null;
      try {
        rooms = (await fb.database().ref("rooms").once("value")).val() || {};
      } catch (e) {
        show(topBar("Live game"), h("p", { class: "live-status error", text: "This account isn't allowed to host games. Sign out and use the teacher account." }));
        return;
      }
      const now = serverNow();
      const mine = [];
      Object.keys(rooms).forEach((code) => {
        const r = rooms[code];
        if (!r || !r.createdAt || now - r.createdAt > ROOM_MAX_AGE_MS) {
          fb.database().ref("rooms/" + code).remove().catch(() => {}); // tidy up old rooms
        } else if (r.status !== "ended") {
          mine.push(code);
        }
      });
      setupScreen(mine);
    }

    function setupScreen(openRooms) {
      detach();
      roomCode = null; room = null;
      const p = prefs();
      const gameSel = h("select", { class: "live-input", id: "live-game" },
        h("option", { value: "debug", text: "Debug Race", selected: p.game === "debug" }),
        h("option", { value: "escape", text: "Escape Room", selected: p.game === "escape" }),
        h("option", { value: "relay", text: "Coding Relay (teams)", selected: p.game === "relay" }));
      const chosen = new Set(p.topics);
      const challengeSel = h("select", { class: "live-input", id: "live-challenge" });
      const fillChallenges = () => {
        const keep = challengeSel.value || p.challenge;
        const list = DATA.RELAY.filter((r) => chosen.has(r.topic));
        challengeSel.replaceChildren(h("option", { value: "", text: "Surprise (random)" }),
          ...list.map((r) => h("option", { value: r.id, text: r.title + " (" + C2C.Games.topicLabel(r.topic) + ")", selected: r.id === keep })));
      };
      const pills = DATA.TOPICS.map((t) => {
        const box = h("input", { type: "checkbox", id: "live-topic-" + t.id, checked: chosen.has(t.id) });
        box.addEventListener("change", () => { if (box.checked) chosen.add(t.id); else chosen.delete(t.id); fillChallenges(); });
        return h("label", { class: "live-pill", attrs: { for: "live-topic-" + t.id } }, box, h("span", { text: t.label }));
      });
      fillChallenges();
      const countSel = h("select", { class: "live-input", id: "live-count" }, [3, 5, 8].map((n) => h("option", { value: String(n), text: String(n), selected: n === p.count })));
      const turnSel = h("select", { class: "live-input", id: "live-turn" },
        [[30, "30 seconds"], [60, "1 minute"], [90, "90 seconds"], [0, "No timer"]].map(([v, t]) => h("option", { value: String(v), text: t, selected: v === p.turnSeconds })));
      const perSel = h("select", { class: "live-input", id: "live-per" },
        [[1, "1 point"], [2, "2 points"], [0, "No points"]].map(([v, t]) => h("option", { value: String(v), text: t, selected: v === p.perRound })));
      const bonusBox = h("input", { type: "checkbox", id: "live-bonus", checked: p.bonus });
      const msg = h("p", { class: "live-msg", attrs: { role: "alert" } });
      const countField = h("div", { class: "live-field" }, h("label", { attrs: { for: "live-count" }, text: "Rounds / doors" }), countSel);
      const challengeField = h("div", { class: "live-field" }, h("label", { attrs: { for: "live-challenge" }, text: "Challenge (every team gets the same one)" }), challengeSel);
      const turnField = h("div", { class: "live-field" }, h("label", { attrs: { for: "live-turn" }, text: "Time per turn" }), turnSel);
      const perLabel = h("label", { attrs: { for: "live-per" } });
      const relayNote = h("p", { class: "live-p", text: "Each team joins on one computer with their team name, then players take turns adding one line." });
      const syncGame = () => {
        const relay = gameSel.value === "relay";
        countField.hidden = relay;
        challengeField.hidden = !relay;
        turnField.hidden = !relay;
        relayNote.hidden = !relay;
        perLabel.textContent = relay ? "Points for finishing the program" : "Points for each round solved";
      };
      gameSel.addEventListener("change", syncGame);
      const createBtn = h("button", { type: "button", class: "sb-btn sb-btn-main live-big", text: "Create game", onclick: () => {
        const topics = DATA.TOPICS.map((t) => t.id).filter((id) => chosen.has(id));
        if (!topics.length) { msg.textContent = "Pick at least one topic."; return; }
        const settings = { game: gameSel.value, topics: topics, count: Number(countSel.value), perRound: Number(perSel.value), bonus: bonusBox.checked, challenge: challengeSel.value, turnSeconds: Number(turnSel.value) };
        if (settings.game === "relay" && !DATA.RELAY.some((r) => topics.includes(r.topic))) { msg.textContent = "There are no relay challenges for those topics yet."; return; }
        C2C.storage.set(HOST_PREFS_KEY, JSON.stringify(settings));
        createBtn.disabled = true;
        createRoom(settings).catch((e) => { createBtn.disabled = false; msg.textContent = friendlyError(e); });
      } });

      show(
        topBar("Live game"),
        h("div", { class: "live-panel" },
          openRooms.length ? h("div", { class: "live-resume" },
            h("p", { text: "You have a game that's still open:" }),
            openRooms.map((code) => h("button", { type: "button", class: "sb-btn", text: "Go back to " + code, onclick: () => attach(code) }))) : null,
          h("h2", { class: "live-h2", text: "Start a live game" }),
          h("div", { class: "live-grid" },
            h("div", { class: "live-field" }, h("label", { attrs: { for: "live-game" }, text: "Game" }), gameSel),
            countField,
            challengeField,
            turnField,
            h("div", { class: "live-field" }, perLabel, perSel)),
          h("fieldset", { class: "live-fieldset" }, h("legend", { text: "Topics" }), h("div", { class: "live-pills" }, pills)),
          h("label", { class: "live-check", attrs: { for: "live-bonus" } }, bonusBox, h("span", { text: "Bonus for finishing first: 1st +5, 2nd +3, 3rd +2" })),
          relayNote,
          msg,
          h("div", { class: "live-actions" }, createBtn)));
      syncGame();
    }

    function newCode() {
      let c = "";
      const buf = new Uint32Array(5);
      (window.crypto || window.msCrypto).getRandomValues(buf);
      for (let i = 0; i < 5; i++) c += CODE_CHARS[buf[i] % CODE_CHARS.length];
      return c;
    }

    async function createRoom(settings) {
      let code = null;
      for (let i = 0; i < 6 && !code; i++) {
        const c = newCode();
        const existing = await fb.database().ref("rooms/" + c).once("value");
        if (!existing.exists()) code = c;
      }
      if (!code) throw new Error("Couldn't make a game code. Try again.");
      const extra = {};
      if (settings.game === "relay") {
        const list = DATA.RELAY.filter((r) => settings.topics.includes(r.topic));
        const pick = list.find((r) => r.id === settings.challenge) || list[Math.floor(Math.random() * list.length)];
        extra.challenge = pick.id;
        extra.turnSeconds = settings.turnSeconds;
        settings.topics = [pick.topic];
        settings.count = 1;
      } else {
        const pool = (settings.game === "escape" ? DATA.ESCAPE : DATA.DEBUG).filter((r) => settings.topics.includes(r.topic));
        settings.count = Math.max(1, Math.min(settings.count, pool.length));
      }
      await fb.database().ref("rooms/" + code).set(Object.assign({
        host: user.uid,
        createdAt: TIMESTAMP(),
        status: "lobby",
        game: settings.game,
        topics: settings.topics.join("+"),
        count: settings.count,
        perRound: settings.perRound,
        bonus: settings.bonus,
        seed: Math.floor(Math.random() * 2147483646) + 1,
      }, extra));
      attach(code);
    }

    function attach(code) {
      detach();
      roomCode = code;
      roomRef = fb.database().ref("rooms/" + code);
      roomListener = roomRef.on("value", (snap) => {
        room = snap.val();
        if (!room) { roomCode = null; afterSignIn(); return; }
        draw();
      }, () => { show(topBar("Live game"), h("p", { class: "live-status error", text: "Lost access to this game." })); });
      clearInterval(tick);
      tick = setInterval(() => {
        const el = document.getElementById("live-clock");
        if (el && room && room.startedAt) el.textContent = fmtTime(serverNow() - room.startedAt);
      }, 500);
    }

    function detach() {
      if (roomRef && roomListener) roomRef.off("value", roomListener);
      roomRef = null; roomListener = null;
      clearInterval(tick);
    }

    // ------------------------------------------------------------- scoring
    function standings() {
      const players = room.players || {};
      const total = room.count;
      const list = Object.keys(players).map((uid) => Object.assign({ uid: uid }, players[uid]));
      const finishers = list.filter((p) => p.finished && (p.solved || 0) >= total).sort((a, b) => a.finished - b.finished);
      const bonuses = [5, 3, 2];
      list.forEach((p) => {
        p.solved = p.solved || 0;
        p.done = p.done || 0;
        const place = finishers.indexOf(p);
        p.place = place >= 0 ? place + 1 : 0;
        p.points = (room.perRound || 0) * p.solved + (room.bonus && place >= 0 && place < 3 ? bonuses[place] : 0);
      });
      list.sort((a, b) =>
        b.points - a.points ||
        (a.place || 999) - (b.place || 999) ||
        b.done - a.done ||
        String(a.name).localeCompare(String(b.name)));
      return list;
    }

    function joinUrl(code) {
      return location.origin + location.pathname + "#join/" + code;
    }

    function qrNode(text) {
      const box = h("div", { class: "live-qr", attrs: { role: "img", "aria-label": "QR code to join the game" } });
      const draw = () => {
        try {
          const qr = window.qrcode(0, "M");
          qr.addData(text);
          qr.make();
          box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
        } catch (e) { box.remove(); }
      };
      if (window.qrcode) draw();
      else loadScript(QR_URL).then(draw).catch(() => box.remove());
      return box;
    }

    function removePlayer(p) {
      if (!window.confirm("Remove " + p.name + " from this game?")) return;
      const updates = {};
      updates["banned/" + p.uid] = true;
      updates["players/" + p.uid] = null;
      roomRef.update(updates).catch(() => {});
    }

    function draw() {
      if (!room || !root || root.hidden) return;
      if (room.status === "lobby") drawLobby();
      else if (room.status === "playing") drawLive();
      else drawResults();
    }

    function drawLobby() {
      const players = room.players ? Object.keys(room.players).map((uid) => Object.assign({ uid: uid }, room.players[uid])) : [];
      players.sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
      const startBtn = h("button", { type: "button", class: "sb-btn sb-btn-main live-big", id: "live-start", text: "Start game", disabled: players.length === 0, onclick: () => {
        startBtn.disabled = true;
        roomRef.update({ status: "playing", startedAt: TIMESTAMP() }).catch(() => { startBtn.disabled = false; });
      } });
      show(
        topBar("Live game"),
        h("div", { class: "live-lobby" },
          h("div", { class: "live-join-box" },
            h("p", { class: "live-join-label", text: "Go to" }),
            h("p", { class: "live-join-url", text: location.host + (location.pathname === "/" ? "" : location.pathname) }),
            h("p", { class: "live-join-label", text: "click Join game, and enter" }),
            h("p", { class: "live-code", id: "live-code", text: roomCode }),
            h("p", { class: "live-join-sub", text: gameSummary(room) })),
          qrNode(joinUrl(roomCode))),
        h("div", { class: "live-players" },
          h("p", { class: "live-count", text: players.length + (room.game === "relay" ? (players.length === 1 ? " team joined" : " teams joined") : (players.length === 1 ? " player joined" : " players joined")) }),
          h("div", { class: "live-chips" },
            players.length ? players.map((p) => h("span", { class: "live-chip" + (p.online === false ? " offline" : "") },
              h("span", { text: p.name }),
              h("button", { type: "button", class: "live-chip-x", attrs: { "aria-label": "Remove " + p.name }, onclick: () => removePlayer(p), text: "×" })))
              : h("p", { class: "live-empty", text: "Waiting for players…" }))),
        h("div", { class: "sb-bottom" },
          h("div", { class: "sb-bottom-left" },
            startBtn,
            h("button", { type: "button", class: "sb-btn", text: "Cancel game", onclick: () => {
              if (window.confirm("Cancel this game? Everyone will be sent back to the Join screen.")) roomRef.remove().catch(() => {});
            } }))));
    }

    function drawLive() {
      const list = standings();
      const total = room.count;
      const doneCount = list.filter((p) => p.finished).length;
      show(
        topBar("Live game", h("p", { class: "live-mini-code" }, "Code ", h("b", { text: roomCode }))),
        h("div", { class: "live-head" },
          h("p", { class: "live-game-name", text: gameSummary(room) }),
          h("p", { class: "sb-time live-clock", id: "live-clock", text: fmtTime(serverNow() - (room.startedAt || serverNow())) }),
          h("p", { class: "live-finished-count", text: doneCount + " of " + list.length + " finished" })),
        h("ol", { class: "live-board" },
          list.map((p, i) => h("li", { class: "live-row" + (p.place && p.place <= 3 ? " medal-" + p.place : "") + (p.online === false ? " offline" : "") },
            h("span", { class: "live-rank", text: String(i + 1) }),
            h("span", { class: "live-row-name", text: p.name }),
            h("span", { class: "live-progress", attrs: { "aria-label": p.done + " of " + total + " done" } },
              h("span", { class: "live-progress-fill", attrs: { style: "width:" + Math.round((Math.min(p.done, total) / total) * 100) + "%" } })),
            h("span", { class: "live-row-status", text: p.finished ? (p.place ? ["", "1st", "2nd", "3rd"][p.place] || "Done" : "Done") + " · " + fmtTime(p.finished) : room.game === "relay" ? "Building…" : p.done + " / " + total }),
            h("span", { class: "live-points", text: p.points + " pts" }),
            h("button", { type: "button", class: "live-row-x", attrs: { "aria-label": "Remove " + p.name }, onclick: () => removePlayer(p), text: "×" })))),
        h("div", { class: "sb-bottom" },
          h("div", { class: "sb-bottom-left" },
            h("button", { type: "button", class: "sb-btn sb-btn-main", id: "live-end", text: "End game", onclick: () => {
              if (window.confirm("End the game for everyone and show the results?")) roomRef.update({ status: "ended", endedAt: TIMESTAMP() }).catch(() => {});
            } })),
          h("p", { class: "sb-keys", text: "Points: " + (room.perRound || 0) + (room.game === "relay" ? " for finishing" : " per round solved") + (room.bonus ? " · finishing bonus 1st +5, 2nd +3, 3rd +2" : "") })));
    }

    function drawResults() {
      const list = standings();
      const podium = list.slice(0, 3);
      const order = [1, 0, 2].filter((i) => podium[i]); // 2nd, 1st, 3rd
      const confetti = [];
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches && list.length) {
        const colors = ["#ff9f1c", "#1f6fb2", "#2b8a3e", "#9c36b5", "#c92a2a", "#0b7285"];
        for (let i = 0; i < 70; i++) confetti.push(h("span", { class: "confetti", attrs: { style: "left:" + Math.random() * 100 + "%;background:" + colors[i % colors.length] + ";animation-delay:" + (Math.random() * 1.5).toFixed(2) + "s;animation-duration:" + (2.5 + Math.random() * 2).toFixed(2) + "s" } }));
      }
      show(
        topBar("Results"),
        h("div", { class: "live-podium" },
          order.map((i) => h("div", { class: "podium-step podium-" + (i + 1) },
            h("p", { class: "podium-name", text: podium[i].name }),
            h("p", { class: "podium-points", text: podium[i].points + " pts" }),
            h("div", { class: "podium-block" }, h("span", { text: String(i + 1) }))))),
        list.length > 3 ? h("ol", { class: "live-board live-board-small", attrs: { start: "4" } },
          list.slice(3).map((p, i) => h("li", { class: "live-row" },
            h("span", { class: "live-rank", text: String(i + 4) }),
            h("span", { class: "live-row-name", text: p.name }),
            h("span", { class: "live-row-status", text: room.game === "relay" ? (p.finished ? "Finished" : "Not finished") : p.done + " / " + room.count }),
            h("span", { class: "live-points", text: p.points + " pts" })))) : null,
        list.length ? null : h("p", { class: "live-status", text: "Nobody played this game." }),
        h("div", { class: "sb-bottom" },
          h("div", { class: "sb-bottom-left" },
            h("button", { type: "button", class: "sb-btn sb-btn-main", id: "live-again", text: "Play again with the same players", onclick: () => {
              const updates = { status: "lobby", startedAt: null, endedAt: null, seed: Math.floor(Math.random() * 2147483646) + 1 };
              Object.keys(room.players || {}).forEach((uid) => {
                updates["players/" + uid + "/done"] = 0;
                updates["players/" + uid + "/solved"] = 0;
                updates["players/" + uid + "/penalty"] = 0;
                updates["players/" + uid + "/finished"] = null;
                updates["players/" + uid + "/finishedAt"] = null;
              });
              roomRef.update(updates).catch(() => {});
            } }),
            h("button", { type: "button", class: "sb-btn", id: "live-new", text: "New game", onclick: () => {
              roomRef.remove().catch(() => {});
            } }))),
        confetti);
    }

    document.addEventListener("fullscreenchange", () => { if (root && !root.hidden) draw(); });
    return { open, close };
  })();

  // Game Room menu card + #games/host route
  function addHostCard() {
    const menu = document.querySelector("#games-app .game-menu");
    if (!menu || menu.querySelector(".game-card-live")) return;
    const card = h("button", { type: "button", class: "game-card game-card-teacher game-card-live", onclick: () => Host.open() },
      h("span", { class: "game-card-icon" }, h("span", { class: "live-dot", attrs: { "aria-hidden": "true" } })),
      h("h2", { text: "Host a live game" }),
      h("p", { text: "For the teacher: students join with a code and the leaderboard updates by itself." }),
      h("span", { class: "game-card-go", text: "Start →" }));
    menu.insertBefore(card, menu.firstChild);
  }
  new MutationObserver(addHostCard).observe(document.getElementById("games-app"), { childList: true, subtree: false });
  addHostCard();

  function onHostRoute() {
    if (location.hash === "#games/host") Host.open();
  }
  window.addEventListener("hashchange", onHostRoute);
  onHostRoute();

  C2C.Live = { Host: Host, Join: Join };
})();
