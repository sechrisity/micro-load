/* Rep Ledger app: rendering, events and storage. Training rules live in logic.js. */
(function () {
  "use strict";
  const RL = window.RL;
  const VERSION = "0.1.0";
  const CONSENT_VERSION = "1";
  const LS = "repledger.state";
  const PREFS = "repledger.prefs";

  /* ---------- helpers ---------- */
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Date.now().toString(36) + Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
  const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const today = () => iso(new Date());
  const fmtDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }); };
  const fw = RL.fw;
  const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));
  const label = (list, k) => (list.find(([key]) => key === k) || [k, k])[1];
  // Line icons, one set, drawn for this app.
  const ICONS = {
    plus: '<path d="M12 5.5v13M5.5 12h13"/>', minus: '<path d="M5.5 12h13"/>', check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>', chev: '<path d="M9.5 6l6 6-6 6"/>', chevleft: '<path d="M14.5 6l-6 6 6 6"/>',
    chevdown: '<path d="M6 9.5l6 6 6-6"/>', up: '<path d="M12 18.5v-13M6.5 11l5.5-5.5 5.5 5.5"/>', down: '<path d="M12 5.5v13M6.5 13l5.5 5.5 5.5-5.5"/>',
    grip: '<circle cx="9" cy="7" r=".8"/><circle cx="15" cy="7" r=".8"/><circle cx="9" cy="12" r=".8"/><circle cx="15" cy="12" r=".8"/><circle cx="9" cy="17" r=".8"/><circle cx="15" cy="17" r=".8"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>', trophy: '<path d="M8 4.5h8v4.5a4 4 0 0 1-8 0V4.5zM8 6.5H5.5a2.5 2.5 0 0 0 2.6 3.4M16 6.5h2.5a2.5 2.5 0 0 1-2.6 3.4M12 13v3.5M8.5 19.5h7"/>',
  };
  const ic = (n, cls) => `<svg class="i ${cls || ""}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n]}</svg>`;
  let toastTimer = null;
  function toast(t) {
    const el = $("#toast");
    el.innerHTML = `<div class="toast">${esc(t)}</div>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.innerHTML = ""; }, 2600);
  }

  /* ---------- state ---------- */
  let S = RL.emptyState();
  let LIB = [], ALL = [], SORTED = []; // SORTED: alphabetical, for display. LIB order is the routine builder's preference order.
  let view = "train", selEx = null, exQuery = "", openBd = {}, loaded = false, serverMode = false;
  let draft = null, step = 0, pickAt = null, pickRegion = "all";
  let exOpen = false, openGoal = {}, openNote = {}, syncText = "";
  let goalFilter = "all", goalDraft = null, calMonth = null;
  let prefs = { rack: "all", mine: true };
  try { Object.assign(prefs, JSON.parse(localStorage.getItem(PREFS) || "{}")); } catch (e) { /* defaults */ }
  const savePrefs = () => { try { localStorage.setItem(PREFS, JSON.stringify(prefs)); } catch (e) { /* ignore */ } };

  const ctx = () => ({ unit: S.settings.unit, dist: S.settings.dist, goal: (S.profile && S.profile.goal) || "muscle" });
  function refreshLib() { LIB = RL.buildLibrary(S.exercises); ALL = RL.buildLibrary(S.exercises, true); SORTED = LIB.slice().sort((a, b) => a.name.localeCompare(b.name)); }
  const exById = (id) => ALL.find((e) => e.id === id) || { id, name: "Removed exercise", group: "", region: "upper", equip: "other", measure: "total", pattern: "" };
  const have = () => new Set([...((S.profile && S.profile.equipment) || RL.ALL_EQUIPMENT), "bodyweight"]);

  /* ---------- persistence ---------- */
  let flushing = false, flushTimer = null, dirty = false;
  function queue() { if (!loaded) return; dirty = true; clearTimeout(flushTimer); flushTimer = setTimeout(flush, 500); }
  async function flush() {
    if (flushing) { flushTimer = setTimeout(flush, 400); return; }
    if (!dirty) return;
    flushing = true; dirty = false;
    S.updatedAt = Date.now();
    const body = JSON.stringify(S);
    let local = true;
    try { localStorage.setItem(LS, body); } catch (e) { local = false; }
    try {
      if (serverMode) {
        const r = await fetch("api/state", { method: "PUT", headers: { "Content-Type": "application/json" }, body });
        if (!r.ok) throw new Error("save " + r.status);
        setSync("Saved to server");
      } else {
        setSync(local ? "Saved on this device" : "Not saved: browser storage unavailable");
      }
    } catch (e) {
      dirty = true;
      setSync("Offline: saved on this device, will sync");
      flushTimer = setTimeout(flush, 15000);
    }
    flushing = false;
  }
  // Sync state is shown in Settings. Only problems surface as a toast.
  function setSync(t) {
    const changed = t !== syncText;
    syncText = t;
    const el = $("#syncText"); if (el) el.textContent = t;
    if (changed && /^(Offline|Not saved)/.test(t)) toast(t);
  }

  async function connect() {
    let localD = null;
    try { localD = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { /* ignore */ }
    try {
      const r = await fetch("api/state", { cache: "no-store" });
      if (r.ok && (r.headers.get("content-type") || "").includes("json")) {
        serverMode = true;
        prefs.server = true; savePrefs();
        const srv = await r.json();
        const useLocal = localD && (localD.updatedAt || 0) > (srv.updatedAt || 0);
        S = RL.normalizeState(useLocal ? localD : srv);
        setSync("Saved to server");
        finishLoad();
        if (useLocal) queue();
        return;
      }
    } catch (e) { /* no server: offline or static hosting */ }
    if (prefs.server && localD) serverMode = true;
    S = RL.normalizeState(localD);
    setSync(serverMode ? "Offline: saved on this device, will sync" : "Saved on this device");
    finishLoad();
  }
  function finishLoad() {
    refreshLib();
    applyTheme();
    loaded = true;
    render();
  }
  function applyTheme() {
    const t = S.settings.theme;
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }

  /* ---------- legal text ---------- */
  const DISCLAIMER = `
    <h3>Not medical advice</h3>
    <p>Rep Ledger is a workout logbook. It does not provide medical, health, nutrition or professional coaching advice, and using it does not create any professional relationship. Talk to a physician or qualified professional before starting or changing an exercise program, especially if you have a medical condition or injury, are pregnant, or are new to exercise.</p>
    <h3>Exercise carries risk</h3>
    <p>Strength training and other exercise carry an inherent risk of injury, including serious injury or death. You choose your exercises, loads and volume. You are responsible for your own form, safety, equipment and training environment, including using spotters and safety equipment where appropriate. Stop immediately and seek medical help if you feel pain, dizziness, chest discomfort or unusual shortness of breath, or feel unwell.</p>
    <h3>Suggestions are generic</h3>
    <p>Next-session goals, rep ranges and starter routines come from simple rules applied to the numbers you enter. They do not know your health, technique, fatigue, recovery or limits, and they are not a prescription. Use your own judgement and ignore any suggestion that does not feel right.</p>
    <h3>No warranty, limited liability</h3>
    <p>The software is provided "as is", without warranty of any kind, as set out in the MIT License. To the maximum extent permitted by law, the authors and contributors are not liable for any injury, illness, loss, damage or claim arising from use of the software or reliance on anything it shows, including loss of data.</p>
    <h3>Your data</h3>
    <p>Your training log, survey answers and notes stay in this browser or on the server you run Rep Ledger on. Nothing is sent to the authors. You are responsible for backups and for securing any server you expose.</p>
    <h3>No affiliation</h3>
    <p>Rep Ledger is an independent open-source project. It is not affiliated with or endorsed by any coach, gym, equipment maker or brand it mentions.</p>`;

  const READINESS = [
    "Has a doctor ever told you that you have a heart condition or high blood pressure?",
    "Do you feel pain or pressure in your chest at rest, during daily activities, or when you exercise?",
    "In the past 12 months, have you lost your balance because of dizziness, or lost consciousness?",
    "Are you being treated for, or taking prescribed medication for, a chronic medical condition?",
    "Do you have a bone, joint or soft-tissue problem (back, knee, shoulder and so on) that could get worse with exercise?",
    "Are you pregnant, or have you given birth in the past 6 months?",
    "Has a doctor ever told you to exercise only under medical supervision?",
  ];
  const EXPERIENCE = [["new", "New to lifting", "Under 6 months of regular training"], ["novice", "Some experience", "6 months to 2 years"], ["intermediate", "Intermediate", "2 to 5 years"], ["advanced", "Advanced", "5 years or more"]];
  const GOALS = [["strength", "Get stronger", "Lower reps, heavier loads"], ["muscle", "Build muscle", "Moderate reps, steady progression"], ["general", "General fitness", "Moderate to higher reps, some conditioning"], ["endurance", "Endurance and conditioning", "Higher reps plus a conditioning day"]];
  const DAYS = [["2", "2 days"], ["3", "3 days"], ["4", "4 days"], ["5", "5 days"], ["6", "6 days"]];

  /* ---------- onboarding: disclaimer gate ---------- */
  const agreeRow = (id, text) => `<label class="agree"><input type="checkbox" id="${id}"><span class="mark">${ic("check")}</span><span>${text}</span></label>`;
  function renderGate() {
    $("#v-onboard").innerHTML = `<div class="step">Rep Ledger</div><h1>Before you start</h1>
      <p class="lede">What Rep Ledger is, what it is not, and who is responsible for your training</p>
      <div class="legal" tabindex="0" aria-label="Disclaimer">${DISCLAIMER}</div>
      <div class="sec"></div><div class="choices">
        ${agreeRow("c-agree", "I have read and agree to this disclaimer and the MIT License. I use Rep Ledger at my own risk.")}
        ${agreeRow("c-age", "I am 18 or older, or I have permission from a parent or guardian and train under their supervision.")}</div>
      <div class="ctabar"><button class="btn primary" data-act="consent" id="consentBtn" disabled>Agree and continue</button></div>`;
  }

  /* ---------- onboarding: survey ---------- */
  function startSurvey() {
    const p = S.profile || {};
    draft = {
      experience: p.experience || "", goals: (p.goals || (p.goal ? [p.goal] : [])).slice(),
      environments: (p.environments || (p.environment ? [p.environment] : [])).slice(),
      equipment: (p.equipment || []).slice(), days: p.days || "", unit: S.settings.unit, dist: S.settings.dist,
      readiness: (p.readiness || []).slice(), cleared: false, limitations: p.limitations || "", rebuild: true,
    };
    step = 0;
    view = "onboard";
    render();
  }
  const choiceList = (type, name, list, isOn) => `<div class="choices">${list.map(([k, l, d]) => `<label class="choice"><input type="${type}" name="${name}" value="${esc(k)}" ${isOn(k) ? "checked" : ""}><span class="body"><b>${esc(l)}</b>${d ? `<small>${esc(d)}</small>` : ""}</span><span class="mark">${ic("check")}</span></label>`).join("")}</div>`;
  const radios = (name, list, cur) => choiceList("radio", name, list, (k) => cur === k);
  const checks = (name, list, cur) => choiceList("checkbox", name, list, (k) => cur.includes(k));
  const goalOrderHTML = (goals) => goals.length < 2 ? "" : `<ol class="rank" aria-label="Goal priority">${goals.map((g, i) => `<li><span class="num">${i + 1}</span><span class="nm">${esc(label(GOALS, g))}</span>
    <button class="iconbtn" data-act="gup" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move ${esc(label(GOALS, g))} up">${ic("up")}</button>
    <button class="iconbtn" data-act="gdown" data-i="${i}" ${i === goals.length - 1 ? "disabled" : ""} aria-label="Move ${esc(label(GOALS, g))} down">${ic("down")}</button></li>`).join("")}</ol>`;

  function renderSurvey() {
    const d = draft, n = 5;
    const bar = `<div class="progress" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<span class="${i <= step ? "on" : ""}"></span>`).join("")}</div><div class="step">Step ${step + 1} of ${n}</div>`;
    let body = "";
    if (step === 0) {
      body = `<h1>About you</h1><p class="lede">Sets your starting rep ranges and how much help you see. You can change all of it later.</p>
        <fieldset><legend>How long have you been training?</legend>${radios("experience", EXPERIENCE, d.experience)}</fieldset>
        <fieldset><legend>What are your goals?</legend><p class="help">Pick one or more, then put them in order. Your top goal sets your rep ranges.</p>${checks("goals", GOALS, d.goals)}</fieldset>
        <div id="goalOrder">${goalOrderHTML(d.goals)}</div>`;
    } else if (step === 1) {
      body = `<h1>Where you train</h1><p class="lede">The exercise list shows what your equipment allows. Bodyweight exercises are always included.</p>
        <fieldset><legend>Places</legend><p class="help">Pick every place you train</p>${checks("environments", RL.ENVIRONMENTS.map(([k, l]) => [k, l]), d.environments)}</fieldset>
        <fieldset><legend>Equipment</legend><p class="help">Filled in from your places. Adjust it to match what you actually have.</p>${checks("equipment", RL.EQUIPMENT.filter(([k]) => k !== "bodyweight"), d.equipment)}</fieldset>`;
    } else if (step === 2) {
      body = `<h1>Schedule and units</h1>
        <fieldset><legend>Training days per week</legend>${radios("days", DAYS, String(d.days))}</fieldset>
        <fieldset><legend>Weight</legend>${radios("unit", [["lb", "Pounds", "lb"], ["kg", "Kilograms", "kg"]], d.unit)}</fieldset>
        <fieldset><legend>Distance</legend>${radios("dist", [["km", "Kilometres", "km"], ["mi", "Miles", "mi"]], d.dist)}</fieldset>`;
    } else if (step === 3) {
      const anyYes = d.readiness.some((x) => x === "yes");
      body = `<h1>Health check</h1><p class="lede">Based on common pre-exercise screening. Not a medical assessment. Your answers stay in your own data.</p>
        <fieldset><div class="choices">${READINESS.map((q, i) => `<div class="yn" role="radiogroup" aria-label="${esc(q)}"><span>${esc(q)}</span><span class="seg">
          <label><input type="radio" name="rq${i}" value="yes" ${d.readiness[i] === "yes" ? "checked" : ""}>Yes</label>
          <label><input type="radio" name="rq${i}" value="no" ${d.readiness[i] === "no" ? "checked" : ""}>No</label></span></div>`).join("")}</div></fieldset>
        <div id="clearBox">${anyYes ? clearanceHTML(d.cleared) : ""}</div>
        <fieldset><legend>Injuries or limitations</legend><p class="help">Optional. A private note shown in Settings. The app does not change your plan based on it.</p>
        <textarea class="field" name="limitations" rows="2" maxlength="500">${esc(d.limitations)}</textarea></fieldset>`;
    } else {
      const tmpl = RL.buildTemplates(LIB, Object.assign({}, d, { goal: d.goals[0] }));
      const rng = (g) => RL.RANGES[g] || RL.RANGES.muscle;
      body = `<h1>Your setup</h1><p class="lede">A starting point, not a prescription. Swap anything.</p>
        <div class="summary"><dl class="kv">
          <dt>Experience</dt><dd>${esc(label(EXPERIENCE, d.experience))}</dd>
          <dt>Goals</dt><dd>${d.goals.map((g, i) => (i + 1) + ". " + esc(label(GOALS, g))).join("<br>")}</dd>
          <dt>Rep ranges</dt><dd><span class="fig">${rng(d.goals[0])[0].join("-")}</span> compound, <span class="fig">${rng(d.goals[0])[1].join("-")}</span> isolation</dd>
          <dt>Places</dt><dd>${d.environments.map((k) => esc(label(RL.ENVIRONMENTS, k))).join(", ")}</dd>
          <dt>Exercises</dt><dd>${LIB.filter((e) => new Set([...d.equipment, "bodyweight"]).has(e.equip)).length} of ${LIB.length} match your equipment</dd>
          <dt>Routines</dt><dd>${tmpl.map((t) => esc(t.name)).join(", ") || "None"}</dd>
        </dl></div>
        ${S.profile ? `<div class="sec"></div><div class="choices"><label class="agree"><input type="checkbox" name="rebuild" ${d.rebuild ? "checked" : ""}><span class="mark">${ic("check")}</span><span>Replace my starter routines. Routines I saved myself are kept.</span></label></div>` : ""}`;
    }
    $("#v-onboard").innerHTML = `${bar}${body}<div class="sec"></div><div class="err" id="surveyErr" role="alert"></div>
      <div class="ctabar">${step > 0 ? `<button class="btn back" data-act="sback">Back</button>` : S.profile ? `<button class="btn back" data-act="scancel">Cancel</button>` : ""}
      <button class="btn primary" data-act="snext">${step === n - 1 ? (S.profile ? "Save" : "Start training") : "Continue"}</button></div>`;
  }
  const clearanceHTML = (on) => `<div class="callout bad">You answered yes to at least one question. Get clearance from a physician or qualified professional before you start, and tell them what kind of training you plan to do.</div>
    <div class="choices"><label class="agree"><input type="checkbox" name="cleared" ${on ? "checked" : ""}><span class="mark">${ic("check")}</span><span>I have clearance, or I will get it before training</span></label></div>`;


  function collectStep() {
    const f = $("#v-onboard");
    const val = (n) => (f.querySelector(`input[name="${n}"]:checked`) || {}).value || "";
    const d = draft;
    if (step === 0) { d.experience = val("experience"); if (!d.experience || !d.goals.length) return "Pick your experience and at least one goal."; }
    if (step === 1) {
      d.environments = [...f.querySelectorAll('input[name="environments"]:checked')].map((x) => x.value);
      d.equipment = [...f.querySelectorAll('input[name="equipment"]:checked')].map((x) => x.value);
      if (!d.environments.length) return "Pick at least one place you train.";
    }
    if (step === 2) { d.days = val("days"); d.unit = val("unit"); d.dist = val("dist"); if (!d.days || !d.unit || !d.dist) return "Answer all three questions to continue."; }
    if (step === 3) {
      d.readiness = READINESS.map((_, i) => val("rq" + i));
      d.cleared = !!(f.querySelector('input[name="cleared"]') || {}).checked;
      d.limitations = (f.querySelector('textarea[name="limitations"]') || {}).value || "";
      if (d.readiness.some((x) => !x)) return "Answer every health question to continue.";
      if (d.readiness.includes("yes") && !d.cleared) return "Confirm that you have, or will get, clearance before training.";
    }
    if (step === 4) { const rb = f.querySelector('input[name="rebuild"]'); d.rebuild = rb ? rb.checked : true; }
    return "";
  }

  function finishSurvey() {
    const d = draft, first = !S.profile;
    S.profile = {
      experience: d.experience, goals: d.goals, goal: d.goals[0], environments: d.environments, equipment: d.equipment, days: Number(d.days),
      readiness: d.readiness, readinessFlag: d.readiness.includes("yes"), limitations: d.limitations.trim(),
      completedAt: new Date().toISOString(),
    };
    S.settings.unit = d.unit;
    S.settings.dist = d.dist;
    if (first) S.settings.tips = d.experience === "new" || d.experience === "novice";
    if (first || d.rebuild) S.templates = S.templates.filter((t) => !t.id.startsWith("t-")).concat(RL.buildTemplates(LIB, S.profile));
    draft = null;
    view = first ? "train" : "settings";
    queue();
    render();
  }

  /* ---------- domain ---------- */
  const active = () => S.sessions.find((s) => s.status === "active");
  const doneSessions = () => S.sessions.filter((s) => s.status === "done").sort((a, b) => b.ts - a.ts);
  const workingDone = (sets) => sets.filter((x) => x.done && !x.warm);

  function lastFor(exId, beforeTs, excludeId) {
    for (const s of doneSessions()) {
      if (s.id === excludeId || (beforeTs != null && s.ts >= beforeTs)) continue;
      const it = s.items.find((i) => i.exId === exId && workingDone(i.sets).length);
      if (it) return { s, it: Object.assign({}, it, { sets: workingDone(it.sets) }) };
    }
    return null;
  }
  function earlierSets(exId, beforeTs, excludeId) {
    const out = [];
    doneSessions().forEach((s) => {
      if (s.id === excludeId || (beforeTs != null && s.ts >= beforeTs)) return;
      s.items.filter((i) => i.exId === exId).forEach((i) => out.push(...workingDone(i.sets)));
    });
    return out;
  }
  // Working-set index for each set (warm-ups get -1), so set 1 compares to last session's set 1.
  function workIndex(sets) { let w = 0; return sets.map((x) => (x.warm ? -1 : w++)); }

  function applyAuto(session) {
    const c0 = ctx();
    session.items.forEach((it) => {
      const ex = exById(it.exId);
      const before = session.status === "active" ? null : session.ts;
      const last = lastFor(it.exId, before, session.id);
      const hist = S.settings.adaptive !== false ? RL.goalHistory(S.sessions, ex, c0, { beforeTs: before, excludeId: session.id }) : null;
      const wi = workIndex(it.sets);
      it.sets.forEach((c, i) => {
        if (c.warm) { c.goal = null; c.why = ""; return; }
        if (!c.done || c.goalAuto === false) return;
        const sg = RL.adapt(RL.suggest(c, last ? last.it.sets[wi[i]] : null, ex, c0), hist);
        c.goal = sg ? sg.g : null;
        c.why = sg ? sg.why : "";
      });
    });
  }
  const newSet = (w, r) => ({ w: w ?? null, r: r ?? null, rir: null, q: null, bd: null, done: false, warm: false, goal: null, goalAuto: true, why: "", note: "" });
  function makeItem(exId, session) {
    const ex = exById(exId), last = lastFor(exId, null, session.id), c0 = ctx();
    const n = last ? last.it.sets.length : ex.measure === "cardio" ? 1 : S.profile && S.profile.experience === "new" ? 2 : 3;
    const sets = [];
    for (let i = 0; i < n; i++) {
      const p = last ? last.it.sets[i] : null, t = RL.targetOf(p, ex, c0);
      sets.push(newSet(t ? t.w : p && p.w, t ? t.r : p && p.r));
    }
    return { uid: uid(), exId, sets, note: "" };
  }
  function startSession(fromIds, lbl) {
    let s = active();
    if (s) return s;
    s = { id: uid(), ts: Date.now(), date: today(), label: lbl || "", status: "active", items: [] };
    S.sessions.push(s);
    (fromIds || []).forEach((id) => s.items.push(makeItem(id, s)));
    queue();
    return s;
  }
  function addToSession(exId, at) {
    const s = startSession();
    const idx = at == null ? s.items.length : Math.max(0, Math.min(at, s.items.length));
    s.items.splice(idx, 0, makeItem(exId, s));
    queue(); closeModal(); view = "train"; render();
    const card = document.querySelectorAll("#slots .card")[idx];
    if (card) card.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const rangeText = (ex) => { const r = RL.repRange(ex, ctx().goal); return r ? r[0] + "-" + r[1] + " " + RL.rUnit(ex) : "distance + time"; };
  const rackMatch = (e, region, mine, q) =>
    (region === "all" || (region === "full" ? e.region === "full" || e.region === "cardio" : e.region === region)) &&
    (!mine || have().has(e.equip)) &&
    (!q || e.name.toLowerCase().includes(q) || e.group.toLowerCase().includes(q) || e.equip.includes(q));
  const regionChips = (cur, act) => [["all", "All"], ["upper", "Upper"], ["lower", "Lower"], ["core", "Core"], ["full", "Conditioning"]]
    .map(([k, l]) => `<button class="chip ${cur === k ? "on" : ""}" data-act="${act}" data-v="${k}">${l}</button>`).join("");

  /* ---------- render ---------- */
  const wide = () => window.matchMedia("(min-width: 900px)").matches;
  function render() {
    const onboarding = !S.consent || S.consent.version !== CONSENT_VERSION || !S.profile || view === "onboard";
    $("#tabs").hidden = onboarding;
    ["onboard", "train", "history", "goals", "exercises", "settings"].forEach((v) => { $("#v-" + v).hidden = onboarding ? v !== "onboard" : v !== view; });
    if (onboarding) {
      if (!S.consent || S.consent.version !== CONSENT_VERSION) return renderGate();
      if (!draft) { startSurvey(); return; }
      return renderSurvey();
    }
    document.querySelectorAll("#tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.v === view)));
    $("#labels").innerHTML = [...new Set(S.sessions.map((s) => s.label).filter(Boolean))].map((l) => `<option value="${esc(l)}">`).join("");
    $("#groups").innerHTML = RL.GROUPS.map((g) => `<option value="${esc(g)}">`).join("");
    if (view === "train") renderTrain();
    else if (view === "history") renderHistory();
    else if (view === "goals") renderGoals();
    else if (view === "exercises") renderExercises();
    else renderSettings();
  }
  const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
  const fig = (w, r, ex) => `${fw(w)} × ${r ?? "-"}`;
  const navHTML = (title, sub, acts) => `<header class="nav"><h1>${title}${sub ? `<span class="sub">${sub}</span>` : ""}</h1>${acts ? `<div class="acts">${acts}</div>` : ""}</header>`;
  const rowBtn = (act, attrs, t, d, end) => `<button class="row" data-act="${act}" ${attrs || ""}><span class="body"><span class="t">${t}</span>${d ? `<span class="d">${d}</span>` : ""}</span><span class="end">${end || ""}${ic("chev", "sm chev")}</span></button>`;

  function renderLib() {
    const lib = $("#lib"); if (!lib) return;
    const q = ($("#libSearch").value || "").toLowerCase().trim();
    const s = active(), inS = new Set(s ? s.items.map((i) => i.exId) : []);
    $("#rackf").innerHTML = regionChips(prefs.rack, "rackf") + `<button class="chip ${prefs.mine ? "on" : ""}" data-act="mine" aria-pressed="${prefs.mine}">My equipment</button>`;
    lib.innerHTML = SORTED.filter((e) => rackMatch(e, prefs.rack, prefs.mine, q)).map((e) => `<li data-ex="${esc(e.id)}" class="${inS.has(e.id) ? "in-session" : ""}"><div class="nm">${esc(e.name)}<div class="grp">${esc(e.group)} · ${esc(label(RL.EQUIPMENT, e.equip).replace(/ \(.*\)/, ""))}</div></div><button class="iconbtn add" data-act="add" data-ex="${esc(e.id)}" aria-label="Add ${esc(e.name)}">${ic("plus")}</button></li>`).join("")
      || `<li class="muted">No match</li>`;
  }
  const tipsHTML = () => S.settings.tips ? `<div class="tips"><b class="h">How it works</b><ul>
      <li>Each exercise loads last session's sets, with today's goal under <b>Previous</b>.</li>
      <li>Enter load and reps, then tap the check. Tap the set number to mark a warm-up.</li>
      <li>Rate <b>RIR</b> (clean reps left) and <b>Quality</b> (how well you moved) after each set.</li>
      <li>You get a goal for next time and advice for your next set. Override either.</li>
      <li>Stop any set that hurts. No progression is worth an injury.</li></ul>
      <button class="txtbtn" data-act="hidetips">Hide tips</button></div>` : "";

  function renderTrain() {
    const s = active();
    const rack = `<aside class="rack"><input type="search" class="search" id="libSearch" placeholder="Search" aria-label="Search exercises"><div class="chips" id="rackf"></div><ul class="lib" id="lib"></ul></aside>`;
    let main;
    if (!s) {
      const seen = new Set();
      const recent = doneSessions().filter((r) => { const k = (r.label || "").toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4);
      main = navHTML("Train", fmtDate(today())) + tipsHTML()
        + (S.templates.length ? `<div class="sec">Routines</div><div class="group">${S.templates.map((t) => rowBtn("tstart", `data-id="${esc(t.id)}"`, esc(t.name), esc(t.exIds.slice(0, 3).map((id) => exById(id).name).join(", ") + (t.exIds.length > 3 ? " and " + (t.exIds.length - 3) + " more" : "")), "")).join("")}</div>` : "")
        + (recent.length ? `<div class="sec">Repeat a recent day</div><div class="group">${recent.map((r) => rowBtn("repeat", `data-id="${esc(r.id)}"`, esc(r.label || "Session"), fmtDate(r.date) + " · " + plural(r.items.length, "exercise"), "")).join("")}</div>` : "")
        + `<div class="sec"></div><button class="btn primary block" data-act="start">Start empty workout</button>
        <ol class="slots" id="slots"><li class="empty-card rack-hint" data-static><b>Or drag from the list</b>Drop an exercise here to start</li></ol>`;
    } else {
      const ins = (i) => `<li class="insert" data-static><button data-act="picker" data-at="${i}" aria-label="Insert an exercise at position ${i + 1}">${ic("plus")}Insert</button></li>`;
      main = `<header class="nav"><div class="ttl"><input class="session-title" id="sessLabel" list="labels" value="${esc(s.label)}" placeholder="Workout" aria-label="Workout name"><span class="sub">${fmtDate(s.date)}</span></div>
        <div class="acts"><button class="btn primary sm" data-act="finish">Finish</button></div></header>` + tipsHTML()
        + `<ol class="slots" id="slots">${s.items.map((it, i) => (i ? ins(i) : "") + cardHTML(s, it, i)).join("")}
          ${s.items.length ? "" : `<li class="empty-card" data-static><b>Add your first exercise</b>Use the button below${wide() ? " or drag from the list" : ""}</li>`}
          <li class="addrow" data-static><button class="btn tint block" data-act="picker">${ic("plus")}Add exercise</button></li></ol>
        <div class="session-foot"><button class="txtbtn" data-act="saveroutine">Save as routine</button><button class="txtbtn danger" data-act="discard">Discard workout</button></div>`;
    }
    $("#v-train").innerHTML = `<div class="train has-rack"><div class="trainmain">${main}</div>${rack}</div>`;
    renderLib();
    initDnD();
  }

  function cardHTML(s, it, i) {
    const ex = exById(it.exId), c0 = ctx(), last = lastFor(it.exId, null, s.id), prior = earlierSets(it.exId, null, s.id);
    const wi = workIndex(it.sets);
    const plateAt = it.sets.findIndex((x) => !x.done);
    const exNote = it.note || openNote["ex:" + it.uid];
    const lastTxt = last
      ? `Last · ${fmtDate(last.s.date)}: ` + last.it.sets.map((x) => `<b>${fig(x.w, x.r)}</b>${x.rir != null ? " @" + x.rir : ""}${x.q != null ? " (" + x.q + "/10)" : ""}`).join(" · ")
      : "First time logging this exercise. Today sets your baseline";
    return `<li class="card" data-uid="${it.uid}">
      <div class="card-h"><span class="handle" title="Drag to reorder" aria-hidden="true">${ic("grip")}</span><div class="ttl"><div class="nm">${esc(ex.name)}</div><div class="meta">${esc(rangeText(ex))} · ${esc(label(RL.EQUIPMENT, ex.equip).replace(/ \(.*\)/, ""))}</div></div><button class="iconbtn" data-act="rmitem" data-i="${i}" aria-label="Remove ${esc(ex.name)}">${ic("x")}</button></div>
      ${ex.cues ? `<details class="cues"><summary>Cues</summary>${esc(ex.cues)}</details>` : ""}
      <div class="lastline">${lastTxt}</div>
      <div class="sets">${it.sets.map((c, si) => setHTML(it, ex, c, si, wi[si], last && wi[si] >= 0 ? last.it.sets[wi[si]] : null, i, prior, c0, adviceFor(it, si, ex, c0))).join("")}</div>
      <div class="card-f"><button class="btn sm" data-act="addset" data-i="${i}">${ic("plus", "sm")}Add set</button>${it.sets.length > 1 ? `<button class="iconbtn" data-act="rmset" data-i="${i}" aria-label="Remove last set">${ic("minus")}</button>` : ""}<span class="grow"></span>
        ${ex.equip === "barbell" && ex.measure === "total" ? `<button class="txtbtn muted" data-act="plates" data-i="${i}" data-s="${plateAt < 0 ? it.sets.length - 1 : plateAt}">Plates</button>` : ""}
        ${exNote ? "" : `<button class="txtbtn muted" data-act="noteopen" data-k="ex:${it.uid}" data-i="${i}">Exercise note</button>`}
        ${exNote ? `<textarea data-f="note" data-i="${i}" rows="1" placeholder="Setup, cues, how it felt" aria-label="Exercise note">${esc(it.note)}</textarea>` : ""}</div>
    </li>`;
  }
  // Advice for set si from the most recent logged working set before it in the same exercise.
  function adviceFor(it, si, ex, c0) {
    const c = it.sets[si];
    if (c.done || c.warm) return null;
    for (let j = si - 1; j >= 0; j--) {
      const x = it.sets[j];
      if (x.warm) continue;
      if (!x.done) return null;
      const a = RL.nextSetAdvice(x, ex, c0, S.settings.targetRir);
      return a ? Object.assign({ from: j }, a) : null;
    }
    return null;
  }

  function setHTML(it, ex, c, si, w, p, i, prior, c0, adv) {
    const t = c.warm ? null : RL.targetOf(p, ex, c0), pg = p && p.goal, k = it.uid + ":" + si;
    const cw = c.w ?? (RL.LOAD_MEASURES.has(ex.measure) ? null : 0);
    const hit = t && c.done && cw != null && c.r != null && cw >= t.w && c.r >= t.r;
    const d = `data-i="${i}" data-s="${si}"`;
    let target = "";
    if (p && !c.warm) {
      target = pg && pg.type === "custom" ? `<span class="target">Goal: <b>${esc(pg.text || "Custom")}</b></span>`
        : t ? `<span class="target ${hit ? "hit" : ""}">${hit ? "Goal hit" : "Goal: " + esc(RL.goalLabel(pg || { type: "hold" }, ex, c0))} → <b class="fig">${fig(t.w, t.r)}</b></span>` : "";
    }
    const isCardio = ex.measure === "cardio", showRir = !isCardio && ex.measure !== "time";
    const scale = (act, vals, cur) => vals.map((n) => `<button class="${cur === n ? "on" : act === "q" && cur && n < cur ? "lit" : ""}" data-act="${act}" ${d} data-v="${n}" aria-label="${act === "q" ? "Quality" : "RIR"} ${n}" aria-pressed="${cur === n}">${n}</button>`).join("");
    const BD = [["form", "Form"], ["exec", "Execution"], ["pause", "Pauses and tempo"], ["breath", "Breathing"], ["rom", "Range of motion"]];
    let result = "";
    if (c.done && !c.warm) {
      const pr = RL.progression(c, p, ex, c0), g = c.goal, isPr = RL.isPR(c, prior, ex);
      result = `<div class="result">
        ${pr || isPr ? `<div class="resline">${pr ? `<span class="badge ${pr.kind}">${esc(pr.text)}${p ? " vs last" : ""}</span>` : ""}${isPr ? `<span class="badge pr">${ic("trophy", "sm")}New PR</span>` : ""}</div>` : ""}
        <div class="nextgoal"><span class="lbl">Next session</span></div>
        <div class="goalchips">${RL.goalTypes(ex, c0).map(([ty, l]) => `<button class="chip ${g && g.type === ty ? "on" : ""}" data-act="goal" ${d} data-v="${ty}">${esc(l)}</button>`).join("")}
          ${g && g.type === "add" ? `<input type="number" step="any" inputmode="decimal" value="${g.v ?? ""}" placeholder="${esc(RL.wUnit(ex, c0))}" data-f="goalv" ${d} aria-label="Load to add">` : ""}
          ${g && g.type === "custom" ? `<input class="wide" type="text" value="${esc(g.text || "")}" placeholder="3 s lowering" data-f="goaltext" ${d} aria-label="Custom goal">` : ""}</div>
        ${c.goalAuto !== false && c.why ? `<div class="why"><b>Suggested:</b> ${esc(c.why)}</div>` : c.goalAuto === false ? `<div class="why">Your call. <button class="txtbtn" data-act="goalauto" ${d}>Use suggestion</button></div>` : ""}
      </div>`;
    }
    return `<div class="set ${c.done ? "done" : ""} ${c.warm ? "warm" : ""}">
      <div class="set-top">
        <button class="setno ${c.warm ? "warm" : ""}" data-act="warm" ${d} aria-label="${c.warm ? "Warm-up set, tap to make it a working set" : "Set " + (w + 1) + ", tap to mark as warm-up"}">${c.warm ? "Warm-up" : "Set " + (w + 1)}</button>${target}
        <button class="logbtn" data-act="done" ${d} aria-pressed="${!!c.done}">${c.done ? ic("check", "sm") + "Logged" : "Log set"}</button>
      </div>
      ${adv ? `<div class="advice ${adv.action}"><span>${esc(adv.text)}</span>${adv.w != null && adv.w !== c.w ? `<button class="btn sm" data-act="applyadv" ${d} data-v="${adv.w}">Use ${fw(adv.w)}</button>` : ""}</div>` : ""}
      <div class="inputs">
        <label class="num"><input class="cell" type="number" step="any" inputmode="decimal" value="${c.w ?? ""}" placeholder="${t ? fw(t.w) : "0"}" data-f="w" ${d} aria-label="${isCardio ? "Distance" : "Load"}"><span>${esc(RL.wUnit(ex, c0))}</span></label>
        <span class="x">×</span>
        <label class="num"><input class="cell" type="number" step="${isCardio ? "any" : ex.measure === "time" ? "1" : "0.5"}" inputmode="decimal" value="${c.r ?? ""}" placeholder="${t ? t.r : "0"}" data-f="r" ${d} aria-label="${esc(RL.rUnit(ex))}"><span>${RL.rUnit(ex)}</span></label>
      </div>
      ${c.warm ? "" : `${showRir ? `<div class="rate"><span class="lbl">RIR</span><div class="scale rir">${scale("rir", [0, 1, 2, 3, 4, 5], c.rir)}</div></div>` : ""}
      <div class="rate"><span class="lbl">Quality</span><div class="scale">${scale("q", [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], c.q)}</div></div>
      ${openBd[k] ? `<div class="bd">${BD.map(([key, lab]) => { const v = (c.bd && c.bd[key]) ?? c.q ?? 7; return `<label><span>${lab}<b id="bdv-${k}-${key}">${v}</b></span><input type="range" min="1" max="10" step="1" value="${v}" data-f="bd.${key}" ${d}></label>`; }).join("")}</div>` : ""}
      <div class="links"><button data-act="bd" data-k="${k}">${openBd[k] ? "Hide breakdown" : "Rate form, tempo, breathing"}</button></div>`}
      ${p && p.note ? `<div class="lastnote"><b>Last time</b>${esc(p.note)}</div>` : ""}
      <input class="setnote" type="text" value="${esc(c.note || "")}" placeholder="Set note: cue, pain, setup, what to fix" data-f="snote" ${d} aria-label="Note for this set">
      ${result}</div>`;
  }
  // Re-render one card, keeping focus on the same field so typing isn't interrupted.
  function rerenderCard(i) {
    const s = active(); if (!s || !s.items[i]) return;
    const li = document.querySelector(`#slots > li[data-uid="${s.items[i].uid}"]`);
    if (!li) return;
    const a = document.activeElement, f = a && li.contains(a) && a.dataset ? a.dataset.f : null;
    const sel = f ? `#slots [data-f="${f}"][data-i="${a.dataset.i}"]` + (a.dataset.s != null ? `[data-s="${a.dataset.s}"]` : "") : null;
    li.outerHTML = cardHTML(s, s.items[i], i);
    const n = sel && document.querySelector(sel);
    if (n) n.focus({ preventScroll: true });
  }

  /* ---------- picker ---------- */
  function openPicker(at) {
    pickAt = at; pickRegion = prefs.rack;
    modal(`<div class="mh"><h2>${at == null ? "Add exercise" : "Insert exercise"}</h2><button class="iconbtn" data-act="close" aria-label="Close">${ic("x")}</button></div>
      <input type="search" id="pkq" class="search pkq" placeholder="Search or name a new one" aria-label="Search or name a new exercise" autocomplete="off">
      <div class="chips scroll" id="pkf"></div><div id="pkl"></div>`);
    renderPicker();
    setTimeout(() => { const q = $("#pkq"); if (q && wide()) q.focus(); }, 50);
  }
  function renderPicker() {
    const q = ($("#pkq") ? $("#pkq").value : "").trim(), ql = q.toLowerCase();
    const s = active(), inS = new Set(s ? s.items.map((i) => i.exId) : []);
    $("#pkf").innerHTML = regionChips(pickRegion, "pkf") + `<button class="chip ${prefs.mine ? "on" : ""}" data-act="mine" aria-pressed="${prefs.mine}">My equipment</button>`;
    const list = SORTED.filter((e) => rackMatch(e, pickRegion, prefs.mine, ql));
    const exact = LIB.some((e) => e.name.toLowerCase() === ql);
    const create = q && !exact ? `<div class="group"><button class="row accent pkcreate" data-act="newex" data-name="${esc(q)}">${ic("plus")}<span class="body"><span class="t">Create "${esc(q)}"</span></span></button></div><div class="sec"></div>` : "";
    $("#pkl").innerHTML = create + (list.length ? `<div class="group">${list.map((e) => `<button class="row pkrow" data-act="pkadd" data-ex="${esc(e.id)}"><span class="body"><span class="t">${esc(e.name)}</span><span class="d">${esc(e.group)} · ${esc(label(RL.EQUIPMENT, e.equip).replace(/ \(.*\)/, ""))}</span></span>${inS.has(e.id) ? `<span class="badge">In workout</span>` : ""}</button>`).join("")}</div>`
      : q ? "" : `<p class="note">Nothing here with your equipment. Turn off My equipment to see everything.</p>`);
  }

  /* ---------- exercise form (new and edit) ---------- */
  function exFormHTML(ex, isNew) {
    const c0 = ctx(), r = RL.repRange(Object.assign({}, ex, { repMin: null, repMax: null }), c0.goal);
    const opt = (list, cur) => list.map(([k, l]) => `<option value="${k}" ${cur === k ? "selected" : ""}>${esc(l)}</option>`).join("");
    return `<div class="form">
      <label class="wide">Name<input class="field" id="f-name" value="${esc(ex.name)}" maxlength="80"></label>
      <label>Muscle group<input class="field" id="f-group" list="groups" value="${esc(ex.group)}" maxlength="40"></label>
      <label>Region<select class="field" id="f-region">${opt(RL.REGIONS, ex.region)}</select></label>
      <label>Equipment<select class="field" id="f-equip">${opt(RL.EQUIPMENT.map(([k, l]) => [k, l.replace(/ \(.*\)/, "")]), ex.equip)}</select></label>
      <label>Measured as<select class="field" id="f-measure">${opt(RL.MEASURES, ex.measure)}</select></label>
      <label>Range low<input class="field" id="f-min" type="number" min="1" inputmode="numeric" value="${ex.repMin ?? ""}" placeholder="${r ? r[0] : "-"}"></label>
      <label>Range high<input class="field" id="f-max" type="number" min="1" inputmode="numeric" value="${ex.repMax ?? ""}" placeholder="${r ? r[1] : "-"}"></label>
      <label class="wide">Microload<input class="field" id="f-inc" type="number" step="any" min="0" inputmode="decimal" value="${ex.inc ?? ""}" placeholder="${fw(RL.incOf(Object.assign({}, ex, { inc: null }), c0.unit))}"></label>
      <label class="wide">Cues and setup<textarea id="f-cues" class="field" rows="3" maxlength="1000" placeholder="Seat height, grip, tempo, what to feel">${esc(ex.cues || "")}</textarea></label>
    </div><p class="note">Leave range and microload blank to use defaults from your goal and unit</p>`;
  }
  function readExForm(root) {
    const v = (id) => root.querySelector(id).value.trim();
    const o = { name: v("#f-name"), group: v("#f-group"), region: v("#f-region"), equip: v("#f-equip"), measure: v("#f-measure"), cues: v("#f-cues") };
    const mn = num(v("#f-min")), mx = num(v("#f-max")), inc = num(v("#f-inc"));
    o.repMin = mn && mn > 0 ? Math.round(mn) : null;
    o.repMax = mx && mx > 0 ? Math.max(o.repMin || 1, Math.round(mx)) : null;
    if (!o.repMin || !o.repMax) { o.repMin = null; o.repMax = null; }
    o.inc = inc != null && inc >= 0 ? inc : null;
    return o;
  }
  function openNewEx(name) {
    const base = { name: name || "", group: "", region: pickRegion === "all" || pickRegion === "full" ? "upper" : pickRegion, equip: "machine", measure: "total", pattern: "" };
    modal(`<div class="mh"><h2>New exercise</h2><button class="iconbtn" data-act="close" aria-label="Close">${ic("x")}</button></div>
      ${exFormHTML(base, true)}<div class="err" id="exErr" role="alert"></div>
      <div class="ctabar"><button class="btn back" data-act="close">Cancel</button><button class="btn primary" data-act="createex">${pickAt !== undefined && pickAt !== "lib" ? "Create and add" : "Create"}</button></div>`);
    setTimeout(() => { const f = $("#modal #f-name"); if (f && !name) f.focus(); }, 50);
  }

  /* ---------- history ---------- */
  function sessionStats(s) {
    let sets = 0, qsum = 0, qn = 0, hits = 0, targets = 0, prs = 0;
    const c0 = ctx();
    s.items.forEach((it) => {
      const ex = exById(it.exId), last = lastFor(it.exId, s.ts, s.id), prior = earlierSets(it.exId, s.ts, s.id);
      workingDone(it.sets).forEach((c, i) => {
        sets++;
        if (c.q != null) { qsum += c.q; qn++; }
        const t = RL.targetOf(last ? last.it.sets[i] : null, ex, c0);
        if (t) { targets++; if ((c.w ?? 0) >= t.w && c.r >= t.r) hits++; }
        if (RL.isPR(c, prior, ex)) prs++;
      });
    });
    return { sets, avgQ: qn ? (qsum / qn).toFixed(1) : null, hits, targets, prs };
  }
  function weekKey(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
  function renderHistory() {
    const list = doneSessions(), now = Date.now(), day = 86400000;
    const in7 = list.filter((s) => now - s.ts < 7 * day), in30 = list.filter((s) => now - s.ts < 30 * day);
    // Consecutive weeks (Monday start) with at least one session. An empty current week doesn't break it yet.
    const weeks = new Set(list.map((s) => weekKey(s.ts)));
    let streak = 0, w = weekKey(now);
    if (!weeks.has(w)) w = weekKey(w - day);
    while (weeks.has(w)) { streak++; w = weekKey(w - day); }
    const vol = {};
    in7.forEach((s) => s.items.forEach((it) => { const g = exById(it.exId).group || "Other"; vol[g] = (vol[g] || 0) + workingDone(it.sets).length; }));
    const vmax = Math.max(10, ...Object.values(vol));
    $("#v-history").innerHTML = navHTML("History", list.length ? plural(list.length, "workout") + " logged" : "")
      + calendarHTML(list)
      + `<div class="sec"></div><div class="tiles"><div class="tile"><b>${in7.length}</b><span>Last 7 days</span></div><div class="tile"><b>${in30.length}</b><span>Last 30 days</span></div><div class="tile"><b>${streak}</b><span>Week streak</span></div><div class="tile"><b>${list.length}</b><span>All time</span></div></div>`
      + (Object.keys(vol).length ? `<div class="sec">Working sets, last 7 days</div><div class="group bars">${Object.entries(vol).sort((a, b) => b[1] - a[1]).map(([g, n]) => `<div class="bar"><span>${esc(g)}</span><progress max="${vmax}" value="${n}" aria-label="${esc(g)}: ${n} sets">${n}</progress><b>${n}</b></div>`).join("")}</div>` : "")
      + `<div class="sec">Workouts</div>` + (list.length ? `<div class="group">${list.map((s) => {
        const st = sessionStats(s);
        return rowBtn("view", `data-id="${esc(s.id)}"`, esc(s.label || "Workout"), fmtDate(s.date) + " · " + plural(s.items.length, "exercise") + " · " + plural(st.sets, "set") + (st.avgQ ? " · quality " + st.avgQ : ""), st.prs ? `<span class="badge pr">${st.prs} PR</span>` : "");
      }).join("")}</div>` : `<div class="empty-card"><b>No workouts yet</b>Finish one on the Train tab and it shows up here</div>`);
  }
  function logbookHTML(s) {
    const c0 = ctx();
    return s.items.map((it) => {
      const ex = exById(it.exId), sets = workingDone(it.sets), warm = it.sets.filter((x) => x.done && x.warm).length, last = lastFor(it.exId, s.ts, s.id);
      return `<div class="lbx"><h3>${esc(ex.name)}</h3><table>${sets.map((x, i) => {
        const p = RL.progression(x, last ? last.it.sets[i] : null, ex, c0);
        const meta = [x.rir != null ? x.rir + " RIR" : "", x.q != null ? "Q" + x.q : ""].filter(Boolean).join(" · ");
        return `<tr><td>${i + 1}</td><td><span class="fig">${fig(x.w, x.r)}</span> <span class="muted small">${esc(RL.wUnit(ex, c0))}${meta ? " · " + meta : ""}</span></td><td class="r"><span class="badge ${p ? p.kind : ""}">${esc(p ? p.text : "-")}</span></td></tr>`;
      }).join("")}</table>
        <div class="nt">Next time: ${sets.map((x, i) => (sets.length > 1 ? "set " + (i + 1) + " " : "") + esc(RL.goalLabel(x.goal, ex, c0))).join(", ")}${warm ? ` · ${warm} warm-up` : ""}</div>
        ${sets.map((x, i) => (x.note ? `<div class="nt">Set ${i + 1}: ${esc(x.note)}</div>` : "")).join("")}${it.note ? `<div class="nt">${esc(it.note)}</div>` : ""}</div>`;
    }).join("");
  }
  function openSession(id, justFinished) {
    const ss = S.sessions.find((x) => x.id === id); if (!ss) return;
    const st = sessionStats(ss);
    modal(`<div class="mh"><h2>${esc(ss.label || "Workout")}</h2><button class="iconbtn" data-act="close" aria-label="Close">${ic("x")}</button></div>
      <p>${fmtDate(ss.date)} · ${plural(st.sets, "working set")}${st.targets ? " · " + st.hits + " of " + st.targets + " goals hit" : ""}${st.prs ? " · " + st.prs + " new PR" + (st.prs > 1 ? "s" : "") : ""}</p>
      ${logbookHTML(ss)}
      ${justFinished ? `<div class="ctabar"><button class="btn primary" data-act="close">Done</button></div>`
        : `<div class="ctabar"><button class="btn" data-act="repeat" data-id="${esc(ss.id)}">Repeat</button><button class="btn" data-act="saveroutine" data-id="${esc(ss.id)}">Save as routine</button><button class="btn danger back" data-act="del" data-id="${esc(ss.id)}" aria-label="Delete workout">${ic("trash")}</button></div>`}`, false, true);
  }

  /* ---------- calendar ---------- */
  function calendarHTML(list) {
    const now = new Date();
    if (calMonth == null) calMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const m = new Date(calMonth), y = m.getFullYear(), mo = m.getMonth();
    const byDay = {};
    list.forEach((s) => { (byDay[s.date] = byDay[s.date] || []).push(s); });
    const cells = RL.monthCells(y, mo), tdy = today();
    const inMonth = cells.filter((c) => c && byDay[c]).length;
    return `<div class="cal">
      <div class="cal-h"><button class="iconbtn" data-act="calprev" aria-label="Previous month">${ic("chevleft")}</button>
        <div class="cal-t"><b>${m.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</b><span>${plural(inMonth, "training day")}</span></div>
        <button class="iconbtn" data-act="calnext" aria-label="Next month">${ic("chev")}</button></div>
      <div class="cal-g" role="grid">${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<span class="cal-w" aria-hidden="true">${d}</span>`).join("")}
        ${cells.map((c) => {
          if (!c) return `<span></span>`;
          const n = (byDay[c] || []).length, dnum = +c.slice(8);
          return n ? `<button class="day has ${c === tdy ? "today" : ""}" data-act="calday" data-date="${c}" aria-label="${fmtDate(c)}, ${plural(n, "workout")}">${dnum}${n > 1 ? `<i aria-hidden="true"></i>` : ""}</button>`
            : `<span class="day ${c === tdy ? "today" : ""}">${dnum}</span>`;
        }).join("")}</div></div>`;
  }
  function openDay(date) {
    const day = doneSessions().filter((s) => s.date === date);
    if (day.length === 1) return openSession(day[0].id);
    modal(`<div class="mh"><h2>${fmtDate(date)}</h2><button class="iconbtn" data-act="close" aria-label="Close">${ic("x")}</button></div>
      <div class="group">${day.map((s) => rowBtn("view", `data-id="${esc(s.id)}"`, esc(s.label || "Workout"), plural(s.items.length, "exercise"), "")).join("")}</div>`);
  }

  /* ---------- goals ---------- */
  const GOAL_KINDS = [["workouts", "Number of workouts"], ["sets", "Working sets"], ["volume", "Total volume"], ["lift", "Lift a weight"], ["custom", "Something else"]];
  const PERIODS = [["month", "Month"], ["quarter", "Quarter"], ["year", "Year"]];
  const GOAL_HINT = { workouts: { month: 12, quarter: 36, year: 150 }, sets: { month: 150, quarter: 450, year: 1800 }, volume: { month: 50000, quarter: 150000, year: 600000 } };
  const num0 = (n) => Math.round(n).toLocaleString();
  function goalTitle(g) {
    const u = S.settings.unit;
    switch (g.kind) {
      case "workouts": return plural(+g.target, "workout");
      case "sets": return plural(+g.target, "working set");
      case "volume": return num0(+g.target) + " " + u + " total volume";
      case "lift": return exById(g.exId).name + " " + fig(g.w, g.r);
      default: return g.text || "Goal";
    }
  }
  function goalDetail(g, pr) {
    const u = S.settings.unit;
    if (g.kind === "lift") return pr.best ? "Best " + fig(pr.best.w, pr.best.r) + " " + u : "Not logged yet this " + g.period;
    if (g.kind === "custom") return pr.achieved ? "Done" : "Not done yet";
    if (g.kind === "volume") return num0(pr.value) + " of " + num0(pr.target) + " " + u;
    return pr.value + " of " + pr.target;
  }
  function goalStatus(pr) {
    if (pr.achieved) return `<span class="badge up">${ic("check", "sm")}Done</span>`;
    if (pr.ended) return `<span class="badge down">Missed</span>`;
    return pr.onPace ? `<span class="badge first">On pace</span>` : `<span class="badge hold">Behind</span>`;
  }
  function goalRow(g, pr) {
    return `<button class="row goal" data-act="goalview" data-id="${esc(g.id)}"><span class="body">
        <span class="t">${esc(goalTitle(g))}</span>
        <span class="d">${esc(goalDetail(g, pr))}${pr.ended || pr.achieved ? "" : " · " + plural(pr.daysLeft, "day") + " left"}${g.recurring ? " · repeats" : ""}</span>
        <progress max="100" value="${Math.round(pr.pct * 100)}" aria-label="${Math.round(pr.pct * 100)} percent">${Math.round(pr.pct * 100)}%</progress>
      </span><span class="end">${goalStatus(pr)}</span></button>`;
  }
  function renderGoals() {
    const now = Date.now();
    const all = S.goals.map((g) => ({ g, pr: RL.goalProgress(g, S.sessions, exById, now) }));
    const shown = all.filter(({ g }) => goalFilter === "all" || g.period === goalFilter);
    const active = shown.filter(({ pr }) => !pr.ended), done = shown.filter(({ pr }) => pr.ended);
    const sections = PERIODS.map(([k, l]) => {
      const items = active.filter(({ g }) => g.period === k);
      if (!items.length) return "";
      const label = { month: "This month", quarter: "This quarter", year: "This year" }[k] + " · " + RL.periodName(k, now);
      return `<div class="sec">${esc(label)}</div><div class="group">${items.map(({ g, pr }) => goalRow(g, pr)).join("")}</div>`;
    }).join("");
    $("#v-goals").innerHTML = navHTML("Goals", all.length ? plural(all.filter(({ pr }) => pr.achieved && !pr.ended).length, "goal") + " done this period" : "", `<button class="btn tint sm" data-act="goaladd">${ic("plus", "sm")}New</button>`)
      + `<div class="seg wrap goalseg">${[["all", "All"]].concat(PERIODS).map(([k, l]) => `<button data-act="gfilter" data-v="${k}" aria-pressed="${goalFilter === k}">${l}</button>`).join("")}</div>`
      + (sections || (S.goals.length ? `<p class="note">No goals for this period</p>` : `<div class="sec"></div><div class="empty-card"><b>Set your first goal</b>Monthly, quarterly or yearly: a number of workouts, sets or total volume, a weight to hit on a lift, or anything else you want to track<div class="sec"></div><button class="btn primary" data-act="goaladd">New goal</button></div>`))
      + (done.length ? `<div class="sec">Finished</div><div class="group">${done.sort((a, b) => b.pr.end - a.pr.end).map(({ g, pr }) => goalRow(g, pr)).join("")}</div>` : "");
  }
  function goalFieldsHTML(kind, period) {
    const unit = S.settings.unit;
    if (kind === "lift") {
      const opts = SORTED.filter((e) => RL.LOAD_MEASURES.has(e.measure) && e.measure !== "level").map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join("");
      return `<label class="wide">Exercise<select class="field" id="g-ex">${opts}</select></label>
        <label>Load (${unit})<input class="field" id="g-w" type="number" step="any" min="0" inputmode="decimal"></label>
        <label>Reps<input class="field" id="g-r" type="number" step="1" min="1" inputmode="numeric" value="5"></label>`;
    }
    if (kind === "custom") return `<label class="wide">Goal<input class="field" id="g-text" maxlength="80" placeholder="Train on 3 days every week"></label>`;
    const hint = GOAL_HINT[kind][period];
    return `<label class="wide">Target${kind === "volume" ? " (" + unit + ")" : ""}<input class="field" id="g-target" type="number" min="1" step="1" inputmode="numeric" placeholder="${hint}"></label>`;
  }
  function openGoalSheet() {
    const d = goalDraft;
    modal(`<div class="mh"><h2>New goal</h2><button class="iconbtn" data-act="close" aria-label="Close">${ic("x")}</button></div>
      <div class="seg wrap">${PERIODS.map(([k, l]) => `<button data-act="gper" data-v="${k}" aria-pressed="${d.period === k}">${l}</button>`).join("")}</div>
      <p class="note">${esc(RL.periodName(d.period, Date.now()))}</p><div class="sec"></div>
      <div class="form"><label class="wide">Type<select class="field" id="g-kind">${GOAL_KINDS.map(([k, l]) => `<option value="${k}" ${d.kind === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        ${goalFieldsHTML(d.kind, d.period)}</div>
      <div class="sec"></div><div class="choices"><label class="agree"><input type="checkbox" id="g-rec" ${d.recurring ? "checked" : ""}><span class="mark">${ic("check")}</span><span>Repeat every ${d.period}</span></label></div>
      <div class="err" id="gErr" role="alert"></div>
      <div class="ctabar"><button class="btn back" data-act="close">Cancel</button><button class="btn primary" data-act="goalcreate">Add goal</button></div>`, true);
  }
  function openGoalDetail(id) {
    const g = S.goals.find((x) => x.id === id); if (!g) return;
    const pr = RL.goalProgress(g, S.sessions, exById, Date.now());
    modal(`<div class="mh"><h2>${esc(goalTitle(g))}</h2><button class="iconbtn" data-act="close" aria-label="Close">${ic("x")}</button></div>
      <p>${esc(RL.periodName(g.period, pr.start))} · ${esc(goalDetail(g, pr))}${pr.ended ? "" : " · " + plural(pr.daysLeft, "day") + " left"}</p>
      <div class="goalbar"><progress max="100" value="${Math.round(pr.pct * 100)}"></progress><b>${Math.round(pr.pct * 100)}%</b></div>
      <div class="resline">${goalStatus(pr)}${g.recurring ? `<span class="badge">Repeats every ${g.period}</span>` : ""}</div>
      <div class="ctabar">${g.kind === "custom" ? `<button class="btn primary" data-act="goaltoggle" data-id="${esc(g.id)}">${g.done ? "Mark not done" : "Mark done"}</button>` : `<button class="btn primary" data-act="close">Done</button>`}
        <button class="btn danger back" data-act="goaldel" data-id="${esc(g.id)}" aria-label="Delete goal">${ic("trash")}</button></div>`, true);
  }

  /* ---------- exercises ---------- */
  function renderExercises() {
    const split = wide();
    if (!selEx || !LIB.find((e) => e.id === selEx)) { selEx = SORTED[0] ? SORTED[0].id : null; if (!split) exOpen = false; }
    const q = exQuery.toLowerCase();
    const rows = SORTED.filter((e) => !q || e.name.toLowerCase().includes(q) || e.group.toLowerCase().includes(q) || e.equip.includes(q));
    let letter = "", listHTML = "";
    rows.forEach((e, n) => {
      const L = e.name[0].toUpperCase();
      if (L !== letter) { listHTML += (n ? "</div>" : "") + `<div class="letter">${esc(L)}</div><div class="group">`; letter = L; }
      listHTML += `<button class="row ${e.id === selEx && split ? "sel" : ""}" data-act="selex" data-id="${esc(e.id)}"><span class="body"><span class="t">${esc(e.name)}</span><span class="d">${esc(e.group)} · ${esc(label(RL.EQUIPMENT, e.equip).replace(/ \(.*\)/, ""))}</span></span><span class="end">${e.custom ? `<span class="badge">Custom</span>` : ""}${ic("chev", "sm chev")}</span></button>`;
    });
    if (rows.length) listHTML += "</div>";
    const list = `<div class="exlist">${navHTML("Exercises", LIB.length + " in your library", `<button class="btn tint sm" data-act="newex">${ic("plus", "sm")}New</button>`)}
      <input type="search" class="search" id="exsearch" value="${esc(exQuery)}" placeholder="Search" aria-label="Search exercises">
      ${listHTML || `<p class="note">No match</p>`}</div>`;
    const detail = selEx ? exDetailHTML(exById(selEx)) : "";
    $("#v-exercises").innerHTML = split ? `<div class="exv split">${list}<div>${detail}</div></div>` : `<div class="exv">${exOpen && selEx ? detail : list}</div>`;
  }
  function exDetailHTML(ex) {
    const c0 = ctx();
    const hist = doneSessions().slice().reverse().map((s) => {
      const it = s.items.find((i) => i.exId === ex.id); if (!it) return null;
      const sets = workingDone(it.sets).filter((x) => x.r != null); if (!sets.length) return null;
      const best = sets.reduce((a, b) => (RL.metricOf(ex, b) > RL.metricOf(ex, a) ? b : a));
      const qs = sets.map((x) => x.q).filter((x) => x != null);
      return { s, sets, best, m: RL.metricOf(ex, best), q: qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : null };
    }).filter(Boolean);
    const edited = ex.builtin && S.exercises.edits[ex.id];
    return `<button class="backlink" data-act="exback">${ic("chevleft")}Exercises</button>
      ${navHTML(esc(ex.name), esc(ex.group) + " · " + esc(label(RL.EQUIPMENT, ex.equip).replace(/ \(.*\)/, "")) + " · " + esc(rangeText(ex)))}
      <div class="sec">Progress</div>${chartHTML(hist, ex, c0)}
      ${hist.length ? `<div class="sec">Sessions</div><div class="tablewrap"><table class="h"><thead><tr><th>Date</th><th>Best set</th><th>${esc(RL.metricLabel(ex, c0))}</th><th>Quality</th></tr></thead><tbody>${hist.slice().reverse().map((h) => `<tr><td>${fmtDate(h.s.date)}</td><td class="n">${fig(h.best.w, h.best.r)}</td><td class="n">${fw(h.m.toFixed(1))}</td><td class="n">${h.q != null ? h.q.toFixed(1) : "-"}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <div class="sec">Details</div><div class="panel">${exFormHTML(ex, false)}</div>
      <div class="btnrow"><button class="btn primary" data-act="saveex">Save</button>${edited ? `<button class="btn" data-act="resetex">Reset to default</button>` : ""}<button class="btn danger" data-act="delex">${ex.custom ? "Delete" : "Hide"}</button></div>`;
  }
  function chartHTML(h, ex, c0) {
    if (h.length < 2) return `<div class="empty-card"><b>Not enough data yet</b>Log this exercise in two sessions to see a trend${RL.LOAD_MEASURES.has(ex.measure) ? ". Estimated 1RM uses the Epley formula on your best set" : ""}</div>`;
    const W = 640, H = 240, L = 44, R = 36, T = 16, B = 32;
    const ev = h.map((x) => x.m);
    let lo = Math.min(...ev), hi = Math.max(...ev);
    const pad = (hi - lo) * 0.15 || 5;
    lo = Math.max(0, Math.floor(lo - pad)); hi = Math.ceil(hi + pad);
    const X = (i) => L + (W - L - R) * (i / (h.length - 1)), Y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo)), YQ = (q) => T + (H - T - B) * (1 - (q - 1) / 9);
    const ticks = [0, 1, 2, 3].map((k) => lo + (hi - lo) * k / 3);
    const pts = h.map((x, i) => X(i).toFixed(1) + "," + Y(x.m).toFixed(1)).join(" ");
    const area = `M${X(0)},${H - B} L${pts.split(" ").join(" L")} L${X(h.length - 1)},${H - B} Z`;
    const qpts = h.map((x, i) => (x.q != null ? X(i).toFixed(1) + "," + YQ(x.q).toFixed(1) : null)).filter(Boolean).join(" ");
    const every = Math.ceil(h.length / 6);
    return `<div class="chartbox"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(RL.metricLabel(ex, c0))} and quality by session">
      ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 8}" y="${Y(t) + 4}" text-anchor="end" font-size="11" font-family="var(--mono)" fill="var(--faint)">${Math.round(t)}</text>`).join("")}
      ${[1, 10].map((q) => `<text x="${W - R + 8}" y="${YQ(q) + 4}" font-size="11" font-family="var(--mono)" fill="var(--faint)">${q}</text>`).join("")}
      <path d="${area}" fill="var(--accent)" opacity=".08"/>
      ${qpts ? `<polyline points="${qpts}" fill="none" stroke="var(--faint)" stroke-width="1.5" stroke-dasharray="4 4"/>` : ""}
      <polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${h.map((x, i) => `<circle cx="${X(i)}" cy="${Y(x.m)}" r="${i === h.length - 1 ? 4.5 : 3}" fill="var(--accent)"/>${i % every === 0 || i === h.length - 1 ? `<text x="${X(i)}" y="${H - B + 20}" text-anchor="middle" font-size="11" font-family="var(--mono)" fill="var(--faint)">${fmtDate(x.s.date).replace(/^\w+, /, "")}</text>` : ""}`).join("")}
    </svg><div class="chartkey"><span><i></i>${esc(RL.metricLabel(ex, c0))}</span><span><i class="q"></i>Average quality, right axis</span></div></div>`;
  }

  /* ---------- settings ---------- */
  function seg(act, cur, list) { return `<span class="seg">${list.map(([k, l]) => `<button data-act="${act}" data-v="${k}" aria-pressed="${String(cur) === String(k)}">${esc(l)}</button>`).join("")}</span>`; }
  const setRow = (lbl, control) => `<div class="row"><span class="body"><span class="t">${lbl}</span></span>${control}</div>`;
  function renderSettings() {
    const p = S.profile, st = S.settings;
    const hiddenN = S.exercises.hidden.length, customN = S.exercises.custom.length;
    const sec = (title, body, note) => `<div><div class="sec">${title}</div>${body}${note ? `<p class="note">${note}</p>` : ""}</div>`;
    $("#v-settings").innerHTML = navHTML("Settings") + `<div class="settings">`
      + sec("Profile", `<div class="group"><dl class="kv"><dt>Experience</dt><dd>${esc(label(EXPERIENCE, p.experience))}</dd>
        <dt>Goals</dt><dd>${(p.goals || [p.goal]).map((g, i) => (i + 1) + ". " + esc(label(GOALS, g))).join("<br>")}</dd>
        <dt>Places</dt><dd>${(p.environments || [p.environment]).map((k) => esc(label(RL.ENVIRONMENTS, k))).join(", ")}</dd>
        <dt>Days a week</dt><dd>${esc(p.days)}</dd>
        <dt>Equipment</dt><dd>${p.equipment.length ? p.equipment.map((k) => esc(label(RL.EQUIPMENT, k).replace(/ \(.*\)/, ""))).join(", ") : "Bodyweight only"}</dd>
        ${p.limitations ? `<dt>Limitations</dt><dd>${esc(p.limitations)}</dd>` : ""}</dl>
        ${rowBtn("survey", "", "Retake survey", "", "")}</div>`, p.readinessFlag ? "Your health check flagged at least one item. Keep your physician or a qualified professional in the loop as you train" : "")
      + sec("Units and display", `<div class="group">${setRow("Weight", seg("setunit", st.unit, [["lb", "lb"], ["kg", "kg"]]))}${setRow("Distance", seg("setdist", st.dist, [["km", "km"], ["mi", "mi"]]))}${setRow("Appearance", seg("settheme", st.theme, [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]]))}${setRow("Tips on Train", seg("settips", st.tips ? "on" : "off", [["on", "On"], ["off", "Off"]]))}</div>`,
        "Changing units relabels your log. It does not convert numbers you already entered")
      + sec("Rest timer", `<div class="group"><div class="row">${seg("setrest", st.restSec, [[0, "Off"], [60, "1:00"], [90, "1:30"], [120, "2:00"], [180, "3:00"], [240, "4:00"]])}</div></div>`, "Starts when you log a set")
      + sec("Coaching", `<div class="group">${setRow("Target RIR", seg("setrir", st.targetRir ?? 1, [[0, "0"], [1, "1"], [2, "2"], [3, "3"]]))}${setRow("Learn from my history", seg("setadapt", st.adaptive !== false ? "on" : "off", [["on", "On"], ["off", "Off"]]))}</div>`,
        "Next-set advice compares your RIR with the target. Learning from history switches between microloads and extra reps when one keeps missing on an exercise, after 3 attempts")
      + sec("Routines", `<div class="group">${S.templates.map((t) => `<div class="row"><span class="body"><span class="t">${esc(t.name)}</span><span class="d">${plural(t.exIds.length, "exercise")}</span></span><button class="btn sm" data-act="tstart" data-id="${esc(t.id)}">Start</button><button class="iconbtn" data-act="tdel" data-id="${esc(t.id)}" aria-label="Delete routine ${esc(t.name)}">${ic("trash")}</button></div>`).join("")}
        <button class="row accent" data-act="rebuild">Rebuild starter routines</button></div>`)
      + sec("Exercise library", `<div class="group"><div class="row"><span class="body"><span class="t">${RL.EXERCISES.length} built in</span><span class="d">${customN} custom, ${hiddenN} hidden</span></span></div><button class="row accent" data-act="newex">New exercise</button>${hiddenN ? `<button class="row accent" data-act="unhide">Show hidden exercises</button>` : ""}</div>`)
      + sec("Your data", `<div class="group"><div class="row"><span class="body"><span class="t">${serverMode ? "Synced to your server" : "Stored on this device"}</span><span class="d" id="syncText">${esc(syncText)}</span></span></div>
        <button class="row accent" data-act="export">Export backup</button><button class="row accent" data-act="csv">Export sets as CSV</button>
        <label class="row accent filebtn">Import backup<input type="file" id="importFile" accept="application/json,.json" hidden></label>
        <button class="row danger" data-act="wipe">Delete all data</button></div>`, serverMode ? "" : "Clearing this browser's site data deletes your log. Export a backup regularly")
      + sec("About", `<div class="group"><div class="row"><span class="body credit">Inspired by <a href="https://www.instagram.com/trainingbyjp/" target="_blank" rel="noopener noreferrer">@trainingbyjp</a> and his approach to training: log every set against last time, judge how well you moved, and take one small step forward. Rep Ledger is independent and not affiliated with or endorsed by him.</span></div>
        ${rowBtn("legal", "", "Disclaimer", S.consent ? "Accepted " + esc(new Date(S.consent.acceptedAt).toLocaleDateString()) : "", "")}
        <div class="row"><span class="body"><span class="t">Version</span></span><span class="end">${VERSION}</span></div></div>`, "Free and open source under the MIT License")
      + `</div>`;
  }

  /* ---------- rest timer ---------- */
  let timerEnd = 0, timerInt = null;
  function startTimer(sec) {
    if (!sec) return;
    timerEnd = Date.now() + sec * 1000;
    clearInterval(timerInt);
    timerInt = setInterval(drawTimer, 250);
    drawTimer();
  }
  function stopTimer() { clearInterval(timerInt); timerInt = null; timerEnd = 0; $("#timer").innerHTML = ""; }
  function drawTimer() {
    const left = Math.round((timerEnd - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(timerInt); timerInt = null;
      if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
      $("#timer").innerHTML = `<div class="timer done" role="status"><span class="lbl">Rest</span><b>Go</b><button data-act="tskip">Close</button></div>`;
      setTimeout(() => { if (!timerInt) $("#timer").innerHTML = ""; }, 6000);
      return;
    }
    const m = Math.floor(left / 60), s = String(left % 60).padStart(2, "0");
    $("#timer").innerHTML = `<div class="timer" role="timer" aria-label="Rest timer"><span class="lbl">Rest</span><b>${m}:${s}</b><button data-act="tadj" data-v="-15">-15</button><button data-act="tadj" data-v="15">+15</button><button data-act="tskip">Skip</button></div>`;
  }

  /* ---------- sheets ---------- */
  function modal(html, small, widebox) { $("#modal").innerHTML = `<div class="modal" data-act="close-bg"><div class="box ${widebox ? "wide" : ""}" role="dialog" aria-modal="true"><div class="grab" aria-hidden="true"></div>${html}</div></div>`; }
  function closeModal() { $("#modal").innerHTML = ""; }
  const confirmBox = (title, text, yesAct, yesLabel, extra) => modal(`<div class="mh"><h2>${esc(title)}</h2></div><p>${text}</p><div class="ctabar"><button class="btn back" data-act="close">Cancel</button><button class="btn danger" data-act="${yesAct}" ${extra || ""}>${esc(yesLabel)}</button></div>`, true);
  const notice = (title, text) => modal(`<div class="mh"><h2>${esc(title)}</h2></div><p>${text}</p><div class="ctabar"><button class="btn primary" data-act="close">OK</button></div>`, true);

  function openPlates(i, si) {
    const s = active(), c = s.items[i].sets[si], kg = S.settings.unit === "kg";
    const bars = kg ? [20, 15, 10] : [45, 35, 15];
    modal(`<div class="mh"><h2>Plate calculator</h2><button class="iconbtn" data-act="close" aria-label="Close">${ic("x")}</button></div>
      <div class="form"><label>Total (${S.settings.unit})<input class="field" id="pl-total" type="number" step="any" inputmode="decimal" value="${c.w ?? ""}"></label>
      <label>Bar<select class="field" id="pl-bar">${bars.map((b) => `<option value="${b}">${b} ${S.settings.unit}</option>`).join("")}</select></label></div>
      <div id="pl-out"></div>`, true);
    drawPlates();
  }
  function drawPlates() {
    const kg = S.settings.unit === "kg";
    const avail = kg ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
    const r = RL.plates(num($("#pl-total").value) ?? 0, num($("#pl-bar").value), avail);
    $("#pl-out").innerHTML = `<div class="sec">Each side</div><div class="plates">${r.perSide.map(([p, n]) => `<span>${n} × ${fw(p)}</span>`).join("") || `<span>Empty bar</span>`}</div>
      ${!r.ok ? `<p class="err">${r.remainder > 0 ? fw(r.remainder) + " " + S.settings.unit + " per side can't be made with standard plates" : "Total is less than the bar"}</p>` : ""}`;
  }

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function saveRoutineModal(fromId) {
    const src = fromId ? S.sessions.find((x) => x.id === fromId) : active();
    if (!src || !src.items.length) { notice("Nothing to save", "Add at least one exercise first"); return; }
    modal(`<div class="mh"><h2>Save as routine</h2></div>
      <div class="form"><label class="wide">Name<input class="field" id="r-name" value="${esc(src.label || "")}" maxlength="60" placeholder="Upper A"></label></div>
      <p class="note">${src.items.map((it) => esc(exById(it.exId).name)).join(", ")}</p>
      <div class="ctabar"><button class="btn back" data-act="close">Cancel</button><button class="btn primary" data-act="saveroutine-yes" data-id="${esc(src.id)}">Save</button></div>`, true);
    setTimeout(() => { const f = $("#r-name"); if (f && wide()) f.focus(); }, 50);
  }


  /* ---------- events ---------- */
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (!b) return;
    const a = b.dataset.act, i = +b.dataset.i, si = +b.dataset.s, s = active();
    if (a === "close-bg" && e.target !== b) return;
    if (b.tagName === "A") e.preventDefault();
    switch (a) {
      case "tab": view = b.dataset.v; render(); window.scrollTo(0, 0); break;
      case "consent": S.consent = { version: CONSENT_VERSION, acceptedAt: new Date().toISOString() }; queue(); render(); break;
      case "snext": {
        const err = collectStep();
        if (err) { $("#surveyErr").textContent = err; break; }
        if (step === 4) finishSurvey(); else { step++; renderSurvey(); window.scrollTo(0, 0); }
        break;
      }
      case "gup": case "gdown": {
        const g = draft.goals, k = +b.dataset.i, j = a === "gup" ? k - 1 : k + 1;
        if (j >= 0 && j < g.length) { [g[k], g[j]] = [g[j], g[k]]; $("#goalOrder").innerHTML = goalOrderHTML(g); }
        break;
      }
      case "sback": collectStep(); step = Math.max(0, step - 1); renderSurvey(); break;
      case "scancel": draft = null; view = "settings"; render(); break;
      case "survey": startSurvey(); break;
      case "legal": modal(`<div class="mh"><h2>Disclaimer</h2><button class="iconbtn" data-act="close" aria-label="Close">${ic("x")}</button></div><div class="legal">${DISCLAIMER}</div>`); break;
      case "hidetips": S.settings.tips = false; queue(); render(); break;
      case "rackf": prefs.rack = b.dataset.v; savePrefs(); renderLib(); break;
      case "mine": prefs.mine = !prefs.mine; savePrefs(); renderLib(); if ($("#pkl")) renderPicker(); break;
      case "start": startSession(); render(); break;
      case "tstart": case "repeat": {
        if (s) { notice("Workout in progress", "Finish or discard the current workout before starting another"); break; }
        if (a === "tstart") { const t = S.templates.find((x) => x.id === b.dataset.id); if (t) startSession(t.exIds.filter((id) => ALL.some((x) => x.id === id)), t.name); }
        else { const src = S.sessions.find((x) => x.id === b.dataset.id); if (src) startSession(src.items.map((it) => it.exId).filter((id) => ALL.some((x) => x.id === id)), src.label); }
        closeModal(); view = "train"; render(); window.scrollTo(0, 0); break;
      }
      case "add": addToSession(b.dataset.ex); break;
      case "picker": openPicker(b.dataset.at != null ? +b.dataset.at : null); break;
      case "pkf": pickRegion = b.dataset.v; renderPicker(); break;
      case "pkadd": addToSession(b.dataset.ex, pickAt); break;
      case "newex": if (!$("#pkl")) pickAt = "lib"; openNewEx(b.dataset.name || ""); break;
      case "createex": {
        const o = readExForm($("#modal"));
        if (!o.name) { $("#exErr").textContent = "Give the exercise a name."; break; }
        if (LIB.some((x) => x.name.toLowerCase() === o.name.toLowerCase())) { $("#exErr").textContent = "An exercise with that name already exists."; break; }
        const ex = Object.assign({ id: "x-" + uid(), pattern: "" }, o);
        S.exercises.custom.push(ex); refreshLib(); queue();
        if (pickAt === "lib") { pickAt = null; selEx = ex.id; exOpen = true; view = "exercises"; closeModal(); render(); toast("Added " + ex.name); }
        else { addToSession(ex.id, pickAt); toast("Added " + ex.name + " to your exercises"); }
        break;
      }
      case "rmitem": s.items.splice(i, 1); queue(); render(); break;
      case "addset": { const it = s.items[i], prev = it.sets[it.sets.length - 1]; it.sets.push(newSet(prev && prev.w, prev && prev.r)); queue(); rerenderCard(i); break; }
      case "rmset": s.items[i].sets.pop(); queue(); rerenderCard(i); break;
      case "warm": { const c = s.items[i].sets[si]; c.warm = !c.warm; applyAuto(s); queue(); rerenderCard(i); break; }
      case "done": {
        const c = s.items[i].sets[si]; c.done = !c.done;
        applyAuto(s); queue(); rerenderCard(i);
        if (c.done) startTimer(S.settings.restSec);
        break;
      }
      case "rir": { const c = s.items[i].sets[si], v = +b.dataset.v; c.rir = c.rir === v ? null : v; applyAuto(s); queue(); rerenderCard(i); break; }
      case "goalopen": openGoal[b.dataset.k] = !openGoal[b.dataset.k]; rerenderCard(i); break;
      case "noteopen": {
        openNote[b.dataset.k] = true; rerenderCard(i);
        const card = document.querySelectorAll("#slots .card")[i];
        const f = card && (b.dataset.k.startsWith("ex:") ? card.querySelector('[data-f="note"]') : card.querySelector(`[data-f="snote"][data-s="${b.dataset.k.split(":")[1]}"]`));
        if (f) f.focus();
        break;
      }
      case "q": { const c = s.items[i].sets[si], v = +b.dataset.v; c.q = c.q === v ? null : v; c.bd = null; applyAuto(s); queue(); rerenderCard(i); break; }
      case "bd": { openBd[b.dataset.k] = !openBd[b.dataset.k]; const u = b.dataset.k.split(":")[0]; rerenderCard(s.items.findIndex((x) => x.uid === u)); break; }
      case "goal": {
        const c = s.items[i].sets[si], ty = b.dataset.v, ex = exById(s.items[i].exId);
        c.goal = { type: ty, v: ty === "add" ? ((c.goal && c.goal.v) ?? RL.incOf(ex, S.settings.unit) * 2) : undefined, text: ty === "custom" ? ((c.goal && c.goal.text) || "") : undefined };
        c.goalAuto = false; queue(); rerenderCard(i); break;
      }
      case "goalauto": { s.items[i].sets[si].goalAuto = true; applyAuto(s); queue(); rerenderCard(i); break; }
      case "plates": openPlates(i, si); break;
      case "applyadv": { s.items[i].sets[si].w = +b.dataset.v; queue(); rerenderCard(i); break; }
      case "finish": {
        if (!s.items.some((it) => it.sets.some((x) => x.done))) { notice("Nothing logged yet", "Tap the check on at least one set before finishing, or discard the workout"); break; }
        s.items.forEach((it) => { it.sets = it.sets.filter((x) => x.done); });
        s.items = s.items.filter((it) => it.sets.length);
        s.status = "done"; s.ts = Date.now(); applyAuto(s); queue(); stopTimer(); render();
        openSession(s.id, true);
        break;
      }
      case "discard": confirmBox("Discard workout?", "Everything logged in this workout will be deleted. This can't be undone.", "discard-yes", "Discard"); break;
      case "discard-yes": S.sessions = S.sessions.filter((x) => x.id !== s.id); queue(); stopTimer(); closeModal(); render(); break;
      case "saveroutine": saveRoutineModal(b.dataset.id); break;
      case "saveroutine-yes": {
        const src = S.sessions.find((x) => x.id === b.dataset.id), name = ($("#r-name").value || "").trim() || src.label || "Routine";
        S.templates.push({ id: "r-" + uid(), name, exIds: src.items.map((it) => it.exId) }); queue(); closeModal(); toast("Saved routine " + name); render(); break;
      }
      case "tdel": confirmBox("Delete routine?", "Your logged sessions are not affected.", "tdel-yes", "Delete", `data-id="${esc(b.dataset.id)}"`); break;
      case "tdel-yes": S.templates = S.templates.filter((t) => t.id !== b.dataset.id); queue(); closeModal(); render(); break;
      case "rebuild": S.templates = S.templates.filter((t) => !t.id.startsWith("t-")).concat(RL.buildTemplates(LIB, S.profile)); queue(); render(); toast("Starter routines rebuilt"); break;
      case "view": openSession(b.dataset.id); break;
      case "del": confirmBox("Delete workout?", "This removes it from your history. Future goals will compare against the session before it.", "del-yes", "Delete", `data-id="${esc(b.dataset.id)}"`); break;
      case "del-yes": S.sessions = S.sessions.filter((x) => x.id !== b.dataset.id); queue(); closeModal(); render(); break;
      case "close": case "close-bg": closeModal(); break;
      case "calprev": case "calnext": { const m = new Date(calMonth); m.setMonth(m.getMonth() + (a === "calprev" ? -1 : 1)); calMonth = m.getTime(); renderHistory(); break; }
      case "calday": openDay(b.dataset.date); break;
      case "gfilter": goalFilter = b.dataset.v; renderGoals(); break;
      case "goaladd": goalDraft = { period: "month", kind: "workouts", recurring: true }; openGoalSheet(); break;
      case "gper": goalDraft.period = b.dataset.v; goalDraft.kind = $("#g-kind").value; openGoalSheet(); break;
      case "goalcreate": {
        const d = goalDraft, kind = $("#g-kind").value, err = (t) => { $("#gErr").textContent = t; };
        const g = { id: "g-" + uid(), kind, period: d.period, recurring: $("#g-rec").checked, start: Date.now(), created: new Date().toISOString() };
        if (kind === "lift") {
          g.exId = $("#g-ex").value; g.w = num($("#g-w").value); g.r = Math.round(num($("#g-r").value) || 0);
          if (!g.w || !g.r) { err("Enter the load and reps to hit"); break; }
        } else if (kind === "custom") {
          g.text = $("#g-text").value.trim(); g.done = false;
          if (!g.text) { err("Describe the goal"); break; }
        } else {
          g.target = Math.round(num($("#g-target").value) || 0);
          if (!g.target) { err("Enter a target"); break; }
        }
        S.goals.push(g); queue(); closeModal(); view = "goals"; render(); toast("Goal added");
        break;
      }
      case "goalview": openGoalDetail(b.dataset.id); break;
      case "goaltoggle": { const g = S.goals.find((x) => x.id === b.dataset.id); if (g) { g.done = !g.done; queue(); openGoalDetail(g.id); renderGoals(); } break; }
      case "goaldel": confirmBox("Delete goal?", "Your logged workouts are not affected.", "goaldel-yes", "Delete", `data-id="${esc(b.dataset.id)}"`); break;
      case "goaldel-yes": S.goals = S.goals.filter((g) => g.id !== b.dataset.id); queue(); closeModal(); renderGoals(); break;
      case "selex": selEx = b.dataset.id; exOpen = true; render(); if (!wide()) window.scrollTo(0, 0); break;
      case "exback": exOpen = false; render(); break;
      case "saveex": {
        const o = readExForm($("#v-exercises")), ex = exById(selEx);
        if (!o.name) break;
        if (ex.custom) { Object.assign(S.exercises.custom.find((x) => x.id === ex.id), o); }
        else {
          const orig = RL.EXERCISES.find((x) => x.id === ex.id), diff = {};
          Object.keys(o).forEach((k) => { if ((o[k] ?? "") !== (orig[k] ?? "")) diff[k] = o[k]; });
          if (Object.keys(diff).length) S.exercises.edits[ex.id] = diff; else delete S.exercises.edits[ex.id];
        }
        refreshLib(); queue(); render(); toast("Saved " + o.name); break;
      }
      case "resetex": delete S.exercises.edits[selEx]; refreshLib(); queue(); render(); break;
      case "delex": {
        const ex = exById(selEx);
        confirmBox(ex.custom ? "Delete " + ex.name + "?" : "Hide " + ex.name + "?", ex.custom ? "It leaves your library. Past sessions keep their logged sets." : "It leaves the rack. Past sessions keep their logged sets, and you can show it again from Settings.", "delex-yes", ex.custom ? "Delete" : "Hide");
        break;
      }
      case "delex-yes": {
        const ex = exById(selEx);
        if (ex.custom) S.exercises.custom = S.exercises.custom.filter((x) => x.id !== ex.id); else S.exercises.hidden.push(ex.id);
        selEx = null; exOpen = false; refreshLib(); queue(); closeModal(); render(); break;
      }
      case "unhide": S.exercises.hidden = []; refreshLib(); queue(); render(); break;
      case "setunit": S.settings.unit = b.dataset.v; queue(); render(); break;
      case "setdist": S.settings.dist = b.dataset.v; queue(); render(); break;
      case "settheme": S.settings.theme = b.dataset.v; applyTheme(); queue(); render(); break;
      case "settips": S.settings.tips = b.dataset.v === "on"; queue(); render(); break;
      case "setrest": S.settings.restSec = +b.dataset.v; queue(); render(); break;
      case "setrir": S.settings.targetRir = +b.dataset.v; queue(); render(); break;
      case "setadapt": S.settings.adaptive = b.dataset.v === "on"; queue(); render(); break;
      case "tadj": timerEnd += +b.dataset.v * 1000; drawTimer(); break;
      case "tskip": stopTimer(); break;
      case "export": download("rep-ledger-backup-" + today() + ".json", JSON.stringify(S, null, 2), "application/json"); break;
      case "csv": download("rep-ledger-sets-" + today() + ".csv", RL.toCSV(S, exById, ctx()), "text/csv"); break;
      case "wipe": confirmBox("Delete all data?", "Every session, routine, custom exercise and survey answer will be deleted" + (serverMode ? " from this browser and the server" : "") + ". Export a backup first if you might want it back.", "wipe-yes", "Delete everything"); break;
      case "wipe-yes": S = RL.emptyState(); refreshLib(); stopTimer(); closeModal(); draft = null; view = "train"; queue(); render(); break;
      case "import-yes": {
        const keep = { consent: S.consent, profile: S.profile };
        S = pendingImport; pendingImport = null;
        if (!S.consent) S.consent = keep.consent;
        if (!S.profile) S.profile = keep.profile;
        refreshLib(); applyTheme(); queue(); closeModal(); render(); toast("Backup imported");
        break;
      }
    }
  });

  let pendingImport = null;
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el.id === "c-agree" || el.id === "c-age") { $("#consentBtn").disabled = !($("#c-agree").checked && $("#c-age").checked); return; }
    if (draft && $("#surveyErr")) $("#surveyErr").textContent = "";
    if (el.name === "environments" && draft) {
      const picked = [...document.querySelectorAll('input[name="environments"]:checked')].map((x) => x.value);
      const kit = new Set(RL.ENVIRONMENTS.filter(([k]) => picked.includes(k)).flatMap(([, , eq]) => eq));
      document.querySelectorAll('input[name="equipment"]').forEach((x) => { x.checked = kit.has(x.value); });
      return;
    }
    if (el.name === "goals" && draft) {
      if (el.checked && !draft.goals.includes(el.value)) draft.goals.push(el.value);
      if (!el.checked) draft.goals = draft.goals.filter((g) => g !== el.value);
      $("#goalOrder").innerHTML = goalOrderHTML(draft.goals);
      return;
    }
    if (/^rq\d$/.test(el.name) && draft) {
      const anyYes = [...document.querySelectorAll('#v-onboard input[value="yes"]:checked')].length > 0;
      const box = $("#clearBox");
      if (anyYes && !box.innerHTML) box.innerHTML = clearanceHTML(false);
      if (!anyYes) box.innerHTML = "";
      return;
    }
    if (el.id === "importFile" && el.files && el.files[0]) {
      const reader = new FileReader();
      reader.onload = () => {
        let parsed;
        try { parsed = RL.normalizeState(JSON.parse(reader.result)); } catch (err) { notice("Import failed", "That file is not a Rep Ledger backup"); return; }
        pendingImport = parsed;
        confirmBox("Replace all data?", `The backup has ${parsed.sessions.length} sessions, ${parsed.templates.length} routines and ${parsed.exercises.custom.length} custom exercises. Importing replaces everything currently stored.`, "import-yes", "Import");
      };
      reader.readAsText(el.files[0]);
      el.value = "";
      return;
    }
    if (el.id === "pl-bar") { drawPlates(); return; }
    if (el.id === "g-kind" && goalDraft) {
      goalDraft.kind = el.value; goalDraft.recurring = el.value !== "lift" && el.value !== "custom";
      openGoalSheet(); return;
    }
    const f = el.dataset.f;
    if (!f || f === "note" || f === "snote" || f === "goaltext" || f === "goalv") return;
    const s = active(); if (!s) return;
    const i = +el.dataset.i, c = s.items[i] && s.items[i].sets[+el.dataset.s];
    if (!c || !c.done) { queue(); return; } // nothing on screen depends on an unlogged set's numbers
    applyAuto(s); queue();
    setTimeout(() => rerenderCard(i), 0); // after focus has moved to the next field
  });

  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.id === "libSearch") { renderLib(); return; }
    if (el.id === "pkq") { renderPicker(); return; }
    if (el.id === "pl-total") { drawPlates(); return; }
    if (el.id === "exsearch") { exQuery = el.value; const pos = el.selectionStart; renderExercises(); const n = $("#exsearch"); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return; }
    if (el.id === "sessLabel") { active().label = el.value; queue(); return; }
    const f = el.dataset.f; if (!f) return;
    const s = active(); if (!s) return;
    const i = +el.dataset.i, si = +el.dataset.s, it = s.items[i];
    if (f === "note") { it.note = el.value; queue(); return; }
    if (f === "snote") { it.sets[si].note = el.value; queue(); return; }
    const c = it.sets[si], m = exById(it.exId).measure;
    if (f === "w") c.w = num(el.value);
    else if (f === "r") { const v = num(el.value); c.r = v == null ? null : m === "cardio" ? v : m === "time" ? Math.round(v) : Math.round(v * 2) / 2; }
    else if (f === "rir") c.rir = num(el.value);
    else if (f === "goalv") c.goal.v = num(el.value);
    else if (f === "goaltext") c.goal.text = el.value;
    else if (f.startsWith("bd.")) {
      const key = f.slice(3), keys = ["form", "exec", "pause", "breath", "rom"];
      c.bd = c.bd || Object.fromEntries(keys.map((k) => [k, c.q ?? 7]));
      c.bd[key] = +el.value;
      const out = document.getElementById("bdv-" + it.uid + ":" + si + "-" + key); if (out) out.textContent = el.value;
      c.q = Math.round(keys.reduce((a, k) => a + c.bd[k], 0) / keys.length);
    }
    queue();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("#modal").innerHTML) closeModal();
    if (e.key === "Enter" && e.target.id === "pkq") {
      e.preventDefault();
      const rows = document.querySelectorAll("#pkl .pkrow:not(.pkcreate)"), c = $("#pkl .pkcreate");
      if (rows.length === 1) rows[0].click(); else if (c && !rows.length) c.click();
    }
  });


  /* ---------- drag and drop (desktop list into the workout, and reordering) ---------- */
  function initDnD() {
    if (!window.Sortable) return;
    const lib = $("#lib"), slots = $("#slots");
    if (lib && !Sortable.get(lib)) Sortable.create(lib, { group: { name: "ex", pull: "clone", put: false }, sort: false, animation: 150, filter: ".add", preventOnFilter: false });
    if (slots && !Sortable.get(slots)) Sortable.create(slots, {
      group: { name: "ex", pull: false, put: true }, animation: 150, handle: ".handle", draggable: ".card", emptyInsertThreshold: 40,
      onAdd(ev) {
        const exId = ev.item.dataset.ex;
        let idx = 0, n = ev.item.previousElementSibling;
        while (n) { if (n.classList.contains("card")) idx++; n = n.previousElementSibling; }
        ev.item.remove();
        if (exId) addToSession(exId, idx);
      },
      onUpdate(ev) {
        const s = active(); if (!s) return;
        const [m] = s.items.splice(ev.oldDraggableIndex, 1);
        s.items.splice(ev.newDraggableIndex, 0, m);
        queue(); render();
      },
    });
  }

  window.addEventListener("pagehide", () => { if (dirty) { clearTimeout(flushTimer); flush(); } });
  let lastWide = wide();
  window.addEventListener("resize", () => { if (wide() !== lastWide) { lastWide = wide(); if (loaded) render(); } });
  connect();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
