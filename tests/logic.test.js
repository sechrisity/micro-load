// Run with: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
require("../static/js/exercises.js");
const RL = require("../static/js/logic.js");

const ctx = { unit: "lb", dist: "km", goal: "muscle" };
const ex = (id) => RL.EXERCISES.find((e) => e.id === id);
const set = (w, r, extra) => Object.assign({ w, r, rir: null, q: null, done: true }, extra);

test("library ids are unique and fields are valid", () => {
  const ids = new Set();
  const equip = new Set(RL.ALL_EQUIPMENT);
  const measures = new Set(RL.MEASURES.map(([k]) => k));
  const regions = new Set(RL.REGIONS.map(([k]) => k));
  for (const e of RL.EXERCISES) {
    assert.ok(!ids.has(e.id), "duplicate id " + e.id);
    ids.add(e.id);
    assert.ok(equip.has(e.equip), e.id + " equip");
    assert.ok(measures.has(e.measure), e.id + " measure");
    assert.ok(regions.has(e.region), e.id + " region");
    assert.ok(RL.GROUPS.includes(e.group), e.id + " group");
  }
  assert.ok(RL.EXERCISES.length > 150);
});

test("rep range follows goal, pattern and overrides", () => {
  assert.deepEqual(RL.repRange(ex("back-squat"), "strength"), [3, 6]);
  assert.deepEqual(RL.repRange(ex("leg-extension"), "strength"), [6, 10]);
  assert.deepEqual(RL.repRange(ex("plank"), "muscle"), [20, 60]);
  assert.equal(RL.repRange(ex("rowing-machine"), "muscle"), null);
  assert.deepEqual(RL.repRange({ ...ex("back-squat"), repMin: 5, repMax: 8 }, "strength"), [5, 8]);
});

test("microload depends on measure and unit", () => {
  assert.equal(RL.incOf(ex("barbell-bench-press"), "lb"), 5);
  assert.equal(RL.incOf(ex("barbell-bench-press"), "kg"), 2.5);
  assert.equal(RL.incOf(ex("leg-press"), "lb"), 2.5);
  assert.equal(RL.incOf(ex("band-curl"), "lb"), 1);
  assert.equal(RL.incOf({ ...ex("leg-press"), inc: 10 }, "lb"), 10);
});

test("targets apply last session's goal", () => {
  const bench = ex("barbell-bench-press");
  assert.deepEqual(RL.targetOf(set(185, 6, { goal: { type: "rep" } }), bench, ctx), { w: 185, r: 7 });
  assert.deepEqual(RL.targetOf(set(185, 6, { goal: { type: "micro" } }), bench, ctx), { w: 190, r: 6 });
  assert.deepEqual(RL.targetOf(set(185, 6, { goal: { type: "add", v: 10 } }), bench, ctx), { w: 195, r: 6 });
  assert.equal(RL.targetOf(set(185, 6, { goal: { type: "custom", text: "pause" } }), bench, ctx), null);
  // bodyweight with no added load still gets a target
  assert.deepEqual(RL.targetOf(set(null, 10, { goal: { type: "rep" } }), ex("push-up"), ctx), { w: 0, r: 11 });
  // timed work steps by 5 seconds
  assert.deepEqual(RL.targetOf(set(null, 40, { goal: { type: "rep" } }), ex("plank"), ctx), { w: 0, r: 45 });
});

test("progression classifies changes", () => {
  const bench = ex("barbell-bench-press");
  assert.equal(RL.progression(set(185, 6), null, bench, ctx).kind, "first");
  assert.equal(RL.progression(set(190, 6), set(185, 6), bench, ctx).kind, "up");
  assert.equal(RL.progression(set(185, 7), set(185, 6), bench, ctx).text, "+1 rep");
  assert.equal(RL.progression(set(185, 6), set(185, 6), bench, ctx).kind, "hold");
  assert.equal(RL.progression(set(185, 6, { q: 8 }), set(185, 6, { q: 7 }), bench, ctx).kind, "easier");
  assert.equal(RL.progression(set(180, 5), set(185, 6), bench, ctx).kind, "down");
  assert.equal(RL.progression(set(195, 5), set(185, 6), bench, ctx).kind, "up"); // higher e1RM
  assert.equal(RL.progression(set(190, 3), set(185, 6), bench, ctx).kind, "shift");
});

