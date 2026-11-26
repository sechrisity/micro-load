/* Micro Load training logic. Pure functions only: no DOM, no storage.
 *
 * A set is { w, r, rir, q, done, warm, goal, goalAuto, why, note }.
 *   w  load (or distance for cardio, added load for bodyweight and timed work)
 *   r  reps (or seconds for timed work, minutes for cardio)
 * ctx is { unit: "lb"|"kg", dist: "km"|"mi", goal: "strength"|"muscle"|"general"|"endurance" }.
 */
(function (root) {
  "use strict";
  const RL = root.RL || (typeof require !== "undefined" ? require("./exercises.js") : {});

  const LOAD_MEASURES = new Set(["total", "side", "each", "level"]);
  const OPTIONAL_LOAD = new Set(["bw", "time", "cardio"]);
  const COMPOUND = new Set(["squat", "hinge", "lunge", "hpush", "vpush", "hpull", "vpull", "dip", "hipthrust", "power"]);

  // [compound, isolation] rep ranges per goal. Conventional ranges, editable per exercise.
  const RANGES = {
    strength: [[3, 6], [6, 10]],
    muscle: [[6, 10], [8, 15]],
    general: [[8, 12], [10, 15]],
    endurance: [[12, 20], [15, 25]],
  };

  const round2 = (v) => Math.round(v * 100) / 100;
  const fw = (w) => (w == null || w === "" || isNaN(w) ? "-" : String(round2(Number(w))));
  const load = (ex, w) => (w == null && OPTIONAL_LOAD.has(ex.measure) ? 0 : w);
  const e1rm = (w, r) => (w && r ? w * (1 + r / 30) : 0); // Epley

  function repRange(ex, goal) {
    if (ex.measure === "cardio") return null;
    if (ex.repMin && ex.repMax) return [Number(ex.repMin), Number(ex.repMax)];
    if (ex.measure === "time") return [20, 60];
    const r = RANGES[goal] || RANGES.muscle;
    return COMPOUND.has(ex.pattern) ? r[0] : r[1];
  }

  function incOf(ex, unit) {
    if (ex.inc != null && ex.inc !== "" && !isNaN(ex.inc)) return Number(ex.inc);
    const kg = unit === "kg";
    switch (ex.measure) {
      case "level": return 1;
      case "side": return kg ? 1.25 : 2.5;
      case "each": return kg ? 2 : 5;
      case "cardio": return 0.5;
      default: return kg ? 2.5 : 5;
    }
  }

  const repStep = (ex) => (ex.measure === "time" ? 5 : 1);

  function wUnit(ex, ctx) {
    switch (ex.measure) {
      case "side": return ctx.unit + "/side";
      case "each": return ctx.unit + "/ea";
      case "level": return "lvl";
      case "bw": return "+" + ctx.unit;
      case "cardio": return ctx.dist;
      default: return ctx.unit;
    }
  }
  const rUnit = (ex) => (ex.measure === "time" ? "sec" : ex.measure === "cardio" ? "min" : "reps");
  function repWord(ex, n) {
    const u = rUnit(ex);
    return u === "reps" ? (Math.abs(n) === 1 ? "rep" : "reps") : u;
  }

  function goalTypes(ex, ctx) {
    const inc = fw(incOf(ex, ctx.unit));
    if (ex.measure === "cardio") {
      return [["micro", "+" + inc + " " + ctx.dist], ["rep", "+1 min"], ["hold", "Hold"], ["custom", "Custom"]];
    }
    return [["rep", ex.measure === "time" ? "+5 sec" : "+1 rep"], ["micro", "Microload +" + inc],
      ["add", "Add load"], ["hold", "Hold"], ["pause", "Longer pauses"], ["custom", "Custom"]];
  }

  function goalLabel(g, ex, ctx) {
    if (!g) return "-";
    const inc = fw(incOf(ex, ctx.unit));
    switch (g.type) {
      case "rep": return ex.measure === "time" ? "+5 sec" : ex.measure === "cardio" ? "+1 min" : "+1 rep";
      case "micro": return ex.measure === "cardio" ? "+" + inc + " " + ctx.dist : "Microload +" + inc + " " + wUnit(ex, ctx);
      case "add": return "+" + fw(g.v) + " " + wUnit(ex, ctx);
      case "hold": return "Hold performance";
      case "pause": return "Hold load, longer pauses";
      case "custom": return g.text || "Custom";
      default: return "-";
    }
  }

  function targetOf(prev, ex, ctx) {
    if (!prev || prev.r == null) return null;
    const w = load(ex, prev.w);
    if (w == null) return null;
    const g = prev.goal || { type: "hold" };
    switch (g.type) {
      case "rep": return { w, r: prev.r + repStep(ex) };
      case "micro": return { w: round2(w + incOf(ex, ctx.unit)), r: prev.r };
      case "add": return { w: round2(w + (Number(g.v) || 0)), r: prev.r };
      case "custom": return null;
      default: return { w, r: prev.r };
    }
  }

  function cardioProgression(c, p, ctx) {
    const cd = c.w || 0, pd = p.w || 0, dd = round2(cd - pd), dt = round2(c.r - p.r);
    const d = ctx.dist;
    if (dd === 0 && dt === 0) return { kind: "hold", text: "Matched last session" };
    if (cd === 0 && pd === 0) return dt > 0 ? { kind: "up", text: "+" + dt + " min" } : { kind: "down", text: dt + " min" };
    if (dd >= 0 && dt <= 0) return { kind: "up", text: dd > 0 ? "+" + dd + " " + d + (dt < 0 ? " in " + -dt + " min less" : "") : "Same distance, " + -dt + " min faster" };
    const fasterPace = cd > 0 && pd > 0 && c.r / cd < p.r / pd;
    if (dd > 0) return fasterPace ? { kind: "up", text: "+" + dd + " " + d + " at a faster pace" } : { kind: "up", text: "+" + dd + " " + d };
    return fasterPace ? { kind: "shift", text: "Shorter but faster pace" } : { kind: "down", text: dd + " " + d };
  }

  function progression(c, p, ex, ctx) {
    if (!c || c.r == null || load(ex, c.w) == null) return null;
    if (!p || p.r == null) return { kind: "first", text: "Baseline set" };
    if (ex.measure === "cardio") return cardioProgression(c, p, ctx);
    const u = wUnit(ex, ctx);
    const cw = load(ex, c.w), pw = load(ex, p.w) ?? cw;
    const dw = round2(cw - pw), dr = round2(c.r - p.r);
    const reps = (n) => (n > 0 ? "+" : "") + n + " " + repWord(ex, n);
    const better = LOAD_MEASURES.has(ex.measure) && e1rm(cw, c.r) > e1rm(pw, p.r);
    if (dw > 0 && dr >= 0) return { kind: "up", text: "+" + fw(dw) + " " + u + (dr > 0 ? " & " + reps(dr) : "") };
    if (dw === 0 && dr > 0) return { kind: "up", text: reps(dr) };
    if (dw > 0 && dr < 0) return { kind: better ? "up" : "shift", text: "+" + fw(dw) + " " + u + ", " + reps(dr) };
    if (dw < 0 && dr > 0) return { kind: better ? "up" : "shift", text: fw(dw) + " " + u + ", " + reps(dr) };
    if (dw === 0 && dr === 0) {
      const easier = (c.rir != null && p.rir != null && c.rir > p.rir) || (c.q != null && p.q != null && c.q > p.q);
      return easier ? { kind: "easier", text: "0 progress but easier" } : { kind: "hold", text: "Matched last session" };
    }
    const parts = [];
    if (dw < 0) parts.push(fw(dw) + " " + u);
    if (dr < 0) parts.push(reps(dr));
    return { kind: "down", text: parts.join(", ") };
  }

  function suggest(c, p, ex, ctx) {
    const pr = progression(c, p, ex, ctx);
    if (!pr) return null;
    if (c.q != null && c.q < 6) return { g: { type: "hold" }, why: "Quality was " + c.q + "/10. Repeat it cleaner before adding anything." };
    if (ex.measure === "cardio") {
      if (pr.kind === "shift" || pr.kind === "down") return { g: { type: "hold" }, why: "Match last session before pushing further." };
      return { g: { type: "micro" }, why: "Add a little distance next time at the same effort." };
    }
    const range = repRange(ex, ctx.goal);
    const step = ex.measure === "time" ? "5 seconds" : "one more rep";
    if (range && c.r >= range[1]) {
      return { g: { type: "micro" }, why: "You hit the top of your " + range[0] + "-" + range[1] + " " + rUnit(ex) + " range. Add load" + (OPTIONAL_LOAD.has(ex.measure) ? " or use a harder variation." : ".") };
    }
    const cw = load(ex, c.w), pw = p ? load(ex, p.w) : cw;
    switch (pr.kind) {
      case "up":
        if (cw > (pw ?? cw)) {
          return (c.rir != null && c.rir <= 0) || (c.q != null && c.q < 7)
            ? { g: { type: "hold" }, why: "New load taken at " + (c.rir != null ? c.rir + " RIR" : "a hard effort") + ". Hold performance before chasing more." }
            : { g: { type: "rep" }, why: "New load moved well. Try for " + step + "." };
        }
        return { g: { type: "micro" }, why: "You added " + (ex.measure === "time" ? "time" : "a rep") + ". Micro load next; another jump probably won't be there." };
      case "easier": return { g: { type: "rep" }, why: "Same numbers felt easier. Go for " + step + "." };
      case "hold": return { g: { type: "micro" }, why: "Matched last time. A micro load is a smaller step than " + step + "." };
      case "shift": return { g: { type: "hold" }, why: "Load and " + rUnit(ex) + " traded off. Repeat these numbers to consolidate." };
      case "down": return { g: { type: "hold" }, why: "Performance dropped. Match last session's numbers before progressing." };
      default:
        return c.rir != null && c.rir >= 2
          ? { g: { type: "rep" }, why: "Baseline with reps left in the tank. Go for " + step + "." }
          : { g: { type: "hold" }, why: "Baseline set. Match it, then build from here." };
    }
  }

  // How often each goal type has landed for one exercise, from finished sessions only.
  // sessions: all sessions; returns { rep: {tries, hits}, micro: {...}, add: {...} } over the last `window` tries of each.
  function goalHistory(sessions, ex, ctx, opts) {
    const o = Object.assign({ beforeTs: null, excludeId: null, window: 6 }, opts);
    const done = sessions.filter((s) => s.status === "done" && s.id !== o.excludeId && (o.beforeTs == null || s.ts < o.beforeTs))
      .sort((a, b) => a.ts - b.ts);
    const work = (it) => it.sets.filter((x) => x.done && !x.warm);
    const log = { rep: [], micro: [], add: [] };
    let prev = null;
    for (const s of done) {
      const it = s.items.find((i) => i.exId === ex.id && work(i).length);
      if (!it) continue;
      const cur = work(it);
      if (prev) {
        cur.forEach((c, i) => {
          const p = prev[i];
          const type = p && p.goal && p.goal.type;
          if (!log[type]) return;
          const t = targetOf(p, ex, ctx);
          if (!t || c.r == null) return;
          log[type].push((load(ex, c.w) ?? 0) >= t.w - 1e-9 && c.r >= t.r);
        });
      }
      prev = cur;
    }
    const out = {};
    Object.keys(log).forEach((k) => {
      const recent = log[k].slice(-o.window);
      out[k] = { tries: recent.length, hits: recent.filter(Boolean).length };
    });
    return out;
  }

  // Adjust a rule-based suggestion using the user's own hit rate on this exercise.
  // Needs at least `min` tries before it overrides anything.
  function adapt(sg, hist, min) {
    if (!sg || !hist) return sg;
    const need = min || 3;
    const type = sg.g.type;
    if (type !== "rep" && type !== "micro") return sg;
    const h = hist[type], other = type === "rep" ? "micro" : "rep", o = hist[other];
    const rate = (x) => (x && x.tries ? x.hits / x.tries : null);
    const name = { rep: "Adding a rep", micro: "Microloading" };
    if (!h || h.tries < need) return sg;
    const r = rate(h), ro = rate(o);
    const tally = h.hits + " of your last " + h.tries + " tries";
    if (r <= 1 / 3) {
      if (o && o.tries >= need && ro >= 0.5) {
        return { g: { type: other }, why: name[type] + " has landed " + tally + " on this exercise, while " + name[other].toLowerCase() + " landed " + o.hits + " of " + o.tries + ". Switching.", adapted: true };
      }
      if (o && o.tries >= need && ro <= 1 / 3) {
        return { g: { type: "hold" }, why: "Recent progress attempts on this exercise mostly missed (" + name[type].toLowerCase() + ": " + tally + "). Consolidate before pushing again.", adapted: true };
      }
      if (!o || o.tries < need) {
        return { g: { type: other }, why: name[type] + " has landed " + tally + " on this exercise. Try " + name[other].toLowerCase() + " instead.", adapted: true };
      }
    }
    if (r >= 2 / 3) return Object.assign({}, sg, { why: sg.why + " " + name[type] + " has landed " + tally + " here." });
    return sg;
  }

  // Advice for the next set in the same session, from the set just logged.
  // RIR above the target means the load was light; 0 RIR short of the range means it was heavy.
  function nextSetAdvice(c, ex, ctx, targetRir) {
    if (!c || !c.done || c.warm || c.r == null || ex.measure === "cardio" || ex.measure === "time") return null;
    const tr = targetRir == null ? 1 : targetRir;
    const range = repRange(ex, ctx.goal);
    if (c.q != null && c.q < 6) return { action: "clean", text: "Quality was " + c.q + "/10. Same load next set, focus on clean reps." };
    if (c.rir == null) return null;
    const isLoad = LOAD_MEASURES.has(ex.measure) && c.w != null;
    const inc = incOf(ex, ctx.unit);
    if (c.rir >= tr + 2) {
      const steps = c.rir >= tr + 3 ? 2 : 1;
      if (!isLoad) return { action: "up", text: c.rir + " RIR left. Aim for " + (c.r + steps) + " " + rUnit(ex) + " next set." };
      const w = round2(c.w + steps * inc);
      return { action: "up", w, text: c.rir + " RIR left. Try " + fw(w) + " " + wUnit(ex, ctx) + " next set." };
    }
    if (c.rir === 0 && range && c.r < range[0]) {
      if (!isLoad) return { action: "down", text: "Short of " + range[0] + " " + rUnit(ex) + " at 0 RIR. Use an easier variation or assistance next set." };
      const w = Math.max(0, round2(Math.floor((c.w * 0.92) / inc) * inc));
      return { action: "down", w, text: "Short of " + range[0] + " reps at 0 RIR. Drop to " + fw(w) + " " + wUnit(ex, ctx) + " next set." };
    }
    return { action: "same", text: "On target. Same load next set." };
  }

  // Number used for charts and personal records.
  function metricOf(ex, s) {
    if (LOAD_MEASURES.has(ex.measure)) return e1rm(s.w, s.r);
    if (ex.measure === "cardio") return s.w || s.r || 0;
    return s.r || 0;
  }
  function metricLabel(ex, ctx) {
    if (LOAD_MEASURES.has(ex.measure)) return "Est. 1RM (" + wUnit(ex, ctx) + ")";
    if (ex.measure === "cardio") return "Distance (" + ctx.dist + ")";
    return ex.measure === "time" ? "Best time (sec)" : "Best reps";
  }

  // A set is a PR when it beats every earlier working set. The first ever set is a baseline.
  function isPR(c, earlier, ex) {
    if (!c || c.r == null || !earlier.length) return false;
    if (LOAD_MEASURES.has(ex.measure)) {
      if (!c.w) return false;
      return e1rm(c.w, c.r) > Math.max(...earlier.map((p) => e1rm(p.w, p.r))) + 1e-9;
    }
    if (ex.measure === "cardio") return (c.w || 0) > Math.max(...earlier.map((p) => p.w || 0));
    const cw = c.w || 0;
    return !earlier.some((p) => (p.w || 0) >= cw && (p.r || 0) >= c.r);
  }

  // Starter routines from movement patterns and the user's equipment.
  const PLANS = {
    fullA: ["squat", "hpush", "vpull|hpull", "hamcurl|hinge", "latraise|reardelt", "core"],
    fullB: ["hinge", "vpush", "hpull|vpull", "lunge", "curl", "tri"],
    upper: ["hpush", "hpull", "vpush", "vpull", "latraise", "curl", "tri"],
    lower: ["squat", "hinge", "lunge", "hamcurl", "quadiso|hipthrust", "calf", "core"],
    push: ["hpush", "vpush", "hpush|dip", "fly", "latraise", "tri"],
    pull: ["vpull", "hpull", "hpull|latiso", "reardelt", "curl", "curl|grip"],
    legs: ["squat", "hinge", "lunge|hipthrust", "quadiso", "hamcurl", "calf"],
    conditioning: ["cardio", "conditioning|plyo", "carry|core", "core"],
  };

  function buildTemplates(library, profile) {
    const have = new Set([...(profile.equipment || []), "bodyweight"]);
    const days = Number(profile.days) || 3;
    let split = days <= 3 ? [["Full Body A", "fullA"], ["Full Body B", "fullB"]]
      : days === 4 ? [["Upper", "upper"], ["Lower", "lower"]]
      : [["Push", "push"], ["Pull", "pull"], ["Legs", "legs"]];
    const goals = profile.goals || [profile.goal];
    if (goals.includes("endurance") || goals[0] === "general") split = split.concat([["Conditioning", "conditioning"]]);
    const max = profile.experience === "new" ? 5 : 7;
    return split.map(([name, key]) => {
      const used = new Set();
      for (const slot of PLANS[key]) {
        const pats = slot.split("|");
        const pick = pats.map((pt) => library.find((e) => e.pattern === pt && have.has(e.equip) && !used.has(e.id))).find(Boolean);
        if (pick) used.add(pick.id);
      }
      return { id: "t-" + RL.slug(name), name, exIds: [...used].slice(0, max) };
    }).filter((t) => t.exIds.length);
  }

  // Plates per side for a barbell. Greedy, which is exact for standard plate sets.
  function plates(total, bar, avail) {
    const per = (Number(total) - Number(bar)) / 2;
    if (!(per >= 0)) return { ok: false, perSide: [], remainder: 0 };
    let left = per;
    const out = [];
    for (const p of [...avail].map(Number).sort((a, b) => b - a)) {
      const n = Math.floor((left + 1e-9) / p);
      if (n > 0) { out.push([p, n]); left = round2(left - n * p); }
    }
    return { ok: left < 1e-9, perSide: out, remainder: round2(left) };
  }

  // Calendar periods for goals. Returns [start, end) as local-time timestamps.
  function periodRange(period, ts) {
    const d = new Date(ts);
    const y = d.getFullYear(), m = d.getMonth();
    if (period === "year") return [new Date(y, 0, 1).getTime(), new Date(y + 1, 0, 1).getTime()];
    if (period === "quarter") { const q = Math.floor(m / 3) * 3; return [new Date(y, q, 1).getTime(), new Date(y, q + 3, 1).getTime()]; }
    return [new Date(y, m, 1).getTime(), new Date(y, m + 1, 1).getTime()];
  }
  function periodName(period, ts) {
    const d = new Date(ts);
    if (period === "year") return String(d.getFullYear());
    if (period === "quarter") return "Q" + (Math.floor(d.getMonth() / 3) + 1) + " " + d.getFullYear();
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  // Load moved in one working set, for volume goals. Per-side and per-dumbbell loads count twice.
  function setVolume(ex, s) {
    if (!s.w || !s.r) return 0;
    if (ex.measure === "total") return s.w * s.r;
    if (ex.measure === "side" || ex.measure === "each") return 2 * s.w * s.r;
    return 0;
  }

  // Progress on one goal. Recurring goals track the period containing `now`; one-off goals their own period.
  function goalProgress(goal, sessions, lookup, now) {
    const [start, end] = periodRange(goal.period, goal.recurring ? now : goal.start);
    const inRange = sessions.filter((s) => s.status === "done" && s.ts >= start && s.ts < end);
    const work = (it) => it.sets.filter((x) => x.done && !x.warm);
    let value = 0, target = Number(goal.target) || 0, best = null;
    if (goal.kind === "workouts") value = inRange.length;
    else if (goal.kind === "sets") value = inRange.reduce((a, s) => a + s.items.reduce((b, it) => b + work(it).length, 0), 0);
    else if (goal.kind === "volume") value = Math.round(inRange.reduce((a, s) => a + s.items.reduce((b, it) => b + work(it).reduce((c, x) => c + setVolume(lookup(it.exId), x), 0), 0), 0));
    else if (goal.kind === "lift") {
      target = e1rm(goal.w, goal.r);
      inRange.forEach((s) => s.items.filter((it) => it.exId === goal.exId).forEach((it) => work(it).forEach((x) => {
        if (x.w != null && x.r != null && (!best || e1rm(x.w, x.r) > e1rm(best.w, best.r))) best = x;
      })));
      const hit = inRange.some((s) => s.items.some((it) => it.exId === goal.exId && work(it).some((x) => x.w >= goal.w && x.r >= goal.r)));
      value = best ? e1rm(best.w, best.r) : 0;
      if (hit) value = Math.max(value, target);
    } else if (goal.kind === "custom") { value = goal.done ? 1 : 0; target = 1; }
    const achieved = target > 0 && value >= target - 1e-9;
    const span = end - start, elapsed = Math.min(Math.max(now - start, 0), span);
    const expected = target * (elapsed / span);
    return {
      start, end, value, target, best, achieved,
      pct: target ? Math.min(1, value / target) : 0,
      daysLeft: Math.max(0, Math.ceil((end - now) / 86400000)),
      ended: now >= end,
      onPace: achieved || value >= expected - 1e-9,
    };
  }

  // Month grid for the calendar, Monday first. Cells are ISO dates or null for padding.
  function monthCells(year, month) {
    const first = new Date(year, month, 1), days = new Date(year, month + 1, 0).getDate();
    const pad = (first.getDay() + 6) % 7, cells = [];
    for (let i = 0; i < pad; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(year + "-" + String(month + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0"));
    while (cells.length % 7) cells.push(null);
    return cells;
  }

  // Library = built-ins (minus hidden, with user edits) + custom exercises.
  function buildLibrary(exState, includeHidden, includeBuiltins) {
    const st = exState || {};
    if (includeBuiltins === false) return (st.custom || []).map((e) => Object.assign({}, e, { custom: true }));
    const hidden = new Set(st.hidden || []);
    const edits = st.edits || {};
    const base = RL.EXERCISES.filter((e) => includeHidden || !hidden.has(e.id))
      .map((e) => Object.assign({}, e, edits[e.id] || {}, { builtin: true, hidden: hidden.has(e.id) }));
    return base.concat((st.custom || []).map((e) => Object.assign({}, e, { custom: true })));
  }

  function emptyState() {
    return {
      schema: 1, updatedAt: 0, consent: null, profile: null,
      settings: { unit: "lb", dist: "km", restSec: 120, tips: true, theme: "auto", adaptive: true, advice: true, builtins: true, targetRir: 1, sound: true },
      exercises: { custom: [], edits: {}, hidden: [] },
      templates: [], sessions: [], goals: [],
    };
  }

  const OLD_MEASURE = { lb: "total", "lb/side": "side", pin: "level" };

  // Accepts this app's state or an export from an earlier single-user version.
  function normalizeState(raw) {
    const s = emptyState();
    if (!raw || typeof raw !== "object") return s;
    s.updatedAt = Number(raw.updatedAt) || 0;
    s.consent = raw.consent && raw.consent.version ? raw.consent : null;
    s.profile = raw.profile && typeof raw.profile === "object" ? raw.profile : null;
    Object.assign(s.settings, raw.settings || {});
    if (raw.unit === "kg" || raw.unit === "lb") s.settings.unit = raw.unit;
    const ex = raw.exercises || {};
    s.exercises.custom = Array.isArray(ex.custom) ? ex.custom : [];
    s.exercises.edits = ex.edits && typeof ex.edits === "object" ? ex.edits : {};
    s.exercises.hidden = Array.isArray(ex.hidden) ? ex.hidden : [];
    if (Array.isArray(raw.library)) {
      const known = new Set(s.exercises.custom.map((e) => e.id));
      raw.library.forEach((e) => {
        if (!e || !e.id || known.has(e.id)) return;
        s.exercises.custom.push({
          id: e.id, name: e.name || "Exercise", group: e.group || "", region: e.region || "upper",
          equip: "other", legacy: true, measure: OLD_MEASURE[e.measure] || e.measure || "total", pattern: "",
          repMin: e.repMin, repMax: e.repMax, inc: e.inc,
        });
      });
    }
    s.templates = Array.isArray(raw.templates) ? raw.templates : [];
    s.goals = Array.isArray(raw.goals) ? raw.goals.filter((g) => g && g.id && g.kind) : [];
    s.sessions = Array.isArray(raw.sessions) ? raw.sessions.filter((x) => x && !x.example && Array.isArray(x.items)) : [];
    return s;
  }

  function toCSV(state, lookup, ctx) {
    const q = (v) => {
      const t = v == null ? "" : String(v);
      return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    const rows = [["date", "session", "exercise", "set", "warmup", "load", "load_unit", "reps", "reps_unit", "rir", "quality", "note"]];
    state.sessions.filter((s) => s.status === "done").sort((a, b) => a.ts - b.ts).forEach((s) => {
      s.items.forEach((it) => {
        const ex = lookup(it.exId);
        it.sets.filter((x) => x.done).forEach((x, i) => rows.push([s.date, s.label || "", ex.name, i + 1, x.warm ? "yes" : "",
          x.w ?? "", wUnit(ex, ctx), x.r ?? "", rUnit(ex), x.rir ?? "", x.q ?? "", x.note || ""]));
      });
    });
    return rows.map((r) => r.map(q).join(",")).join("\n") + "\n";
  }

  Object.assign(RL, {
    RANGES, COMPOUND, LOAD_MEASURES, fw, round2, e1rm, repRange, incOf, wUnit, rUnit, goalTypes, goalLabel,
    targetOf, progression, suggest, goalHistory, adapt, nextSetAdvice, metricOf, metricLabel, isPR, buildTemplates, plates, buildLibrary, periodRange, periodName, setVolume, goalProgress, monthCells,
    emptyState, normalizeState, toCSV,
  });
  root.RL = RL;
  if (typeof module !== "undefined") module.exports = RL;
})(typeof window !== "undefined" ? window : globalThis);
