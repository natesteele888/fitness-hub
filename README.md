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

Every exercise has a tappable "i" next to its name that opens a card with a
focus-area tag, a simple pose diagram, a plain-English how-to, a safety/form
cue, and a "Search a Video Demo" link. That link opens a YouTube *search*
for the move, not a specific hand-picked video — no video URL is hardcoded
anywhere, since there's no way to guarantee a specific link stays live or
keeps showing the right thing.

Progress and check-ins save to `localStorage` on whatever phone/browser opens
the page — no login, no server, nothing syncs across devices. To change
exercises, reps, phases, or weeks, edit the `WORKOUTS` and `SCHEDULE` data
near the top of the `<script>` block in `index.html`; the check-in metrics
are in the `METRICS` array just above them. The exercise cards are driven by
`EXLIB` (the library entries) and `EX_ALIASES` (mapping every exercise name
used in `WORKOUTS` to a library entry) — add a new exercise to `EX_ALIASES`
and `EXLIB` so its card doesn't come up empty. `POSE_ICONS` holds the shared
diagram set; reuse an existing icon key or add a new one there.

This repo was split out from `desmond-party` (which is just the birthday
RSVP sites) to keep workout apps in their own place as more get added.
