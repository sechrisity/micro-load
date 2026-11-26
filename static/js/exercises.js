/* Rep Ledger built-in exercise library.
 *
 * Each row: [name, muscle group, region, equipment, measure, pattern]
 *   region    upper | lower | core | full | cardio
 *   equipment see EQUIPMENT below
 *   measure   total  load for the whole movement (barbell, machine stack, cable)
 *             side   load per side (plate-loaded machines, Smith machine)
 *             each   load per dumbbell or kettlebell
 *             level  pin, band colour or machine setting number
 *             bw     bodyweight reps, with optional added (or negative, assisted) load
 *             time   seconds held or worked, with optional load
 *             cardio distance and minutes
 *   pattern   movement pattern, used to build starter routines. Within a pattern the
 *             first row whose equipment the user has is picked, so list preferred first.
 *
 * Rep ranges and microload steps are not stored here: they come from the user's goal
 * and unit (see logic.js), and can be overridden per exercise in the app.
 */
(function (root) {
  "use strict";

  const EQUIPMENT = [
    ["barbell", "Barbell and rack"],
    ["dumbbell", "Dumbbells"],
    ["kettlebell", "Kettlebells"],
    ["cable", "Cable station"],
    ["machine", "Selectorized machines"],
    ["plate", "Plate-loaded machines"],
    ["smith", "Smith machine"],
    ["pullup", "Pull-up bar"],
    ["band", "Resistance bands"],
    ["cardio", "Cardio machines"],
    ["other", "Other gear (sled, ropes, med ball, bike, pool)"],
    ["bodyweight", "Bodyweight"],
  ];

  const ALL_EQUIPMENT = EQUIPMENT.map(([k]) => k);

  // Training environment presets. They prefill the equipment list in the survey.
  const ENVIRONMENTS = [
    ["commercial", "Commercial gym", ALL_EQUIPMENT],
    ["home-full", "Home gym with barbell and rack", ["barbell", "dumbbell", "pullup", "band", "bodyweight"]],
    ["home-db", "Home with dumbbells or kettlebells", ["dumbbell", "kettlebell", "band", "bodyweight"]],
    ["minimal", "Bodyweight or bands only", ["band", "pullup", "bodyweight"]],
    ["outdoor", "Outdoors or park", ["pullup", "bodyweight", "other"]],
  ];

  const GROUPS = ["Chest", "Back", "Traps", "Shoulders", "Biceps", "Triceps", "Forearms",
    "Quads", "Hamstrings", "Glutes", "Adductors", "Abductors", "Calves", "Core", "Full body", "Cardio"];

  const REGIONS = [["upper", "Upper"], ["lower", "Lower"], ["core", "Core"], ["full", "Full body"], ["cardio", "Cardio"]];

  const MEASURES = [
    ["total", "Total load"], ["side", "Load per side"], ["each", "Load per dumbbell"],
    ["level", "Pin or setting"], ["bw", "Bodyweight reps"], ["time", "Timed hold"], ["cardio", "Distance and time"],
  ];

  const ROWS = [
    // Chest
    ["Barbell Bench Press", "Chest", "upper", "barbell", "total", "hpush"],
    ["Incline Barbell Bench Press", "Chest", "upper", "barbell", "total", "hpush"],
    ["Decline Barbell Bench Press", "Chest", "upper", "barbell", "total", "hpush"],
    ["Machine Chest Press", "Chest", "upper", "machine", "total", "hpush"],
    ["Incline Machine Chest Press", "Chest", "upper", "machine", "total", "hpush"],
    ["Plate-Loaded Chest Press", "Chest", "upper", "plate", "side", "hpush"],
    ["Smith Machine Bench Press", "Chest", "upper", "smith", "side", "hpush"],
    ["Incline Smith Machine Press", "Chest", "upper", "smith", "side", "hpush"],
    ["Dumbbell Bench Press", "Chest", "upper", "dumbbell", "each", "hpush"],
    ["Incline Dumbbell Press", "Chest", "upper", "dumbbell", "each", "hpush"],
    ["Decline Dumbbell Press", "Chest", "upper", "dumbbell", "each", "hpush"],
    ["Kettlebell Floor Press", "Chest", "upper", "kettlebell", "each", "hpush"],
    ["Push-Up", "Chest", "upper", "bodyweight", "bw", "hpush"],
    ["Incline Push-Up", "Chest", "upper", "bodyweight", "bw", "hpush"],
    ["Decline Push-Up", "Chest", "upper", "bodyweight", "bw", "hpush"],
    ["Band Chest Press", "Chest", "upper", "band", "level", "hpush"],
    ["Chest Dip", "Chest", "upper", "bodyweight", "bw", "dip"],
    ["Pec Deck", "Chest", "upper", "machine", "total", "fly"],
    ["Cable Crossover (High to Low)", "Chest", "upper", "cable", "total", "fly"],
    ["Cable Fly (Low to High)", "Chest", "upper", "cable", "total", "fly"],
    ["Dumbbell Fly", "Chest", "upper", "dumbbell", "each", "fly"],
    ["Incline Dumbbell Fly", "Chest", "upper", "dumbbell", "each", "fly"],
    ["Band Fly", "Chest", "upper", "band", "level", "fly"],

    // Back
    ["Lat Pulldown", "Back", "upper", "cable", "total", "vpull"],
    ["Close-Grip Lat Pulldown", "Back", "upper", "cable", "total", "vpull"],
    ["Single-Arm Lat Pulldown", "Back", "upper", "cable", "total", "vpull"],
    ["Machine Lat Pulldown", "Back", "upper", "machine", "total", "vpull"],
    ["Pull-Up", "Back", "upper", "pullup", "bw", "vpull"],
    ["Chin-Up", "Back", "upper", "pullup", "bw", "vpull"],
    ["Neutral-Grip Pull-Up", "Back", "upper", "pullup", "bw", "vpull"],
    ["Band Lat Pulldown", "Back", "upper", "band", "level", "vpull"],
    ["Barbell Row", "Back", "upper", "barbell", "total", "hpull"],
    ["Pendlay Row", "Back", "upper", "barbell", "total", "hpull"],
    ["Seated Cable Row", "Back", "upper", "cable", "total", "hpull"],
    ["Single-Arm Cable Row", "Back", "upper", "cable", "total", "hpull"],
    ["Machine Row", "Back", "upper", "machine", "total", "hpull"],
    ["Plate-Loaded Row", "Back", "upper", "plate", "side", "hpull"],
    ["T-Bar Row", "Back", "upper", "plate", "side", "hpull"],
    ["Chest-Supported T-Bar Row", "Back", "upper", "plate", "side", "hpull"],
    ["One-Arm Dumbbell Row", "Back", "upper", "dumbbell", "each", "hpull"],
    ["Chest-Supported Dumbbell Row", "Back", "upper", "dumbbell", "each", "hpull"],
    ["Kettlebell Row", "Back", "upper", "kettlebell", "each", "hpull"],
    ["Inverted Row", "Back", "upper", "bodyweight", "bw", "hpull"],
    ["Band Row", "Back", "upper", "band", "level", "hpull"],
    ["Straight-Arm Pulldown", "Back", "upper", "cable", "total", "latiso"],
    ["Machine Pullover", "Back", "upper", "machine", "total", "latiso"],
    ["Dumbbell Pullover", "Back", "upper", "dumbbell", "total", "latiso"],
    ["Deadlift", "Back", "lower", "barbell", "total", "hinge"],
    ["Rack Pull", "Back", "lower", "barbell", "total", "hinge"],
    ["Back Extension", "Back", "lower", "bodyweight", "bw", "backext"],
    ["Reverse Hyperextension", "Back", "lower", "machine", "total", "backext"],
    ["Superman Hold", "Back", "lower", "bodyweight", "time", "backext"],

    // Traps
    ["Barbell Shrug", "Traps", "upper", "barbell", "total", "shrug"],
    ["Dumbbell Shrug", "Traps", "upper", "dumbbell", "each", "shrug"],
    ["Cable Shrug", "Traps", "upper", "cable", "total", "shrug"],

    // Shoulders
    ["Overhead Press", "Shoulders", "upper", "barbell", "total", "vpush"],
    ["Push Press", "Shoulders", "upper", "barbell", "total", "vpush"],
    ["Machine Shoulder Press", "Shoulders", "upper", "machine", "total", "vpush"],
    ["Smith Machine Shoulder Press", "Shoulders", "upper", "smith", "side", "vpush"],
    ["Seated Dumbbell Shoulder Press", "Shoulders", "upper", "dumbbell", "each", "vpush"],
    ["Arnold Press", "Shoulders", "upper", "dumbbell", "each", "vpush"],
    ["Kettlebell Overhead Press", "Shoulders", "upper", "kettlebell", "each", "vpush"],
    ["Landmine Press", "Shoulders", "upper", "barbell", "total", "vpush"],
    ["Pike Push-Up", "Shoulders", "upper", "bodyweight", "bw", "vpush"],
    ["Handstand Push-Up", "Shoulders", "upper", "bodyweight", "bw", "vpush"],
    ["Band Overhead Press", "Shoulders", "upper", "band", "level", "vpush"],
    ["Dumbbell Lateral Raise", "Shoulders", "upper", "dumbbell", "each", "latraise"],
    ["Cable Lateral Raise", "Shoulders", "upper", "cable", "total", "latraise"],
    ["Machine Lateral Raise", "Shoulders", "upper", "machine", "total", "latraise"],
    ["Cable Upright Row", "Shoulders", "upper", "cable", "total", "latraise"],
    ["Band Lateral Raise", "Shoulders", "upper", "band", "level", "latraise"],
    ["Dumbbell Front Raise", "Shoulders", "upper", "dumbbell", "each", "frontraise"],
    ["Cable Front Raise", "Shoulders", "upper", "cable", "total", "frontraise"],
    ["Reverse Pec Deck", "Shoulders", "upper", "machine", "total", "reardelt"],
    ["Face Pull", "Shoulders", "upper", "cable", "total", "reardelt"],
    ["Cable Rear Delt Fly", "Shoulders", "upper", "cable", "total", "reardelt"],
    ["Dumbbell Rear Delt Fly", "Shoulders", "upper", "dumbbell", "each", "reardelt"],
    ["Band Pull-Apart", "Shoulders", "upper", "band", "level", "reardelt"],

    // Biceps
    ["Barbell Curl", "Biceps", "upper", "barbell", "total", "curl"],
    ["EZ-Bar Curl", "Biceps", "upper", "barbell", "total", "curl"],
    ["EZ-Bar Preacher Curl", "Biceps", "upper", "barbell", "total", "curl"],
    ["Cable Curl", "Biceps", "upper", "cable", "total", "curl"],
    ["Bayesian Cable Curl", "Biceps", "upper", "cable", "total", "curl"],
    ["Machine Curl", "Biceps", "upper", "machine", "total", "curl"],
    ["Machine Preacher Curl", "Biceps", "upper", "machine", "total", "curl"],
    ["Dumbbell Curl", "Biceps", "upper", "dumbbell", "each", "curl"],
    ["Hammer Curl", "Biceps", "upper", "dumbbell", "each", "curl"],
    ["Incline Dumbbell Curl", "Biceps", "upper", "dumbbell", "each", "curl"],
    ["Concentration Curl", "Biceps", "upper", "dumbbell", "each", "curl"],
    ["Kettlebell Curl", "Biceps", "upper", "kettlebell", "each", "curl"],
    ["Band Curl", "Biceps", "upper", "band", "level", "curl"],

    // Triceps
    ["Close-Grip Bench Press", "Triceps", "upper", "barbell", "total", "hpush"],
    ["EZ-Bar Skull Crusher", "Triceps", "upper", "barbell", "total", "tri"],
    ["Tricep Pushdown (Rope)", "Triceps", "upper", "cable", "total", "tri"],
    ["Tricep Pushdown (Bar)", "Triceps", "upper", "cable", "total", "tri"],
    ["Overhead Cable Tricep Extension", "Triceps", "upper", "cable", "total", "tri"],
    ["Machine Tricep Extension", "Triceps", "upper", "machine", "total", "tri"],
    ["Seated Dip Machine", "Triceps", "upper", "machine", "total", "tri"],
    ["Overhead Dumbbell Tricep Extension", "Triceps", "upper", "dumbbell", "total", "tri"],
    ["Dumbbell Skull Crusher", "Triceps", "upper", "dumbbell", "each", "tri"],
    ["Tricep Kickback", "Triceps", "upper", "dumbbell", "each", "tri"],
    ["Tricep Dip", "Triceps", "upper", "bodyweight", "bw", "dip"],
    ["Bench Dip", "Triceps", "upper", "bodyweight", "bw", "tri"],
    ["Diamond Push-Up", "Triceps", "upper", "bodyweight", "bw", "tri"],
    ["Band Pushdown", "Triceps", "upper", "band", "level", "tri"],

    // Forearms and grip
    ["Barbell Wrist Curl", "Forearms", "upper", "barbell", "total", "grip"],
    ["Reverse Wrist Curl", "Forearms", "upper", "barbell", "total", "grip"],
    ["Reverse EZ-Bar Curl", "Forearms", "upper", "barbell", "total", "grip"],
    ["Dumbbell Wrist Curl", "Forearms", "upper", "dumbbell", "each", "grip"],
    ["Dead Hang", "Forearms", "upper", "pullup", "time", "grip"],

    // Quads
    ["Back Squat", "Quads", "lower", "barbell", "total", "squat"],
    ["Front Squat", "Quads", "lower", "barbell", "total", "squat"],
    ["Hack Squat", "Quads", "lower", "plate", "side", "squat"],
    ["Leg Press", "Quads", "lower", "plate", "side", "squat"],
    ["Pendulum Squat", "Quads", "lower", "plate", "side", "squat"],
    ["Smith Machine Squat", "Quads", "lower", "smith", "side", "squat"],
    ["Selectorized Leg Press", "Quads", "lower", "machine", "total", "squat"],
    ["Goblet Squat", "Quads", "lower", "dumbbell", "total", "squat"],
    ["Kettlebell Goblet Squat", "Quads", "lower", "kettlebell", "total", "squat"],
    ["Bodyweight Squat", "Quads", "lower", "bodyweight", "bw", "squat"],
    ["Pistol Squat", "Quads", "lower", "bodyweight", "bw", "squat"],
    ["Band Squat", "Quads", "lower", "band", "level", "squat"],
    ["Bulgarian Split Squat", "Quads", "lower", "dumbbell", "each", "lunge"],
    ["Walking Lunge", "Quads", "lower", "dumbbell", "each", "lunge"],
    ["Reverse Lunge", "Quads", "lower", "dumbbell", "each", "lunge"],
    ["Dumbbell Step-Up", "Quads", "lower", "dumbbell", "each", "lunge"],
    ["Barbell Lunge", "Quads", "lower", "barbell", "total", "lunge"],
    ["Smith Machine Split Squat", "Quads", "lower", "smith", "side", "lunge"],
    ["Bodyweight Split Squat", "Quads", "lower", "bodyweight", "bw", "lunge"],
    ["Bodyweight Lunge", "Quads", "lower", "bodyweight", "bw", "lunge"],
    ["Leg Extension", "Quads", "lower", "machine", "total", "quadiso"],
    ["Sissy Squat", "Quads", "lower", "bodyweight", "bw", "quadiso"],
    ["Wall Sit", "Quads", "lower", "bodyweight", "time", "quadiso"],
    ["Band Leg Extension", "Quads", "lower", "band", "level", "quadiso"],

    // Hamstrings
    ["Romanian Deadlift", "Hamstrings", "lower", "barbell", "total", "hinge"],
    ["Stiff-Leg Deadlift", "Hamstrings", "lower", "barbell", "total", "hinge"],
    ["Good Morning", "Hamstrings", "lower", "barbell", "total", "hinge"],
    ["Dumbbell Romanian Deadlift", "Hamstrings", "lower", "dumbbell", "each", "hinge"],
    ["Single-Leg Romanian Deadlift", "Hamstrings", "lower", "dumbbell", "each", "hinge"],
    ["Kettlebell Swing", "Hamstrings", "lower", "kettlebell", "total", "hinge"],
    ["Cable Pull-Through", "Hamstrings", "lower", "cable", "total", "hinge"],
    ["Single-Leg Hip Hinge", "Hamstrings", "lower", "bodyweight", "bw", "hinge"],
    ["Lying Leg Curl", "Hamstrings", "lower", "machine", "total", "hamcurl"],
    ["Seated Leg Curl", "Hamstrings", "lower", "machine", "total", "hamcurl"],
    ["Standing Leg Curl", "Hamstrings", "lower", "machine", "total", "hamcurl"],
    ["Nordic Hamstring Curl", "Hamstrings", "lower", "bodyweight", "bw", "hamcurl"],
    ["Glute-Ham Raise", "Hamstrings", "lower", "bodyweight", "bw", "hamcurl"],
    ["Sliding Leg Curl", "Hamstrings", "lower", "bodyweight", "bw", "hamcurl"],
    ["Band Leg Curl", "Hamstrings", "lower", "band", "level", "hamcurl"],

    // Glutes, adductors, abductors
    ["Barbell Hip Thrust", "Glutes", "lower", "barbell", "total", "hipthrust"],
    ["Hip Thrust Machine", "Glutes", "lower", "machine", "total", "hipthrust"],
    ["Sumo Deadlift", "Glutes", "lower", "barbell", "total", "hinge"],
    ["Trap Bar Deadlift", "Glutes", "lower", "barbell", "total", "hinge"],
    ["Dumbbell Hip Thrust", "Glutes", "lower", "dumbbell", "total", "hipthrust"],
    ["Glute Bridge", "Glutes", "lower", "bodyweight", "bw", "hipthrust"],
    ["Single-Leg Glute Bridge", "Glutes", "lower", "bodyweight", "bw", "hipthrust"],
    ["Cable Glute Kickback", "Glutes", "lower", "cable", "total", "glutiso"],
    ["Glute Kickback Machine", "Glutes", "lower", "machine", "total", "glutiso"],
    ["Hip Abduction Machine", "Abductors", "lower", "machine", "total", "abd"],
    ["Cable Hip Abduction", "Abductors", "lower", "cable", "total", "abd"],
    ["Band Lateral Walk", "Abductors", "lower", "band", "level", "abd"],
    ["Side-Lying Leg Raise", "Abductors", "lower", "bodyweight", "bw", "abd"],
    ["Hip Adduction Machine", "Adductors", "lower", "machine", "total", "add"],
    ["Cable Hip Adduction", "Adductors", "lower", "cable", "total", "add"],
    ["Copenhagen Plank", "Adductors", "lower", "bodyweight", "time", "add"],

    // Calves
    ["Standing Calf Raise", "Calves", "lower", "machine", "total", "calf"],
    ["Seated Calf Raise", "Calves", "lower", "machine", "total", "calf"],
    ["Leg Press Calf Raise", "Calves", "lower", "plate", "side", "calf"],
    ["Smith Machine Calf Raise", "Calves", "lower", "smith", "side", "calf"],
    ["Single-Leg Dumbbell Calf Raise", "Calves", "lower", "dumbbell", "each", "calf"],
    ["Bodyweight Calf Raise", "Calves", "lower", "bodyweight", "bw", "calf"],
    ["Tibialis Raise", "Calves", "lower", "bodyweight", "bw", "calf"],

    // Core
    ["Cable Crunch", "Core", "core", "cable", "total", "core"],
    ["Machine Crunch", "Core", "core", "machine", "total", "core"],
    ["Hanging Leg Raise", "Core", "core", "pullup", "bw", "core"],
    ["Hanging Knee Raise", "Core", "core", "pullup", "bw", "core"],
    ["Captain's Chair Leg Raise", "Core", "core", "bodyweight", "bw", "core"],
    ["Ab Wheel Rollout", "Core", "core", "bodyweight", "bw", "core"],
    ["Plank", "Core", "core", "bodyweight", "time", "core"],
    ["Side Plank", "Core", "core", "bodyweight", "time", "core"],
    ["Hollow Body Hold", "Core", "core", "bodyweight", "time", "core"],
    ["L-Sit", "Core", "core", "bodyweight", "time", "core"],
    ["Crunch", "Core", "core", "bodyweight", "bw", "core"],
    ["Decline Sit-Up", "Core", "core", "bodyweight", "bw", "core"],
    ["Lying Leg Raise", "Core", "core", "bodyweight", "bw", "core"],
    ["Dead Bug", "Core", "core", "bodyweight", "bw", "core"],
    ["Bird Dog", "Core", "core", "bodyweight", "bw", "core"],
    ["Russian Twist", "Core", "core", "bodyweight", "bw", "core"],
    ["Mountain Climber", "Core", "core", "bodyweight", "time", "core"],
    ["Pallof Press", "Core", "core", "cable", "total", "core"],
    ["Cable Woodchop", "Core", "core", "cable", "total", "core"],
    ["Band Pallof Press", "Core", "core", "band", "level", "core"],
    ["Suitcase Carry", "Core", "core", "dumbbell", "time", "carry"],

    // Full body, power and conditioning
    ["Power Clean", "Full body", "full", "barbell", "total", "power"],
    ["Hang Clean", "Full body", "full", "barbell", "total", "power"],
    ["Power Snatch", "Full body", "full", "barbell", "total", "power"],
    ["Barbell Thruster", "Full body", "full", "barbell", "total", "power"],
    ["Dumbbell Thruster", "Full body", "full", "dumbbell", "each", "power"],
    ["Dumbbell Snatch", "Full body", "full", "dumbbell", "each", "power"],
    ["Kettlebell Clean and Press", "Full body", "full", "kettlebell", "each", "power"],
    ["Turkish Get-Up", "Full body", "full", "kettlebell", "each", "power"],
    ["Farmer's Carry", "Full body", "full", "dumbbell", "time", "carry"],
    ["Kettlebell Farmer's Carry", "Full body", "full", "kettlebell", "time", "carry"],
    ["Burpee", "Full body", "full", "bodyweight", "bw", "plyo"],
    ["Box Jump", "Full body", "full", "bodyweight", "bw", "plyo"],
    ["Jump Squat", "Full body", "full", "bodyweight", "bw", "plyo"],
    ["Medicine Ball Slam", "Full body", "full", "other", "total", "plyo"],
    ["Sled Push", "Full body", "full", "other", "time", "carry"],
    ["Battle Ropes", "Full body", "full", "other", "time", "conditioning"],
    ["Jump Rope", "Cardio", "cardio", "bodyweight", "time", "conditioning"],

    // Cardio
    ["Treadmill Run", "Cardio", "cardio", "cardio", "cardio", "cardio"],
    ["Treadmill Incline Walk", "Cardio", "cardio", "cardio", "cardio", "cardio"],
    ["Stationary Bike", "Cardio", "cardio", "cardio", "cardio", "cardio"],
    ["Air Bike", "Cardio", "cardio", "cardio", "cardio", "cardio"],
    ["Rowing Machine", "Cardio", "cardio", "cardio", "cardio", "cardio"],
    ["Ski Erg", "Cardio", "cardio", "cardio", "cardio", "cardio"],
    ["Elliptical", "Cardio", "cardio", "cardio", "cardio", "cardio"],
    ["Stair Climber", "Cardio", "cardio", "cardio", "cardio", "cardio"],
    ["Outdoor Run", "Cardio", "cardio", "bodyweight", "cardio", "cardio"],
    ["Walk", "Cardio", "cardio", "bodyweight", "cardio", "cardio"],
    ["Hike", "Cardio", "cardio", "bodyweight", "cardio", "cardio"],
    ["Outdoor Cycling", "Cardio", "cardio", "other", "cardio", "cardio"],
    ["Swimming", "Cardio", "cardio", "other", "cardio", "cardio"],
  ];

  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const EXERCISES = ROWS.map(([name, group, region, equip, measure, pattern]) => ({
    id: slug(name), name, group, region, equip, measure, pattern,
  }));

  root.RL = Object.assign(root.RL || {}, { EQUIPMENT, ALL_EQUIPMENT, ENVIRONMENTS, GROUPS, REGIONS, MEASURES, EXERCISES, slug });
  if (typeof module !== "undefined") module.exports = root.RL;
})(typeof window !== "undefined" ? window : globalThis);
