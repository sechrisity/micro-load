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

  /* ---------- state ---------- */
  let S = RL.emptyState();
  let LIB = [], ALL = [], SORTED = []; // SORTED: alphabetical, for display. LIB order is the routine builder's preference order.
  let view = "train", selEx = null, exQuery = "", openBd = {}, loaded = false, serverMode = false;
  let draft = null, step = 0, pickAt = null, pickRegion = "all";
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
  function setSync(t) { $("#sync").textContent = t; }

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
  function renderGate() {
    $("#v-onboard").innerHTML = `<div class="panel">
      <h1>Before you start</h1>
      <p>Please read this. It covers what Rep Ledger is, what it is not, and who is responsible for your training.</p>
      <div class="legal" tabindex="0" aria-label="Disclaimer">${DISCLAIMER}</div>
      <label class="check"><input type="checkbox" id="c-agree"><span>I have read and agree to this disclaimer and the MIT License. I use Rep Ledger at my own risk.</span></label>
      <label class="check"><input type="checkbox" id="c-age"><span>I am 18 or older, or I have permission from a parent or guardian and train under their supervision.</span></label>
      <div class="btnrow end"><button class="btn primary" data-act="consent" id="consentBtn" disabled>Agree and continue</button></div>
    </div>`;
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
  const radios = (name, list, cur) => `<div class="opts">${list.map(([k, l, d]) => `<label class="opt"><input type="radio" name="${name}" value="${esc(k)}" ${cur === k ? "checked" : ""}><span><b>${esc(l)}</b>${d ? `<small>${esc(d)}</small>` : ""}</span></label>`).join("")}</div>`;

  const checks = (name, list, cur) => `<div class="opts">${list.map(([k, l, d]) => `<label class="opt"><input type="checkbox" name="${name}" value="${esc(k)}" ${cur.includes(k) ? "checked" : ""}><span><b>${esc(l)}</b>${d ? `<small>${esc(d)}</small>` : ""}</span></label>`).join("")}</div>`;
  const goalOrderHTML = (goals) => goals.length < 2 ? "" : `<div class="q-block"><b class="small">Priority order</b><ol class="rank">${goals.map((g, i) => `<li><span class="nm">${esc(label(GOALS, g))}</span>
    <button class="iconbtn" data-act="gup" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="Move ${esc(label(GOALS, g))} up">&uarr;</button>
    <button class="iconbtn" data-act="gdown" data-i="${i}" ${i === goals.length - 1 ? "disabled" : ""} aria-label="Move ${esc(label(GOALS, g))} down">&darr;</button></li>`).join("")}</ol></div>`;

  function renderSurvey() {
    const d = draft, n = 5;
    const bar = `<div class="steps" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<span class="${i <= step ? "on" : ""}"></span>`).join("")}</div>`;
    let body = "";
    if (step === 0) {
      body = `<h2>About you</h2><p class="muted">This sets your starting rep ranges and how much help the app shows. You can change everything later.</p>
        <fieldset class="q-block"><legend>How long have you been training?</legend>${radios("experience", EXPERIENCE, d.experience)}</fieldset>
        <fieldset class="q-block"><legend>What are your main goals?</legend><p class="help">Pick one or more, then put them in order. Your top goal sets your rep ranges.</p>${checks("goals", GOALS, d.goals)}</fieldset>
        <div id="goalOrder">${goalOrderHTML(d.goals)}</div>`;
    } else if (step === 1) {
      body = `<h2>Where you train</h2><p class="muted">The exercise rack shows what you can do with your equipment. Bodyweight exercises are always included.</p>
        <fieldset class="q-block"><legend>Where do you train?</legend><p class="help">Pick every place you train.</p>${checks("environments", RL.ENVIRONMENTS.map(([k, l]) => [k, l]), d.environments)}</fieldset>
        <fieldset class="q-block"><legend>Equipment you have access to</legend><p class="help">Your places fill this in. Adjust it to match what you actually have.</p>
        <div class="opts">${RL.EQUIPMENT.filter(([k]) => k !== "bodyweight").map(([k, l]) => `<label class="opt"><input type="checkbox" name="equipment" value="${k}" ${d.equipment.includes(k) ? "checked" : ""}><span><b>${esc(l)}</b></span></label>`).join("")}</div></fieldset>`;
    } else if (step === 2) {
      body = `<h2>Schedule and units</h2>
        <fieldset class="q-block"><legend>How many days a week do you plan to train?</legend>${radios("days", DAYS, String(d.days))}</fieldset>
        <fieldset class="q-block"><legend>Weight unit</legend>${radios("unit", [["lb", "Pounds (lb)"], ["kg", "Kilograms (kg)"]], d.unit)}</fieldset>
        <fieldset class="q-block"><legend>Distance unit</legend>${radios("dist", [["km", "Kilometres (km)"], ["mi", "Miles (mi)"]], d.dist)}</fieldset>`;
    } else if (step === 3) {
      const anyYes = d.readiness.some((x) => x === "yes");
      body = `<h2>Health check</h2><p class="muted">These questions follow common pre-exercise screening practice. They are not a medical assessment, and your answers stay in your Rep Ledger data.</p>
        <div>${READINESS.map((q, i) => `<div class="yn"><span>${esc(q)}</span><span class="ch" role="radiogroup" aria-label="${esc(q)}">
          <label><input type="radio" name="rq${i}" value="yes" ${d.readiness[i] === "yes" ? "checked" : ""}>Yes</label>
          <label><input type="radio" name="rq${i}" value="no" ${d.readiness[i] === "no" ? "checked" : ""}>No</label></span></div>`).join("")}</div>
        <div id="clearBox">${anyYes ? clearanceHTML(d.cleared) : ""}</div>
        <fieldset class="q-block"><legend>Injuries or limitations (optional)</legend><p class="help">A private note for yourself, shown on the Settings page. The app does not change your plan based on it.</p>
        <textarea class="field" name="limitations" rows="2" maxlength="500">${esc(d.limitations)}</textarea></fieldset>`;
    } else {
      const tmpl = RL.buildTemplates(LIB, Object.assign({}, d, { goal: d.goals[0] }));
      const rng = (g) => RL.RANGES[g] || RL.RANGES.muscle;
      body = `<h2>Your setup</h2>
        <dl class="kv">
          <dt>Experience</dt><dd>${esc(label(EXPERIENCE, d.experience))}</dd>
          <dt>Goals</dt><dd>${d.goals.map((g, i) => (i + 1) + ". " + esc(label(GOALS, g))).join("<br>")}</dd>
          <dt>Places</dt><dd>${d.environments.map((k) => esc(label(RL.ENVIRONMENTS, k))).join(", ")}</dd>
          <dt>Rep ranges</dt><dd>${rng(d.goals[0])[0].join("-")} on compound lifts, ${rng(d.goals[0])[1].join("-")} on isolation work</dd>
          <dt>Equipment</dt><dd>${d.equipment.length ? d.equipment.map((k) => esc(label(RL.EQUIPMENT, k))).join(", ") : "Bodyweight only"}</dd>
          <dt>Exercises available</dt><dd>${LIB.filter((e) => new Set([...d.equipment, "bodyweight"]).has(e.equip)).length} of ${LIB.length}</dd>
          <dt>Starter routines</dt><dd>${tmpl.map((t) => esc(t.name)).join(", ") || "None"}</dd>
        </dl>
        ${S.profile ? `<label class="check"><input type="checkbox" name="rebuild" ${d.rebuild ? "checked" : ""}><span>Replace my starter routines with these. Routines I saved myself are kept.</span></label>` : ""}
        <p class="muted small">Starter routines are a sensible place to begin, not a prescription. Swap exercises freely.</p>`;
    }
    $("#v-onboard").innerHTML = `<div class="panel">${bar}${body}<div class="err" id="surveyErr" role="alert"></div>
      <div class="btnrow end">${step > 0 ? `<button class="btn" data-act="sback">Back</button>` : S.profile ? `<button class="btn" data-act="scancel">Cancel</button>` : ""}
      <button class="btn primary" data-act="snext">${step === n - 1 ? (S.profile ? "Save" : "Start training") : "Next"}</button></div></div>`;
  }
  const clearanceHTML = (on) => `<div class="notice bad">You answered yes to at least one question. Get clearance from a physician or qualified professional before you start, and tell them what kind of training you plan to do.</div>
    <label class="check"><input type="checkbox" name="cleared" ${on ? "checked" : ""}><span>I have clearance, or I will get it before training.</span></label>`;

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
      const last = lastFor(it.exId, session.status === "active" ? null : session.ts, session.id);
      const wi = workIndex(it.sets);
      it.sets.forEach((c, i) => {
        if (c.warm) { c.goal = null; c.why = ""; return; }
        if (!c.done || c.goalAuto === false) return;
        const sg = RL.suggest(c, last ? last.it.sets[wi[i]] : null, ex, c0);
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
  function render() {
    const onboarding = !S.consent || S.consent.version !== CONSENT_VERSION || !S.profile || view === "onboard";
    $("#tabs").hidden = onboarding; $("#meta").hidden = onboarding; $("#foot").hidden = onboarding;
    ["onboard", "train", "history", "exercises", "settings"].forEach((v) => { $("#v-" + v).hidden = onboarding ? v !== "onboard" : v !== view; });
    if (onboarding) {
      if (!S.consent || S.consent.version !== CONSENT_VERSION) return renderGate();
      if (!draft) { startSurvey(); return; }
      return renderSurvey();
    }
    document.querySelectorAll("nav.tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.v === view)));
    $("#labels").innerHTML = [...new Set(S.sessions.map((s) => s.label).filter(Boolean))].map((l) => `<option value="${esc(l)}">`).join("");
    $("#groups").innerHTML = RL.GROUPS.map((g) => `<option value="${esc(g)}">`).join("");
    if (view === "train") renderTrain();
    else if (view === "history") renderHistory();
    else if (view === "exercises") renderExercises();
    else renderSettings();
  }

  function renderLib() {
    const q = ($("#libSearch").value || "").toLowerCase().trim();
    const s = active(), inS = new Set(s ? s.items.map((i) => i.exId) : []);
    $("#rackf").innerHTML = regionChips(prefs.rack, "rackf") + `<button class="chip ${prefs.mine ? "on" : ""}" data-act="mine" aria-pressed="${prefs.mine}">My equipment</button>`;
    const list = SORTED.filter((e) => rackMatch(e, prefs.rack, prefs.mine, q));
    $("#lib").innerHTML = list.map((e) => `<li data-ex="${esc(e.id)}" class="${inS.has(e.id) ? "in-session" : ""}"><div class="nm">${esc(e.name)}<div class="grp">${esc(e.group)} · ${esc(rangeText(e))} · ${esc(RL.wUnit(e, ctx()))}</div></div><button class="add" data-act="add" data-ex="${esc(e.id)}" aria-label="Add ${esc(e.name)}">+</button></li>`).join("")
      || `<li class="muted">No match. Use "+ Add exercise" to create it.</li>`;
  }

  function renderTips() {
    $("#tips").innerHTML = S.settings.tips ? `<div class="tips"><b>How Rep Ledger works</b><ul>
      <li>Add exercises in the order you'll train them. Each one loads your sets from last time with a goal for today.</li>
      <li>Enter load and reps, then tap <b>Log set</b>. Mark warm-ups with <b>W</b> so they don't count toward progress.</li>
      <li><b>RIR</b> (reps in reserve) is how many more clean reps you could have done. 0 means none left.</li>
      <li><b>Quality</b> 1-10 rates how well you executed the set: form, control, range of motion.</li>
      <li>After each set you get a suggested goal for next session. Accept it or pick your own.</li>
      <li>Stop any set that causes pain. Progress is never worth an injury.</li></ul>
      <div class="btnrow"><button class="btn sm" data-act="hidetips">Got it, hide tips</button></div></div>` : "";
  }

  function renderTrain() {
    renderLib();
    renderTips();
    const s = active();
    if (!s) {
      const seen = new Set();
      const recent = doneSessions().filter((r) => { const k = (r.label || "").toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 4);
      $("#sessHead").innerHTML = `<h2>Today</h2><span class="date">${fmtDate(today())}</span>`;
      $("#slots").innerHTML = `<li class="drop" data-static><b>No session running</b>Start a routine, repeat a past day, or drop an exercise here. Goals from the last time you did each exercise load in automatically.
        ${S.templates.length ? `<div class="row">${S.templates.map((t) => `<button class="btn primary" data-act="tstart" data-id="${esc(t.id)}">Start ${esc(t.name)}</button>`).join("")}</div>` : ""}
        <div class="row">${recent.map((r) => `<button class="btn" data-act="repeat" data-id="${esc(r.id)}">Repeat ${esc(r.label || "session")} · ${fmtDate(r.date)}</button>`).join("")}<button class="btn" data-act="start">Start empty session</button></div></li>`;
      return;
    }
    $("#sessHead").innerHTML = `<input class="label" id="sessLabel" list="labels" value="${esc(s.label)}" placeholder="Session name" aria-label="Session name"><span class="date">${fmtDate(s.date)}</span>
      <div class="acts"><button class="btn sm" data-act="saveroutine">Save as routine</button><button class="btn danger sm" data-act="discard">Discard</button><button class="btn dark" data-act="finish">Finish session</button></div>`;
    const ins = (i) => `<li class="insert" data-static><button data-act="picker" data-at="${i}" aria-label="Insert an exercise at position ${i + 1}">+ Insert exercise</button></li>`;
    $("#slots").innerHTML = (s.items.length ? s.items.map((it, i) => ins(i) + cardHTML(s, it, i)).join("")
      : `<li class="drop" data-static><b>Add your first exercise</b>Drag from the rack or tap the button below.</li>`)
      + `<li class="addrow" data-static><button class="btn addex" data-act="picker">+ Add exercise</button></li>`;
  }

  function cardHTML(s, it, i) {
    const ex = exById(it.exId), c0 = ctx(), last = lastFor(it.exId, null, s.id), prior = earlierSets(it.exId, null, s.id);
    const lastTxt = last
      ? "Last · " + fmtDate(last.s.date) + ": " + last.it.sets.map((x) => `<b>${fw(x.w)}×${x.r ?? "-"}</b>${x.rir != null ? " @" + x.rir : ""}${x.q != null ? " (" + x.q + "/10)" : ""}`).join(" · ")
      : "First time logging this exercise. Today sets your baseline.";
    const wi = workIndex(it.sets);
    return `<li class="card" data-uid="${it.uid}">
      <div class="card-h"><span class="handle" title="Drag to reorder" aria-hidden="true">⋮⋮</span><span class="slotno">${i + 1}</span><div class="nm">${esc(ex.name)}</div><span class="sub">${esc(rangeText(ex))}</span><button class="iconbtn" data-act="rmitem" data-i="${i}" aria-label="Remove ${esc(ex.name)}">×</button></div>
      ${ex.cues ? `<details class="cues"><summary>Cues</summary>${esc(ex.cues)}</details>` : ""}
      <div class="last">${lastTxt}</div>
      <div class="sets">${it.sets.map((c, si) => setHTML(it, ex, c, si, wi[si], last && wi[si] >= 0 ? last.it.sets[wi[si]] : null, i, prior, c0)).join("")}</div>
      <div class="card-f"><button class="btn sm" data-act="addset" data-i="${i}">+ Set</button>${it.sets.length > 1 ? `<button class="btn sm" data-act="rmset" data-i="${i}">- Set</button>` : ""}
        <textarea data-f="note" data-i="${i}" rows="1" placeholder="Notes: setup, cues, how it felt" aria-label="Exercise notes">${esc(it.note)}</textarea></div>
    </li>`;
  }

  function setHTML(it, ex, c, si, w, p, i, prior, c0) {
    const t = c.warm ? null : RL.targetOf(p, ex, c0), pg = p && p.goal, k = it.uid + ":" + si;
    const cw = c.w ?? (RL.LOAD_MEASURES.has(ex.measure) ? null : 0);
    const hit = t && c.done && cw != null && c.r != null && cw >= t.w && c.r >= t.r;
    const d = `data-i="${i}" data-s="${si}"`;
    let target = "";
    if (p && !c.warm) {
      target = pg && pg.type === "custom" ? `<span class="target">Goal: <b>${esc(pg.text)}</b></span>`
        : t ? `<span class="target ${hit ? "hit" : ""}">${hit ? "Goal hit · " : "Goal: "}${esc(RL.goalLabel(pg || { type: "hold" }, ex, c0))} → <b>${fw(t.w)} × ${t.r}</b></span>` : "";
    }
    const isCardio = ex.measure === "cardio", showRir = !isCardio && ex.measure !== "time";
    const qs = Array.from({ length: 10 }, (_, n) => n + 1).map((n) => `<button class="${c.q === n ? "on" : c.q && n < c.q ? "lit" : ""}" data-act="q" ${d} data-v="${n}" aria-label="Quality ${n}">${n}</button>`).join("");
    const BD = [["form", "Form"], ["exec", "Execution"], ["pause", "Pauses / tempo"], ["breath", "Breathing"], ["rom", "Range of motion"]];
    const bd = openBd[k] ? `<div class="bd">${BD.map(([key, lab]) => { const v = (c.bd && c.bd[key]) ?? c.q ?? 7; return `<label><span>${lab}<b id="bdv-${k}-${key}">${v}</b></span><input type="range" min="1" max="10" step="1" value="${v}" data-f="bd.${key}" ${d}></label>`; }).join("")}</div>` : "";
    let result = "";
    if (c.done && !c.warm) {
      const pr = RL.progression(c, p, ex, c0), g = c.goal, isPr = RL.isPR(c, prior, ex);
      result = `<div class="result"><div class="btnrow">${pr ? `<span class="prog ${pr.kind}">${esc(pr.text)}${p ? " vs last" : ""}</span>` : ""}${isPr ? `<span class="prog pr">New PR</span>` : ""}</div>
        <div class="goalrow"><span class="lbl">Next session</span>${RL.goalTypes(ex, c0).map(([ty, l]) => `<button class="chip ${g && g.type === ty ? "on" : ""}" data-act="goal" ${d} data-v="${ty}">${esc(l)}</button>`).join("")}
        ${g && g.type === "add" ? `<input class="v" type="number" step="any" inputmode="decimal" value="${g.v ?? ""}" placeholder="${esc(RL.wUnit(ex, c0))}" data-f="goalv" ${d} aria-label="Load to add">` : ""}
        ${g && g.type === "custom" ? `<input type="text" value="${esc(g.text || "")}" placeholder="e.g. 3s eccentric" data-f="goaltext" ${d} aria-label="Custom goal">` : ""}</div>
        <div class="why">${c.goalAuto !== false && c.why ? `<em>Suggested:</em> ${esc(c.why)}` : c.goalAuto === false ? `Your call. <button class="linkbtn" data-act="goalauto" ${d}>Use suggestion</button>` : ""}</div></div>`;
    }
    const plateBtn = ex.equip === "barbell" && ex.measure === "total" ? `<button class="linkbtn" data-act="plates" ${d}>Plates</button>` : "";
    return `<div class="set ${c.done ? "done" : ""} ${c.warm ? "warm" : ""}">
      <div class="set-top"><span class="setno">${c.warm ? "Warm" : "Set " + (w + 1)}</span>${target}
        <button class="warmbtn" data-act="warm" ${d} aria-pressed="${!!c.warm}" title="Warm-up set">W</button>
        <button class="donebtn" data-act="done" ${d} aria-pressed="${!!c.done}">${c.done ? "Logged" : "Log set"}</button></div>
      <div class="inputs"><label class="num"><input type="number" step="any" inputmode="decimal" value="${c.w ?? ""}" placeholder="${t ? fw(t.w) : "0"}" data-f="w" ${d} aria-label="${isCardio ? "Distance" : "Load"}"><span>${esc(RL.wUnit(ex, c0))}</span></label>
        <span class="x">×</span><label class="num"><input class="reps" type="number" step="${isCardio ? "any" : ex.measure === "time" ? "1" : "0.5"}" inputmode="decimal" value="${c.r ?? ""}" placeholder="${t ? t.r : "0"}" data-f="r" ${d} aria-label="${esc(RL.rUnit(ex))}"><span>${RL.rUnit(ex)}</span></label>
        ${showRir ? `<label class="rir"><select data-f="rir" ${d} aria-label="Reps in reserve"><option value="">RIR</option>${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${c.rir === n ? "selected" : ""}>${n} RIR</option>`).join("")}</select></label>` : ""}${plateBtn}</div>
      ${c.warm ? "" : `<div class="q"><span class="q-label">Quality</span><div class="qscale">${qs}</div><button class="linkbtn" data-act="bd" data-k="${k}">${openBd[k] ? "Hide breakdown" : "Rate form, tempo, breathing"}</button></div>`}
      ${p && p.note ? `<div class="lastnote"><span>Last time</span> ${esc(p.note)}</div>` : ""}
      <input class="setnote" type="text" value="${esc(c.note || "")}" placeholder="Set note: cue, pain, setup, what to fix" data-f="snote" ${d} aria-label="Note for this set">
      ${bd}${result}</div>`;
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
    modal(`<div class="mh"><h2>${at == null ? "Add exercise" : "Insert exercise"}</h2><button class="iconbtn" data-act="close" aria-label="Close">×</button></div>
      <input type="search" id="pkq" class="pkq" placeholder="Search, or type a new exercise name" aria-label="Search or name a new exercise" autocomplete="off">
      <div class="rackf" id="pkf"></div><div id="pkl" class="pkl"></div>`, true);
    renderPicker();
    setTimeout(() => { const q = $("#pkq"); if (q) q.focus(); }, 50);
  }
  function renderPicker() {
    const q = ($("#pkq") ? $("#pkq").value : "").trim(), ql = q.toLowerCase();
    const s = active(), inS = new Set(s ? s.items.map((i) => i.exId) : []);
    $("#pkf").innerHTML = regionChips(pickRegion, "pkf") + `<button class="chip ${prefs.mine ? "on" : ""}" data-act="mine" aria-pressed="${prefs.mine}">My equipment</button>`;
    const list = SORTED.filter((e) => rackMatch(e, pickRegion, prefs.mine, ql));
    const exact = LIB.some((e) => e.name.toLowerCase() === ql);
    const create = q && !exact ? `<button class="pkrow pkcreate" data-act="newex" data-name="${esc(q)}"><span class="nm">Create "${esc(q)}"</span><span class="muted">Set its muscle group, equipment and how it's measured</span></button>` : "";
    $("#pkl").innerHTML = create + (list.map((e) => `<button class="pkrow" data-act="pkadd" data-ex="${esc(e.id)}"><span class="nm">${esc(e.name)}</span><span class="muted">${esc(e.group)} · ${esc(label(RL.EQUIPMENT, e.equip))}</span>${inS.has(e.id) ? `<span class="tag">In session</span>` : ""}</button>`).join("")
      || (q ? "" : `<div class="empty">Nothing here with your equipment. Turn off "My equipment" to see everything.</div>`));
  }

  /* ---------- exercise form (new and edit) ---------- */
  function exFormHTML(ex, isNew) {
    const c0 = ctx(), r = RL.repRange(Object.assign({}, ex, { repMin: null, repMax: null }), c0.goal);
    const opt = (list, cur) => list.map(([k, l]) => `<option value="${k}" ${cur === k ? "selected" : ""}>${esc(l)}</option>`).join("");
    return `<div class="form">
      <label class="wide">Name<input id="f-name" value="${esc(ex.name)}" maxlength="80" ${isNew ? "autofocus" : ""}></label>
      <label>Muscle group<input id="f-group" list="groups" value="${esc(ex.group)}" maxlength="40"></label>
      <label>Region<select id="f-region">${opt(RL.REGIONS, ex.region)}</select></label>
      <label>Equipment<select id="f-equip">${opt(RL.EQUIPMENT.map(([k, l]) => [k, l.replace(/ \(.*\)/, "")]), ex.equip)}</select></label>
      <label>Measured as<select id="f-measure">${opt(RL.MEASURES, ex.measure)}</select></label>
      <label>Range low<input id="f-min" type="number" min="1" inputmode="numeric" value="${ex.repMin ?? ""}" placeholder="${r ? r[0] : "-"}"></label>
      <label>Range high<input id="f-max" type="number" min="1" inputmode="numeric" value="${ex.repMax ?? ""}" placeholder="${r ? r[1] : "-"}"></label>
      <label>Microload<input id="f-inc" type="number" step="any" min="0" inputmode="decimal" value="${ex.inc ?? ""}" placeholder="${fw(RL.incOf(Object.assign({}, ex, { inc: null }), c0.unit))}"></label>
      <label class="wide">Cues and setup notes<textarea id="f-cues" class="field" rows="3" maxlength="1000" placeholder="Seat height, grip, tempo, what to feel">${esc(ex.cues || "")}</textarea></label>
    </div><p class="muted small">Leave range and microload blank to use defaults from your goal and unit.</p>`;
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
    modal(`<div class="mh"><h2>New exercise</h2><button class="iconbtn" data-act="close" aria-label="Close">×</button></div>
      ${exFormHTML(base, true)}<div class="err" id="exErr" role="alert"></div>
      <div class="btnrow end"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="createex">${pickAt !== undefined && pickAt !== "lib" ? "Create and add" : "Create"}</button></div>`, true);
    setTimeout(() => { const f = $("#modal #f-name"); if (f) f.focus(); }, 50);
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
    return { sets, avgQ: qn ? (qsum / qn).toFixed(1) : "-", hits, targets, prs };
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
    const volHTML = Object.keys(vol).length ? `<div class="vol"><h2 class="sec-title">Working sets, last 7 days</h2>${Object.entries(vol).sort((a, b) => b[1] - a[1]).map(([g, n]) => `<div class="row"><span>${esc(g)}</span><meter min="0" max="${vmax}" value="${n}" aria-label="${esc(g)} sets">${n}</meter><b>${n}</b></div>`).join("")}</div>` : "";
    $("#v-history").innerHTML = `<div class="stats-grid">
        <div class="stat"><b>${in7.length}</b><span>Sessions, 7 days</span></div>
        <div class="stat"><b>${in30.length}</b><span>Sessions, 30 days</span></div>
        <div class="stat"><b>${streak}</b><span>Week streak</span></div>
        <div class="stat"><b>${list.length}</b><span>Total sessions</span></div></div>
      ${volHTML}
      <div class="sess-head"><h2 class="sec-title">Session history</h2></div>` + (list.length ? `<div class="hist">${list.map((s) => {
      const st = sessionStats(s);
      return `<div class="hcard"><div class="t"><b>${esc(s.label || "Session")}</b><span>${fmtDate(s.date)}</span></div>
        <div class="stats"><span><b>${s.items.length}</b> exercises</span><span><b>${st.sets}</b> sets</span><span>Quality <b>${st.avgQ}</b></span>${st.targets ? `<span>Goals hit <b>${st.hits}/${st.targets}</b></span>` : ""}${st.prs ? `<span>PRs <b>${st.prs}</b></span>` : ""}</div>
        <div class="exs">${s.items.map((it) => esc(exById(it.exId).name)).join(" → ")}</div>
        <div class="row"><button class="btn sm" data-act="view" data-id="${esc(s.id)}">Logbook</button><button class="btn sm" data-act="repeat" data-id="${esc(s.id)}">Repeat</button><button class="btn sm" data-act="saveroutine" data-id="${esc(s.id)}">Save as routine</button><button class="btn sm danger" data-act="del" data-id="${esc(s.id)}">Delete</button></div></div>`;
    }).join("")}</div>` : `<div class="empty">No finished sessions yet. Finish a session on the Train tab and it shows up here.</div>`);
  }
  function logbookHTML(s) {
    const c0 = ctx();
    return `<div class="logbook">${s.items.map((it) => {
      const ex = exById(it.exId), sets = workingDone(it.sets), warm = it.sets.filter((x) => x.done && x.warm).length, last = lastFor(it.exId, s.ts, s.id);
      const qs = sets.map((x) => x.q).filter((x) => x != null);
      const wl = ex.measure === "cardio" ? "Distance" : RL.LOAD_MEASURES.has(ex.measure) ? "Weight" : "Load", rl = RL.rUnit(ex) === "reps" ? "Reps" : RL.rUnit(ex) === "sec" ? "Seconds" : "Minutes";
      return `<div class="lb"><h3>${esc(ex.name)}</h3><div class="cols"><div>
        <div><span class="k">Sets:</span> ${sets.length}${warm ? " + " + warm + " warm-up" : ""}</div><div><span class="k">${wl}:</span> ${sets.map((x) => fw(x.w)).join(" / ")} ${esc(RL.wUnit(ex, c0))}</div><div><span class="k">${rl}:</span> ${sets.map((x) => x.r ?? "-").join(" / ")}</div>
        <div><span class="k">Progressions:</span></div>${sets.map((x, i) => { const p = RL.progression(x, last ? last.it.sets[i] : null, ex, c0); return `<div>Set ${i + 1}: ${esc(p ? p.text : "-")}</div>`; }).join("")}</div>
        <div><div class="k">Next session goal:</div>${sets.map((x, i) => `<div>Set ${i + 1}: ${esc(RL.goalLabel(x.goal, ex, c0))}</div>`).join("")}</div></div>
        <span class="q">Quality ${qs.length ? qs.join(" / ") + " · avg " + (qs.reduce((a, b) => a + b, 0) / qs.length).toFixed(1) : "not rated"}${sets.some((x) => x.rir != null) ? " · RIR " + sets.map((x) => x.rir ?? "-").join(" / ") : ""}</span>
        ${sets.map((x, i) => (x.note ? `<div class="note">Set ${i + 1}: ${esc(x.note)}</div>` : "")).join("")}
        ${it.note ? `<div class="note">${esc(it.note)}</div>` : ""}</div>`;
    }).join("")}</div>`;
  }

  /* ---------- exercises ---------- */
  function renderExercises() {
    if (!selEx || !LIB.find((e) => e.id === selEx)) selEx = SORTED[0] ? SORTED[0].id : null;
    const ex = selEx ? exById(selEx) : null, c0 = ctx();
    const q = exQuery.toLowerCase();
    const rows = SORTED.filter((e) => !q || e.name.toLowerCase().includes(q) || e.group.toLowerCase().includes(q) || e.equip.includes(q));
    const hist = ex ? doneSessions().slice().reverse().map((s) => {
      const it = s.items.find((i) => i.exId === ex.id); if (!it) return null;
      const sets = workingDone(it.sets).filter((x) => x.r != null); if (!sets.length) return null;
      const best = sets.reduce((a, b) => (RL.metricOf(ex, b) > RL.metricOf(ex, a) ? b : a));
      const qs = sets.map((x) => x.q).filter((x) => x != null);
      return { s, sets, best, m: RL.metricOf(ex, best), q: qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : null };
    }).filter(Boolean) : [];
    const edited = ex && ex.builtin && S.exercises.edits[ex.id];
    $("#v-exercises").innerHTML = `<div class="exv"><div class="exlist">
      <input type="search" class="exsearch" id="exsearch" value="${esc(exQuery)}" placeholder="Search ${LIB.length} exercises" aria-label="Search exercises">
      <div class="rows">${rows.map((e) => `<div class="row ${e.id === selEx ? "on" : ""}" data-act="selex" data-id="${esc(e.id)}" role="button" tabindex="0"><span class="nm">${esc(e.name)}${e.custom ? ` <span class="tag">Custom</span>` : ""}</span><small>${esc(e.group)}</small></div>`).join("") || `<div class="empty">No match.</div>`}</div>
      <div class="new"><button class="btn sm" data-act="newex">+ New exercise</button></div></div>
      ${ex ? `<div class="panel">${exFormHTML(ex, false)}
        <div class="btnrow"><button class="btn dark" data-act="saveex">Save changes</button>${edited ? `<button class="btn" data-act="resetex">Reset to default</button>` : ""}<button class="btn danger" data-act="delex">${ex.custom ? "Delete exercise" : "Hide from rack"}</button></div>
        <h2 class="sec-title">Progress</h2>${chartHTML(hist, ex, c0)}
        ${hist.length ? `<div class="tablewrap"><table class="h"><thead><tr><th>Date</th><th>Sets</th><th>Best set</th><th>${esc(RL.metricLabel(ex, c0))}</th><th>Quality</th></tr></thead><tbody>${hist.slice().reverse().map((h) => `<tr><td>${fmtDate(h.s.date)}</td><td>${h.sets.map((x) => fw(x.w) + "×" + x.r).join(", ")}</td><td>${fw(h.best.w)}×${h.best.r}</td><td>${fw(h.m.toFixed(1))}</td><td>${h.q != null ? h.q.toFixed(1) : "-"}</td></tr>`).join("")}</tbody></table></div>` : ""}
      </div>` : `<div class="panel empty">Add an exercise to get started.</div>`}</div>`;
  }
  function chartHTML(h, ex, c0) {
    if (h.length < 2) return `<div class="empty">Log this exercise in two sessions to see a trend line.${RL.LOAD_MEASURES.has(ex.measure) ? " Estimated 1RM uses the Epley formula on your best set." : ""}</div>`;
    const W = 640, H = 220, L = 48, R = 40, T = 16, B = 34;
    const ev = h.map((x) => x.m);
    let lo = Math.min(...ev), hi = Math.max(...ev);
    const pad = (hi - lo) * 0.15 || 5;
    lo = Math.max(0, Math.floor(lo - pad)); hi = Math.ceil(hi + pad);
    const X = (i) => L + (W - L - R) * (i / (h.length - 1)), Y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo)), YQ = (q) => T + (H - T - B) * (1 - (q - 1) / 9);
    const ticks = [0, 1, 2, 3, 4].map((k) => lo + (hi - lo) * k / 4);
    const pts = h.map((x, i) => X(i).toFixed(1) + "," + Y(x.m).toFixed(1)).join(" ");
    const area = `M${X(0)},${H - B} L${pts.split(" ").join(" L")} L${X(h.length - 1)},${H - B} Z`;
    const qpts = h.map((x, i) => (x.q != null ? X(i).toFixed(1) + "," + YQ(x.q).toFixed(1) : null)).filter(Boolean).join(" ");
    return `<div class="tablewrap"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(RL.metricLabel(ex, c0))} and quality by session">
      ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 8}" y="${Y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${Math.round(t)}</text>`).join("")}
      ${[1, 5, 10].map((q) => `<text x="${W - R + 8}" y="${YQ(q) + 4}" font-size="11" fill="var(--muted)">${q}</text>`).join("")}
      <path d="${area}" fill="var(--steel)" opacity=".10"/>
      <polyline points="${pts}" fill="none" stroke="var(--steel)" stroke-width="2.5"/>
      ${qpts ? `<polyline points="${qpts}" fill="none" stroke="var(--hazard)" stroke-width="2" stroke-dasharray="5 4"/>` : ""}
      ${h.map((x, i) => `<circle cx="${X(i)}" cy="${Y(x.m)}" r="${i === h.length - 1 ? 5 : 3.5}" fill="var(--steel)"/><text x="${X(i)}" y="${H - B + 18}" text-anchor="middle" font-size="11" fill="var(--muted)">${fmtDate(x.s.date).replace(/^\w+, /, "")}</text>`).join("")}
      <text x="${L}" y="${H - 4}" font-size="11" fill="var(--steel)">Solid: ${esc(RL.metricLabel(ex, c0))}</text><text x="${L + 220}" y="${H - 4}" font-size="11" fill="var(--warn)">Dashed: avg quality (1-10, right axis)</text>
    </svg></div>`;
  }

  /* ---------- settings ---------- */
  function seg(act, cur, list) { return `<span class="seg">${list.map(([k, l]) => `<button data-act="${act}" data-v="${k}" aria-pressed="${String(cur) === String(k)}">${esc(l)}</button>`).join("")}</span>`; }
  function renderSettings() {
    const p = S.profile, st = S.settings;
    const hiddenN = S.exercises.hidden.length, customN = S.exercises.custom.length;
    $("#v-settings").innerHTML = `<div class="settings">
      <div class="panel"><h2>Profile</h2>
        <dl class="kv"><dt>Experience</dt><dd>${esc(label(EXPERIENCE, p.experience))}</dd><dt>Goals</dt><dd>${(p.goals || [p.goal]).map((g, i) => (i + 1) + ". " + esc(label(GOALS, g))).join("<br>")}</dd>
        <dt>Places</dt><dd>${(p.environments || [p.environment]).map((k) => esc(label(RL.ENVIRONMENTS, k))).join(", ")}</dd><dt>Days a week</dt><dd>${esc(p.days)}</dd>
        <dt>Equipment</dt><dd>${p.equipment.length ? p.equipment.map((k) => esc(label(RL.EQUIPMENT, k).replace(/ \(.*\)/, ""))).join(", ") : "Bodyweight only"}</dd>
        ${p.limitations ? `<dt>Limitations</dt><dd>${esc(p.limitations)}</dd>` : ""}</dl>
        ${p.readinessFlag ? `<div class="notice">Your health check flagged at least one item. Keep your physician or qualified professional in the loop as you train.</div>` : ""}
        <div class="btnrow"><button class="btn" data-act="survey">Retake survey</button></div></div>
      <div class="panel"><h2>Units and display</h2>
        <div class="setrow"><span>Weight</span>${seg("setunit", st.unit, [["lb", "lb"], ["kg", "kg"]])}</div>
        <div class="setrow"><span>Distance</span>${seg("setdist", st.dist, [["km", "km"], ["mi", "mi"]])}</div>
        <p class="muted small">Changing units relabels your log. It does not convert numbers you already entered.</p>
        <div class="setrow"><span>Theme</span>${seg("settheme", st.theme, [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]])}</div>
        <div class="setrow"><span>Beginner tips on the Train tab</span>${seg("settips", st.tips ? "on" : "off", [["on", "On"], ["off", "Off"]])}</div></div>
      <div class="panel"><h2>Rest timer</h2>
        <p class="muted small">Starts when you log a set. Vibrates when time is up on devices that support it.</p>
        <div class="setrow">${seg("setrest", st.restSec, [[0, "Off"], [60, "1:00"], [90, "1:30"], [120, "2:00"], [180, "3:00"], [240, "4:00"]])}</div></div>
      <div class="panel"><h2>Routines</h2>
        <div class="tlist">${S.templates.map((t) => `<div class="row"><span class="nm">${esc(t.name)} <span class="muted small">${t.exIds.length} exercises</span></span><button class="btn sm" data-act="tstart" data-id="${esc(t.id)}">Start</button><button class="iconbtn" data-act="tdel" data-id="${esc(t.id)}" aria-label="Delete routine ${esc(t.name)}">×</button></div>`).join("") || `<div class="muted small">No routines. Save one from a session, or rebuild the starter set.</div>`}</div>
        <div class="btnrow"><button class="btn sm" data-act="rebuild">Rebuild starter routines</button></div></div>
      <div class="panel"><h2>Exercise library</h2>
        <p class="small">${RL.EXERCISES.length} built-in, ${customN} custom, ${hiddenN} hidden.</p>
        <div class="btnrow"><button class="btn sm" data-act="newex">+ New exercise</button>${hiddenN ? `<button class="btn sm" data-act="unhide">Show hidden exercises again</button>` : ""}</div></div>
      <div class="panel"><h2>Your data</h2>
        <p class="small">${serverMode ? "Stored on your Rep Ledger server, with a copy in this browser for offline use." : "Stored in this browser only. Export a backup regularly; clearing site data deletes it."}</p>
        <div class="btnrow"><button class="btn sm" data-act="export">Export backup (JSON)</button><button class="btn sm" data-act="csv">Export sets (CSV)</button>
        <label class="btn sm">Import backup<input type="file" id="importFile" accept="application/json,.json" hidden></label></div>
        <div class="btnrow"><button class="btn sm danger" data-act="wipe">Delete all data</button></div></div>
      <div class="panel"><h2>Legal and credits</h2>
        <p class="small">Disclaimer accepted ${S.consent ? esc(new Date(S.consent.acceptedAt).toLocaleDateString()) : "-"}. <button class="linkbtn" data-act="legal">Read it again</button></p>
        <p class="credit">Inspired by <a href="https://www.instagram.com/trainingbyjp/" target="_blank" rel="noopener noreferrer">@trainingbyjp</a> and his approach to training: log every set against last time, rate how well you did it, and pick one small step forward for next session. Rep Ledger is independent and not affiliated with or endorsed by him.</p>
        <p class="muted small">Rep Ledger ${VERSION}. Free and open source under the MIT License.</p></div>
    </div>`;
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

  /* ---------- modals ---------- */
  function modal(html, small) { $("#modal").innerHTML = `<div class="modal" data-act="close-bg"><div class="box ${small ? "small" : ""}" role="dialog" aria-modal="true">${html}</div></div>`; }
  function closeModal() { $("#modal").innerHTML = ""; }
  const confirmBox = (title, text, yesAct, yesLabel, extra) => modal(`<div class="mh"><h2>${esc(title)}</h2></div><p>${text}</p><div class="btnrow"><button class="btn danger" data-act="${yesAct}" ${extra || ""}>${esc(yesLabel)}</button><button class="btn" data-act="close">Cancel</button></div>`, true);

  function openPlates(i, si) {
    const s = active(), c = s.items[i].sets[si], kg = S.settings.unit === "kg";
    const bars = kg ? [20, 15, 10] : [45, 35, 15];
    modal(`<div class="mh"><h2>Plate calculator</h2><button class="iconbtn" data-act="close" aria-label="Close">×</button></div>
      <div class="form"><label>Total weight (${S.settings.unit})<input id="pl-total" type="number" step="any" inputmode="decimal" value="${c.w ?? ""}"></label>
      <label>Bar<select id="pl-bar">${bars.map((b) => `<option value="${b}">${b} ${S.settings.unit}</option>`).join("")}</select></label></div>
      <div id="pl-out"></div>`, true);
    drawPlates();
  }
  function drawPlates() {
    const kg = S.settings.unit === "kg";
    const avail = kg ? [25, 20, 15, 10, 5, 2.5, 1.25] : [45, 35, 25, 10, 5, 2.5];
    const r = RL.plates(num($("#pl-total").value) ?? 0, num($("#pl-bar").value), avail);
    $("#pl-out").innerHTML = `<p class="small"><b>Each side:</b></p><div class="plates">${r.perSide.map(([p, n]) => `<span>${n} × ${fw(p)}</span>`).join("") || `<span>Empty bar</span>`}</div>
      ${!r.ok ? `<p class="err">${r.remainder > 0 ? fw(r.remainder) + " " + S.settings.unit + " per side can't be made with standard plates." : "Total is less than the bar."}</p>` : ""}`;
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
    if (!src || !src.items.length) { modal(`<div class="mh"><h2>Nothing to save</h2></div><p>Add at least one exercise first.</p><button class="btn" data-act="close">OK</button>`, true); return; }
    modal(`<div class="mh"><h2>Save as routine</h2></div>
      <div class="form"><label class="wide">Routine name<input id="r-name" value="${esc(src.label || "")}" maxlength="60" placeholder="e.g. Upper A"></label></div>
      <p class="muted small">${src.items.map((it) => esc(exById(it.exId).name)).join(" → ")}</p>
      <div class="btnrow end"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="saveroutine-yes" data-id="${esc(src.id)}">Save</button></div>`, true);
    setTimeout(() => { const f = $("#r-name"); if (f) f.focus(); }, 50);
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
      case "legal": modal(`<div class="mh"><h2>Disclaimer</h2><button class="iconbtn" data-act="close" aria-label="Close">×</button></div><div class="legal">${DISCLAIMER}</div>`); break;
      case "hidetips": S.settings.tips = false; queue(); renderTips(); break;
      case "rackf": prefs.rack = b.dataset.v; savePrefs(); renderLib(); break;
      case "mine": prefs.mine = !prefs.mine; savePrefs(); renderLib(); if ($("#pkl")) renderPicker(); break;
      case "start": startSession(); render(); break;
      case "tstart": case "repeat": {
        if (s) { modal(`<div class="mh"><h2>Session in progress</h2></div><p>Finish or discard the current session before starting another.</p><button class="btn" data-act="close">OK</button>`, true); break; }
        if (a === "tstart") { const t = S.templates.find((x) => x.id === b.dataset.id); if (t) startSession(t.exIds.filter((id) => ALL.some((x) => x.id === id)), t.name); }
        else { const src = S.sessions.find((x) => x.id === b.dataset.id); if (src) startSession(src.items.map((it) => it.exId).filter((id) => ALL.some((x) => x.id === id)), src.label); }
        view = "train"; render(); break;
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
        if (pickAt === "lib") { pickAt = null; selEx = ex.id; closeModal(); render(); setSync("Added " + ex.name); }
        else { addToSession(ex.id, pickAt); setSync("Added " + ex.name + " to your exercises"); }
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
      case "q": { const c = s.items[i].sets[si], v = +b.dataset.v; c.q = c.q === v ? null : v; c.bd = null; applyAuto(s); queue(); rerenderCard(i); break; }
      case "bd": { openBd[b.dataset.k] = !openBd[b.dataset.k]; const u = b.dataset.k.split(":")[0]; rerenderCard(s.items.findIndex((x) => x.uid === u)); break; }
      case "goal": {
        const c = s.items[i].sets[si], ty = b.dataset.v, ex = exById(s.items[i].exId);
        c.goal = { type: ty, v: ty === "add" ? ((c.goal && c.goal.v) ?? RL.incOf(ex, S.settings.unit) * 2) : undefined, text: ty === "custom" ? ((c.goal && c.goal.text) || "") : undefined };
        c.goalAuto = false; queue(); rerenderCard(i); break;
      }
      case "goalauto": { s.items[i].sets[si].goalAuto = true; applyAuto(s); queue(); rerenderCard(i); break; }
      case "plates": openPlates(i, si); break;
      case "finish": {
        if (!s.items.some((it) => it.sets.some((x) => x.done))) { modal(`<div class="mh"><h2>Nothing logged yet</h2></div><p>Tap <b>Log set</b> on at least one set before finishing, or discard the session.</p><button class="btn" data-act="close">OK</button>`, true); break; }
        s.items.forEach((it) => { it.sets = it.sets.filter((x) => x.done); });
        s.items = s.items.filter((it) => it.sets.length);
        s.status = "done"; s.ts = Date.now(); applyAuto(s); queue(); stopTimer(); render();
        const st = sessionStats(s);
        modal(`<div class="mh"><h2>${esc(s.label || "Session")} · ${fmtDate(s.date)}</h2><button class="iconbtn" data-act="close" aria-label="Close">×</button></div>
          <p>${st.sets} working sets${st.targets ? ", " + st.hits + " of " + st.targets + " goals hit" : ""}${st.prs ? ", " + st.prs + " new PR" + (st.prs > 1 ? "s" : "") : ""}.</p>${logbookHTML(s)}`);
        break;
      }
      case "discard": confirmBox("Discard session?", "Everything logged in this session will be deleted. This can't be undone.", "discard-yes", "Discard"); break;
      case "discard-yes": S.sessions = S.sessions.filter((x) => x.id !== s.id); queue(); stopTimer(); closeModal(); render(); break;
      case "saveroutine": saveRoutineModal(b.dataset.id); break;
      case "saveroutine-yes": {
        const src = S.sessions.find((x) => x.id === b.dataset.id), name = ($("#r-name").value || "").trim() || src.label || "Routine";
        S.templates.push({ id: "r-" + uid(), name, exIds: src.items.map((it) => it.exId) }); queue(); closeModal(); setSync("Saved routine " + name); render(); break;
      }
      case "tdel": confirmBox("Delete routine?", "Your logged sessions are not affected.", "tdel-yes", "Delete", `data-id="${esc(b.dataset.id)}"`); break;
      case "tdel-yes": S.templates = S.templates.filter((t) => t.id !== b.dataset.id); queue(); closeModal(); render(); break;
      case "rebuild": S.templates = S.templates.filter((t) => !t.id.startsWith("t-")).concat(RL.buildTemplates(LIB, S.profile)); queue(); render(); setSync("Starter routines rebuilt"); break;
      case "view": { const ss = S.sessions.find((x) => x.id === b.dataset.id); modal(`<div class="mh"><h2>${esc(ss.label || "Session")} · ${fmtDate(ss.date)}</h2><button class="iconbtn" data-act="close" aria-label="Close">×</button></div>${logbookHTML(ss)}`); break; }
      case "del": confirmBox("Delete session?", "This removes it from your history. Future goals will compare against the session before it.", "del-yes", "Delete", `data-id="${esc(b.dataset.id)}"`); break;
      case "del-yes": S.sessions = S.sessions.filter((x) => x.id !== b.dataset.id); queue(); closeModal(); render(); break;
      case "close": case "close-bg": closeModal(); break;
      case "selex": selEx = b.dataset.id; render(); break;
      case "saveex": {
        const o = readExForm($("#v-exercises")), ex = exById(selEx);
        if (!o.name) break;
        if (ex.custom) { Object.assign(S.exercises.custom.find((x) => x.id === ex.id), o); }
        else {
          const orig = RL.EXERCISES.find((x) => x.id === ex.id), diff = {};
          Object.keys(o).forEach((k) => { if ((o[k] ?? "") !== (orig[k] ?? "")) diff[k] = o[k]; });
          if (Object.keys(diff).length) S.exercises.edits[ex.id] = diff; else delete S.exercises.edits[ex.id];
        }
        refreshLib(); queue(); render(); setSync("Saved " + o.name); break;
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
        selEx = null; refreshLib(); queue(); closeModal(); render(); break;
      }
      case "unhide": S.exercises.hidden = []; refreshLib(); queue(); render(); break;
      case "setunit": S.settings.unit = b.dataset.v; queue(); render(); break;
      case "setdist": S.settings.dist = b.dataset.v; queue(); render(); break;
      case "settheme": S.settings.theme = b.dataset.v; applyTheme(); queue(); render(); break;
      case "settips": S.settings.tips = b.dataset.v === "on"; queue(); render(); break;
      case "setrest": S.settings.restSec = +b.dataset.v; queue(); render(); break;
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
        refreshLib(); applyTheme(); queue(); closeModal(); render(); setSync("Backup imported");
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
        try { parsed = RL.normalizeState(JSON.parse(reader.result)); } catch (err) { modal(`<div class="mh"><h2>Import failed</h2></div><p>That file is not a valid Rep Ledger backup.</p><button class="btn" data-act="close">OK</button>`, true); return; }
        pendingImport = parsed;
        confirmBox("Replace all data?", `The backup has ${parsed.sessions.length} sessions, ${parsed.templates.length} routines and ${parsed.exercises.custom.length} custom exercises. Importing replaces everything currently stored.`, "import-yes", "Import");
      };
      reader.readAsText(el.files[0]);
      el.value = "";
      return;
    }
    if (el.id === "pl-bar") { drawPlates(); return; }
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
    if (el.id === "exsearch") { exQuery = el.value; const pos = el.selectionStart; renderExercises(); const n = $("#exsearch"); n.focus(); n.setSelectionRange(pos, pos); return; }
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
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches('.exlist .row[role="button"]')) { e.preventDefault(); e.target.click(); }
  });

  /* ---------- drag and drop ---------- */
  function initDnD() {
    if (!window.Sortable) return;
    Sortable.create($("#lib"), { group: { name: "ex", pull: "clone", put: false }, sort: false, animation: 150, delay: 180, delayOnTouchOnly: true, filter: ".add", preventOnFilter: false });
    Sortable.create($("#slots"), {
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
  initDnD();
  connect();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
