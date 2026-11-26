# Video Form and Velocity Analysis

| Field | Value |
|---|---|
| Status | Research, not started |
| Proposed | 2026-11-26 |
| Depends on | Next-set suggestions, last-rep slowdown rating |

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

Let a user record a set on their phone and have Rep Ledger measure how the reps changed from first to last, then use that to decide whether to progress the next set or next session.

## Core idea

Compare each rep against the first rep of the same set. The user is their own baseline, so differences in height, limb length and build mostly cancel out. This avoids the need for a large dataset of different bodies.

The approach follows velocity-based training: concentric speed drops as a set approaches failure, and the size of that drop is a well-studied proxy for reps in reserve.

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

| Metric | Definition | Signals |
|---|---|---|
| Concentric time | Duration of the lifting phase per rep | Slowdown, proximity to failure |
| Velocity loss | Last rep speed vs first rep speed, percent | Fatigue within the set |
| Range of motion | Joint angle travel per rep vs rep 1 | Shortened reps |
| Path deviation | Drift of key joints from rep 1's path | Form breakdown |
| Tempo consistency | Variance of eccentric and pause durations | Control |

## How it feeds progression

| Observation | Suggested action |
|---|---|
| Low velocity loss, full range, target reps hit | Progress next set or next session |
| Moderate velocity loss, form holds | Hold load, aim for the same reps |
| High velocity loss or range of motion drops | Hold or reduce, flag reps that did not count |
| Path deviation grows across reps | Hold load, add a form cue to the set note |

Thresholds are placeholders until validated on recorded sets.

## Data needed

Validation data, not training data. The pose model is already trained.

| Data | Amount | Source |
|---|---|---|
| Side-view recordings of real sets | A few dozen sets per exercise to start | Own training |
| Label per set | RIR, or reps to failure on a test set | Logged in Rep Ledger at the time |
| Varied lifters | Later, to check thresholds generalise | Volunteers who opt in |

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
| 0 | Ship the manual last-rep slowdown rating and next-set suggestions | Used for several weeks of real training |
| 1 | Offline script: pose and per-rep metrics on recorded files for one lift (side-view squat or a machine press) | Rep count matches manual count on all test sets |
| 2 | Velocity loss vs logged RIR on own recordings | Clear relationship, thresholds chosen |
| 3 | In-app recording for that lift, results shown next to the set | Works on a mid-range phone without upload |
| 4 | Feed metrics into suggestions, add lifts one at a time | Suggestions agree with logged outcomes |

## Open questions

- Which two exercises film most reliably in a typical gym?
- Is joint-angle velocity a good enough stand-in for bar velocity on machines?
- How much does phone placement vary between sessions, and can the app correct for it?
- Should derived metrics sync to the server, or stay on the device that recorded them?
