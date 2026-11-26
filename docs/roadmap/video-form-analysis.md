# Video Form and Velocity Analysis

| Field | Value |
|---|---|
| Status | Research, not started |
| Proposed | 2026-11-26 |
| Depends on | Next-set suggestions (built), per-rep form labels |

## Contents

- [Objective](#objective)
- [Core idea](#core-idea)
- [Pipeline](#pipeline)
- [Metrics per set](#metrics-per-set)
- [How it feeds progression](#how-it-feeds-progression)
- [Data needed](#data-needed)
- [Constraints](#constraints)
- [Phased plan](#phased-plan)
- [Open questions](#open-questions)

## Objective

Let a user record a set on their phone and have Rep Ledger detect form breakdown across the set, then use that to decide whether to progress the next set or next session.

## Core idea

The deciding signal is form breakdown, not speed. With tempo controlled on purpose, rep speed should barely change across a good set, so a slowdown is at most a secondary flag. What matters is the small, often unnoticed ways a rep drifts from the first one: range of motion shortening, a joint path shifting, a hip or shoulder starting to compensate, a pause getting shorter.

Each rep is compared with the first rep of the same set. The user is their own baseline, so differences in height, limb length and build mostly cancel out, and no large dataset of different bodies is needed to start.

Breakdown is small and personal: what counts as a broken rep differs by lifter and takes experience to see. So thresholds are calibrated per user from their own labelled reps, not fixed for everyone.

## Pipeline

| Step | What happens | Tooling |
|---|---|---|
| 1. Capture | User records the set, phone fixed, side view | Browser camera or file upload |
| 2. Pose | Body landmarks per frame | Off-the-shelf pose model running on device (for example MediaPipe Pose Landmarker for web) |
| 3. Smooth | Filter landmark jitter | Simple low-pass or one-euro filter |
| 4. Segment | Split into reps from the primary joint angle or bar path | Peak and valley detection per exercise |
| 5. Measure | Compute per-rep metrics | Plain JavaScript in `logic.js` style, unit tested |
| 6. Compare | First rep vs each later rep | Ratios, not absolute values |
| 7. Suggest | Feed results into the progression rules | Existing `suggest()` with new inputs |

## Metrics per set

Ordered by weight in the decision.

| Metric | Definition | Signals |
|---|---|---|
| Range of motion | Joint angle travel per rep vs rep 1 | Shortened reps |
| Path deviation | Drift of key joints from rep 1's path | Form breakdown |
| Compensation | New movement in joints that should stay still (hip shift, torso lean, shoulder shrug) | Breakdown the lifter may not feel |
| Symmetry | Left vs right angle difference compared with rep 1 | One side taking over |
| Tempo consistency | Eccentric, pause and concentric durations vs rep 1 | Control slipping, pauses shortening |
| Velocity loss | Last rep speed vs first rep speed | Secondary flag only, since tempo is controlled |

## How it feeds progression

| Observation | Suggested action |
|---|---|
| All reps within the user's tolerance of rep 1 | Progress next set or next session |
| Drift starts only on the final rep | Hold load, aim for the same reps cleaner |
| Drift starts mid-set or compensation appears | Hold or reduce, flag reps that did not count |
| Range of motion drops on several reps | Count only full reps, hold load |

Tolerances are per user and per exercise, set from calibration below.

## Data needed

Validation and calibration data, not training data. The pose model is already trained.

| Data | Amount | Source |
|---|---|---|
| Side-view recordings of real sets | A few dozen sets per exercise to start | Own training |
| Per-rep label | Clean or broke down, marked by the lifter or a coach watching the replay | Labelled in the app after the set |
| Per-set label | RIR and quality, as logged today | Rep Ledger |
| Varied lifters | Later, to check the approach generalises | Volunteers who opt in |

The per-rep labels are what tune each user's tolerances. Experienced lifters label more precisely, so the app should let a coach review and relabel.

## Constraints

- **Privacy:** gym video is sensitive. Process on device and never upload. Store derived metrics only unless the user chooses to keep the video.
- **Camera setup:** results depend on a consistent angle and full body in frame. The app must guide setup and reject unusable footage.
- **Occlusion:** machines, racks and benches hide joints. Start with exercises that film cleanly.
- **Exercise specific:** rep detection and form rules differ per movement. Support a short list well before adding more.
- **Liability:** form feedback is closer to coaching than logging. Update the disclaimer and keep all outputs advisory and overridable.
- **Cost:** on-device processing has no per-use cost. Avoid cloud inference.

## Phased plan

| Phase | Scope | Exit check |
|---|---|---|
| 0 | Next-set suggestions (done); add a per-rep clean or broke-down label to logged sets | Used for several weeks of real training |
| 1 | Offline script: pose and per-rep metrics on recorded files for one lift (side-view squat or a machine press) | Rep count matches manual count on all test sets |
| 2 | Breakdown metrics vs per-rep labels on own recordings | Metrics separate clean from broken reps, tolerances chosen |
| 3 | In-app recording for that lift, results shown next to the set | Works on a mid-range phone without upload |
| 4 | Feed metrics into suggestions, add lifts one at a time | Suggestions agree with logged outcomes |

## Open questions

- Which two exercises film most reliably in a typical gym?
- Which compensation patterns matter most per exercise, and can they be listed as rules a coach can edit?
- How few labelled reps does a new user need before their tolerances are usable?
- How much does phone placement vary between sessions, and can the app correct for it?
- Should derived metrics sync to the server, or stay on the device that recorded them?