test("cardio progression uses distance and pace", () => {
  const row = ex("rowing-machine");
  assert.equal(RL.progression(set(5.5, 25), set(5, 25), row, ctx).kind, "up");
  assert.equal(RL.progression(set(5, 24), set(5, 25), row, ctx).text, "Same distance, 1 min faster");
  assert.equal(RL.progression(set(4, 25), set(5, 25), row, ctx).kind, "down");
});

test("suggestions", () => {
  const bench = ex("barbell-bench-press"); // compound, muscle goal: 6-10
  assert.equal(RL.suggest(set(185, 6, { q: 5 }), set(185, 6), bench, ctx).g.type, "hold");
  assert.equal(RL.suggest(set(185, 10), set(185, 9), bench, ctx).g.type, "micro");
  assert.equal(RL.suggest(set(185, 7), set(185, 6), bench, ctx).g.type, "micro");
  assert.equal(RL.suggest(set(190, 6, { rir: 0 }), set(185, 6), bench, ctx).g.type, "hold");
  assert.equal(RL.suggest(set(190, 6, { rir: 2 }), set(185, 6), bench, ctx).g.type, "rep");
  assert.equal(RL.suggest(set(185, 6, { rir: 3 }), null, bench, ctx).g.type, "rep");
});

test("personal records", () => {
  const bench = ex("barbell-bench-press");
  assert.equal(RL.isPR(set(185, 6), [], bench), false);
  assert.equal(RL.isPR(set(190, 6), [set(185, 6)], bench), true);
  assert.equal(RL.isPR(set(185, 6), [set(185, 6)], bench), false);
  const pu = ex("pull-up");
  assert.equal(RL.isPR(set(null, 9), [set(null, 8)], pu), true);
  assert.equal(RL.isPR(set(null, 8), [set(10, 8)], pu), false);
});

test("templates respect equipment and size", () => {
  const lib = RL.buildLibrary({});
  const home = RL.buildTemplates(lib, { equipment: ["dumbbell"], days: 3, goal: "muscle", experience: "new" });
  assert.deepEqual(home.map((t) => t.name), ["Full Body A", "Full Body B"]);
  for (const t of home) {
    assert.ok(t.exIds.length <= 5);
    for (const id of t.exIds) assert.ok(["dumbbell", "bodyweight"].includes(lib.find((e) => e.id === id).equip), id);
    assert.equal(new Set(t.exIds).size, t.exIds.length);
  }
  const gym = RL.buildTemplates(lib, { equipment: RL.ALL_EQUIPMENT, days: 5, goals: ["muscle", "endurance"], experience: "advanced" });
  assert.deepEqual(gym.map((t) => t.name), ["Push", "Pull", "Legs", "Conditioning"]);
  assert.equal(gym[0].exIds[0], "barbell-bench-press");
  const strength = RL.buildTemplates(lib, { equipment: RL.ALL_EQUIPMENT, days: 4, goals: ["strength", "general"] });
  assert.deepEqual(strength.map((t) => t.name), ["Upper", "Lower"]);
});

test("plate math", () => {
  assert.deepEqual(RL.plates(225, 45, [45, 35, 25, 10, 5, 2.5]).perSide, [[45, 2]]);
  assert.deepEqual(RL.plates(100, 20, [25, 20, 15, 10, 5, 2.5, 1.25]).perSide, [[25, 1], [15, 1]]);
  const odd = RL.plates(47, 45, [45, 25, 10, 5, 2.5]);
  assert.equal(odd.ok, false);
  assert.equal(odd.remainder, 1);
  assert.equal(RL.plates(30, 45, [45]).ok, false);
});

