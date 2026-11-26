# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-26

### Added

- First public release, generalised from a single-user personal build.
- Disclaimer acceptance gate and onboarding survey (experience, ranked goals, multiple training places, equipment, schedule, units, health check).
- Built-in library of 223 exercises, listed alphabetically with equipment filtering, plus custom exercises and per-exercise edits.
- Starter routines generated from schedule and equipment; save any session as a routine.
- Insert an exercise between any two exercises in a session.
- Measures for per-side, per-dumbbell, pin or setting, bodyweight, timed holds and cardio.
- Warm-up sets, rest timer, plate calculator and personal record detection.
- Adaptive suggestions that learn which goal types land on each exercise.
- Next-set advice within a session from RIR against a configurable target.
- History statistics: sessions per week and month, week streak, sets per muscle group, and a month calendar of training days.
- Monthly, quarterly and yearly goals with progress and pace.
- Personal mode (`REPLEDGER_PERSONAL=1`) for a single owner, with migration from the original single-user app's data.
- JSON backup export and import, CSV export, delete all data.
- Optional HTTP Basic auth, strict security headers, non-root read-only container.
- Native-style interface: bottom tab bar on phones and sidebar on desktop, compact set rows with RIR and quality rated after each set, bottom sheets, light and dark themes, system fonts only.
