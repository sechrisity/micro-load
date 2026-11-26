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
  const gym = RL.buildTemplates(lib, { equipment: RL.ALL_EQUIPMENT, days: 5, goal: "endurance", experience: "advanced" });
  assert.deepEqual(gym.map((t) => t.name), ["Push", "Pull", "Legs", "Conditioning"]);
  assert.equal(gym[0].exIds[0], "barbell-bench-press");
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