test("library merges edits, hidden and custom", () => {
  const lib = RL.buildLibrary({ edits: { "push-up": { name: "Push-Up (strict)" } }, hidden: ["plank"], custom: [{ id: "x1", name: "Mine", measure: "total" }] });
  assert.equal(lib.find((e) => e.id === "push-up").name, "Push-Up (strict)");
  assert.equal(lib.find((e) => e.id === "plank"), undefined);
  assert.ok(lib.find((e) => e.id === "x1").custom);
  assert.ok(RL.buildLibrary({ hidden: ["plank"] }, true).find((e) => e.id === "plank").hidden);
});

test("normalizeState migrates the original single-user format", () => {
  const s = RL.normalizeState({
    unit: "kg",
    library: [{ id: "tbar", name: "T-Bar Row", group: "Back", measure: "lb/side", repMin: 5, repMax: 8, inc: 2.5 }],
    sessions: [{ id: "a", items: [] }, { id: "ex1", example: true, items: [] }],
  });
  assert.equal(s.settings.unit, "kg");
  assert.equal(s.exercises.custom[0].measure, "side");
  assert.equal(s.sessions.length, 1);
  assert.equal(s.consent, null);
  assert.deepEqual(RL.normalizeState("junk"), RL.emptyState());
});

test("CSV export escapes fields", () => {
  const st = RL.emptyState();
  st.sessions = [{ status: "done", ts: 1, date: "2026-01-01", label: "Upper", items: [{ exId: "push-up", sets: [set(null, 10, { note: 'felt "good", easy' })] }] }];
  const csv = RL.toCSV(st, (id) => ex(id), ctx);
  assert.match(csv, /"felt ""good"", easy"/);
  assert.equal(csv.trim().split("\n").length, 2);
});

// history helper: sessions where each set's goal and outcome are given
function hist(ex, rows) {
  // rows: [[w, r, goalType]] one working set per session, oldest first
  return rows.map(([w, r, g], i) => ({ id: "s" + i, status: "done", ts: i + 1, items: [{ exId: ex.id, sets: [set(w, r, { goal: g ? { type: g } : null })] }] }));
}

test("goal history counts hits per goal type", () => {
  const bench = ex("barbell-bench-press");
  // micro tried 3 times (1 hit), rep tried once (hit)
  const h = RL.goalHistory(hist(bench, [[185, 6, "micro"], [190, 6, "micro"], [190, 6, "micro"], [190, 6, "rep"], [190, 7, null]]), bench, ctx);
  assert.deepEqual(h.micro, { tries: 3, hits: 1 });
  assert.deepEqual(h.rep, { tries: 1, hits: 1 });
  assert.deepEqual(h.add, { tries: 0, hits: 0 });
});

test("adapt switches away from a goal type that keeps missing", () => {
  const micro = { g: { type: "micro" }, why: "x" };
  assert.equal(RL.adapt(micro, { micro: { tries: 4, hits: 1 }, rep: { tries: 3, hits: 3 } }).g.type, "rep");
  assert.equal(RL.adapt(micro, { micro: { tries: 4, hits: 1 }, rep: { tries: 0, hits: 0 } }).g.type, "rep");
  assert.equal(RL.adapt(micro, { micro: { tries: 4, hits: 0 }, rep: { tries: 3, hits: 0 } }).g.type, "hold");
  assert.equal(RL.adapt(micro, { micro: { tries: 2, hits: 0 }, rep: { tries: 0, hits: 0 } }).g.type, "micro"); // not enough data
  const good = RL.adapt(micro, { micro: { tries: 3, hits: 3 }, rep: { tries: 0, hits: 0 } });
  assert.equal(good.g.type, "micro");
  assert.match(good.why, /3 of your last 3/);
  assert.equal(RL.adapt({ g: { type: "hold" }, why: "" }, { micro: { tries: 5, hits: 0 } }).g.type, "hold");
});

