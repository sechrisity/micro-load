# Compare With Friends

| Field | Value |
|---|---|
| Status | Backlog, not started |
| Proposed | 2026-11-26 |
| Depends on | Accounts and sync (hosted option), or a share-file format |

## Contents

- [Objective](#objective)
- [What to compare](#what-to-compare)
- [How sharing could work](#how-sharing-could-work)
- [Constraints](#constraints)
- [Open questions](#open-questions)

## Objective

Let a user compare their training with friends who opt in, to add accountability and a bit of competition, without turning the app into a social network or exposing health data.

## What to compare

Relative measures travel better between people of different size, age and experience than raw loads do.

| Measure | Example | Why it works |
|---|---|---|
| Consistency | Training days this month, week streak | Fair across levels |
| Goal completion | Goals hit this quarter | Rewards following through |
| Progress rate | Percent change in estimated 1RM on a chosen lift over 12 weeks | Compares improvement, not size |
| Quality | Average set quality this month | Matches the app's focus on clean reps |
| Raw lifts | Best squat, bench, deadlift | Only between friends who both choose to show them |

## How sharing could work

| Option | How | Trade-off |
|---|---|---|
| Share card | Export a small image or link with chosen stats | No server, no accounts, no live updates |
| Friend file | Each friend exports a signed summary file; the app shows them side by side | Private and offline, manual to refresh |
| Hosted groups | Opt-in groups on a hosted Rep Ledger server | Live leaderboards, but needs accounts, a privacy policy and moderation |

Start with the share card. Move to hosted groups only if people ask for them.

## Constraints

- **Opt-in only.** Nothing leaves the device unless the user picks what to share and with whom.
- **No health data.** Survey answers, health check results and notes are never shared.
- **No public leaderboards** by default. Groups of people who know each other.
- **No pressure loops.** No notifications that shame a missed session. The disclaimer and the stop-if-it-hurts tip still apply.
- **Legal.** Hosted groups mean holding other people's data: terms of use, a privacy notice and deletion on request.

## Open questions

- Which two or three measures matter most to the people who would use this?
- Should a group pick one shared measure, or see all of them?
- How to stop a share card being edited to show fake numbers, and does it matter between friends?
