# Fitness Hub

Desmond's workout apps — standalone, mobile-first training tools, each a
single self-contained HTML file (no build step, no backend) hosted on
GitHub Pages.

## Apps

| | |
|---|---|
| **Power Program** | 9-week offseason plyometrics, core, and dumbbell program, plus a check-in tab for tracking height, weight, broad jump, plank hold, and 10-yard sprint over time. |
| File | `index.html` |
| Live | [/fitness-hub/](https://natesteele888.github.io/fitness-hub/) |

Progress and check-ins save to `localStorage` on whatever phone/browser opens
the page — no login, no server, nothing syncs across devices. To change
exercises, reps, phases, or weeks, edit the `WORKOUTS` and `SCHEDULE` data
near the top of the `<script>` block in `index.html`; the check-in metrics
are in the `METRICS` array just above them.

This repo was split out from `desmond-party` (which is just the birthday
RSVP sites) to keep workout apps in their own place as more get added.

## Morning reminders

`reminders/<start-monday>.ics` holds 63 daily 7am events, one per program day,
each with an alarm carrying that day's pump-up line. GitHub Pages is static and
cannot send a web push, so the nudge rides on the phone's own calendar instead.

There is one file per candidate start Monday because football runs into the
playoffs and the real start date is not known in advance; the picker on the
Program tab points at the matching file. The files are generated from the
`PUMP` / `pumpFor` data inside `index.html`, so the two can never drift — if you
edit the messages, or want different start dates, regenerate rather than editing
the `.ics` files by hand.