test("next-set advice from RIR and quality", () => {
  const bench = ex("barbell-bench-press"); // 6-10, inc 5
  assert.equal(RL.nextSetAdvice(set(185, 8, { rir: 3 }), bench, ctx).w, 190);
  assert.equal(RL.nextSetAdvice(set(185, 8, { rir: 4 }), bench, ctx).w, 195);
  assert.equal(RL.nextSetAdvice(set(185, 8, { rir: 1 }), bench, ctx).action, "same");
  const down = RL.nextSetAdvice(set(185, 4, { rir: 0 }), bench, ctx);
  assert.equal(down.action, "down");
  assert.equal(down.w, 170);
  assert.equal(RL.nextSetAdvice(set(185, 8, { rir: 3, q: 5 }), bench, ctx).action, "clean");
  assert.equal(RL.nextSetAdvice(set(185, 8), bench, ctx), null);
  assert.equal(RL.nextSetAdvice(set(185, 8, { rir: 3, warm: true }), bench, ctx), null);
  assert.match(RL.nextSetAdvice(set(null, 10, { rir: 3 }), ex("push-up"), ctx).text, /11 reps/);
  assert.equal(RL.nextSetAdvice(set(5, 20, { rir: 3 }), ex("rowing-machine"), ctx), null);
});

test("period ranges", () => {
  const t = new Date(2026, 10, 26, 15).getTime(); // 26 Nov 2026
  assert.deepEqual(RL.periodRange("month", t), [new Date(2026, 10, 1).getTime(), new Date(2026, 11, 1).getTime()]);
  assert.deepEqual(RL.periodRange("quarter", t), [new Date(2026, 9, 1).getTime(), new Date(2027, 0, 1).getTime()]);
  assert.deepEqual(RL.periodRange("year", t), [new Date(2026, 0, 1).getTime(), new Date(2027, 0, 1).getTime()]);
  assert.equal(RL.periodName("quarter", t), "Q4 2026");
});

test("goal progress", () => {
  const now = new Date(2026, 10, 16).getTime(); // halfway through November
  const day = (d) => new Date(2026, 10, d, 18).getTime();
  const sess = (d, sets) => ({ status: "done", ts: day(d), items: [{ exId: "back-squat", sets }] });
  const sessions = [
    sess(2, [set(100, 5), set(100, 5, { warm: true })]),
    sess(9, [set(102.5, 5), set(102.5, 4)]),
    { status: "done", ts: new Date(2026, 9, 30).getTime(), items: [{ exId: "back-squat", sets: [set(120, 5)] }] }, // October, out of range
  ];
  const lookup = (id) => ex(id);
  const w = RL.goalProgress({ kind: "workouts", period: "month", recurring: true, target: 8 }, sessions, lookup, now);
  assert.equal(w.value, 2);
  assert.equal(w.achieved, false);
  assert.equal(w.onPace, false); // 2 of 8 at the halfway point
  assert.equal(RL.goalProgress({ kind: "sets", period: "month", recurring: true, target: 3 }, sessions, lookup, now).value, 3);
  assert.equal(RL.goalProgress({ kind: "volume", period: "month", recurring: true, target: 1000 }, sessions, lookup, now).value, Math.round(500 + 512.5 + 410));
  const lift = RL.goalProgress({ kind: "lift", period: "month", recurring: true, exId: "back-squat", w: 102.5, r: 5 }, sessions, lookup, now);
  assert.equal(lift.achieved, true);
  const notYet = RL.goalProgress({ kind: "lift", period: "month", recurring: true, exId: "back-squat", w: 110, r: 5 }, sessions, lookup, now);
  assert.equal(notYet.achieved, false);
  assert.ok(notYet.pct > 0.9 && notYet.pct < 1);
  const oneOff = RL.goalProgress({ kind: "workouts", period: "month", recurring: false, start: new Date(2026, 9, 5).getTime(), target: 1 }, sessions, lookup, now);
  assert.equal(oneOff.ended, true);
  assert.equal(oneOff.achieved, true);
  assert.equal(RL.goalProgress({ kind: "custom", period: "year", recurring: false, start: now, done: true }, [], lookup, now).achieved, true);
});

test("month grid starts on Monday", () => {
  const cells = RL.monthCells(2026, 10); // November 2026 starts on a Sunday
  assert.equal(cells.length % 7, 0);
  assert.equal(cells.slice(0, 6).every((c) => c === null), true);
  assert.equal(cells[6], "2026-11-01");
  assert.equal(cells.filter(Boolean).length, 30);
});
