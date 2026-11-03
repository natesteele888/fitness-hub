// Generate one reminders .ics per candidate start Monday.
//
// Three events a day, because one 7am nudge couldn't carry the day's plan,
// a midday check-in and tomorrow's agenda:
//   07:00  what today is, in full, plus the day's pump-up line
//   15:30  where he is in the program and a prod to tick the session off
//   19:45  what tomorrow is, so it's never a surprise
//
// Everything is read out of index.html -- the phases, the workouts, the
// schedule builder and the PUMP lines -- so the calendar can't drift from
// the app. Change the program, re-run this; never hand-edit the .ics files.
//
// What this canNOT do: report his ACTUAL logged progress. These files are
// written now, once, for all 63 days, and his completions live in
// localStorage on his phone. The 15:30 event therefore says where the
// CALENDAR is ("Day 12 of 63") and asks whether he got it in -- it never
// claims he did. Real "you're 12 of 63 done, 4-day streak" push needs a
// server that knows his data; see the README.
const fs = require('fs');
const path = require('path');

const REPO = '/Volumes/AutoNuvo_1/fitness-hub';
const src = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');

function grab(startMarker, endMarker, dropEnd) {
  const from = src.indexOf(startMarker);
  if (from < 0) throw new Error('could not find ' + startMarker);
  const to = src.indexOf(endMarker, from);
  if (to < 0) throw new Error('no end marker after ' + startMarker);
  return src.slice(from, dropEnd ? to : to + endMarker.length);
}

// PHASES / DAY_ORDER / TYPE_LABEL / w() / WORKOUTS sit in one contiguous run
// that ends right before the Measurements section.
const program  = grab('  var PHASES = [', '  // ---------- Measurements ----------', true);
const schedule = grab('  var SCHEDULE = [];', '  var TOTAL_DAYS = SCHEDULE.length;');
const pump     = grab('  var PUMP = {', '\n  };') + '\n'
               + grab('  var PUMP_MILESTONE = {', '\n  };') + '\n'
               + grab('  function pumpFor(day, type){', '\n  }');

const api = new Function(program + '\n' + schedule + '\n' + pump +
  '\nreturn {PHASES:PHASES, DAY_ORDER:DAY_ORDER, TYPE_LABEL:TYPE_LABEL,' +
  ' SCHEDULE:SCHEDULE, TOTAL_DAYS:TOTAL_DAYS, pumpFor:pumpFor};')();
const { PHASES, TYPE_LABEL, SCHEDULE, TOTAL_DAYS, pumpFor } = api;
if (SCHEDULE.length !== 63) throw new Error('expected 63 scheduled days, got ' + SCHEDULE.length);

// No child's name in anything served from here: these .ics files are public
// at /fitness-hub/reminders/, so naming him in X-WR-CALNAME would undo the
// scrub that took his name out of the page title and the manifest.
const APP = 'https://natesteele888.github.io/fitness-hub/';
const MEASURE_DAYS = { 1: true, 22: true, 43: true, 63: true };

// ---- what a day actually asks of him -----------------------------------
function rounds(e) { return e.workout.roundsByWeek[e.weekInPhase]; }
function headline(e) {
  if (e.type === 'REST') return 'Day ' + e.day + ' \u00b7 Rest';
  return 'Day ' + e.day + ' \u00b7 ' + TYPE_LABEL[e.type] + ' \u00b7 ' + e.workout.time;
}
function plan(e) {
  if (e.type === 'REST') return 'Rest day. Stretch, sleep, eat.';
  const w = e.workout;
  return w.title + '\n' + rounds(e) + ' rounds of ' + w.main.length + ' moves \u00b7 ' + w.time
       + '\nWarm-up ' + w.warmup.length + ' \u00b7 main ' + w.main.length + ' \u00b7 cool-down ' + w.cooldown.length;
}
function mainList(e, label) {
  if (e.type === 'REST') return '';
  return '\n\n' + label + ':\n' + e.workout.main.map(m => '\u2022 ' + m.name + ' \u2014 ' + m.reps).join('\n');
}

// ---- ICS plumbing -------------------------------------------------------
function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
// RFC 5545 folds at 75 octets; a continuation line's leading space costs one
// of the 75, so every chunk after the first gets 74 bytes of payload.
//
// Folding has to count BYTES but cut on CHARACTER boundaries. Slicing the
// raw buffer every 74 bytes split multi-byte characters -- the bullets and
// em-dashes in the exercise lists -- and each broken half decoded to U+FFFD,
// which both corrupted the text and pushed the line back over 75 octets
// (U+FFFD is itself 3 bytes). Walking code points fixes both at once.
function fold(line) {
  const chunks = [];
  let cur = '', curBytes = 0, limit = 75;   // 74 + the continuation space after the first
  for (const ch of line) {                  // for..of walks code points, not UTF-16 units
    const n = Buffer.byteLength(ch, 'utf8');
    // Never break immediately after a backslash: unfolding happens before
    // unescaping per spec, but splitting an escaped \\n down the middle is
    // the kind of thing a lenient parser gets wrong, and this ships to a phone.
    if (curBytes + n > limit || (curBytes + n === limit && ch === '\\')) {
      chunks.push(cur);
      cur = ch; curBytes = n; limit = 74;
    } else {
      cur += ch; curBytes += n;
    }
  }
  chunks.push(cur);
  return chunks.join('\r\n ');
}
const pad = n => String(n).padStart(2, '0');
function stamp(d) {
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
       + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
}

function build(startIso) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Power Program//EN',
             'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
             'X-WR-CALNAME:Power Program',
             fold('X-WR-CALDESC:Daily plan\\, check-in and next-day agenda for the 9-week program')];

  // seq 1 marks a revision of an event that was already published under this
  // UID, so a calendar updates it in place instead of keeping both copies.
  function event(uid, when, mins, summary, body, seq) {
    const e = new Date(when); e.setMinutes(e.getMinutes() + mins);
    L.push('BEGIN:VEVENT');
    L.push('UID:dpp-' + startIso + '-' + uid + '@natesteele888.github.io');
    L.push('SEQUENCE:' + (seq || 0));
    L.push('DTSTAMP:20261103T120000Z');
    L.push('DTSTART:' + stamp(when));
    L.push('DTEND:' + stamp(e));
    L.push(fold('SUMMARY:' + esc(summary)));
    L.push(fold('DESCRIPTION:' + esc(body + '\n\n' + APP)));
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M');
    L.push(fold('DESCRIPTION:' + esc(summary)));
    L.push('END:VALARM', 'END:VEVENT');
  }

  const start = new Date(startIso + 'T00:00:00');
  const at = (dayIdx, h, m) => {
    const d = new Date(start); d.setDate(d.getDate() + dayIdx); d.setHours(h, m, 0, 0); return d;
  };

  SCHEDULE.forEach((e, i) => {
    const phase = PHASES[e.phase].name;
    const pct = Math.round(e.day / TOTAL_DAYS * 100);

    // 07:00 -- the day's plan, then the line that gets him out the door.
    // UID stays 'day<N>', what the one-a-day version published, so a phone
    // that already has those events UPDATES them rather than ending up with
    // two 7am alerts a day. The 15:30 and 19:45 events are genuinely new.
    event('day' + e.day, at(i, 7, 0), 20, headline(e),
      plan(e) + mainList(e, 'Today') + '\n\n' + pumpFor(e.day, e.type), 1);

    // 15:30 -- where he is, and a prod to log it. Deliberately a question:
    // this file was written weeks ago and cannot know what he's ticked off.
    const midSummary = e.type === 'REST'
      ? 'Day ' + e.day + ' of ' + TOTAL_DAYS + ' \u00b7 Rest earned'
      : 'Day ' + e.day + ' of ' + TOTAL_DAYS + ' \u00b7 Did you get it in?';
    let midBody = 'Week ' + e.week + ' of 9 \u00b7 ' + phase + ' block \u00b7 ' + pct + '% of the way through.\n\n'
      + (e.type === 'REST'
          ? 'Nothing to log today. Rest is the work.'
          : 'If today\u2019s session is done, open the app and tick it off. If it isn\u2019t, there\u2019s still time.');
    if (MEASURE_DAYS[e.day]) {
      midBody += '\n\nThis is a measure day \u2014 log height, weight, broad jump (each leg), plank, 10-yard sprint and your longest field goal.';
    }
    event('d' + e.day + 'pm', at(i, 15, 30), 15, midSummary, midBody);

    // 19:45 -- tomorrow, so he never opens the app cold
    const next = SCHEDULE[i + 1];
    if (next) {
      event('d' + e.day + 'eve', at(i, 19, 45), 15,
        'Tomorrow: ' + headline(next),
        plan(next) + mainList(next, 'Tomorrow'));
    } else {
      event('d' + e.day + 'eve', at(i, 19, 45), 15,
        'Last day done \u2014 go measure everything',
        'Nine weeks, nobody watching, and you did every one. Log your final numbers and compare them to day one.');
    }
  });

  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}

const MONDAYS = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30', '2026-12-07'];
const outDir = path.join(REPO, 'reminders');
fs.mkdirSync(outDir, { recursive: true });
MONDAYS.forEach(iso => {
  const buf = Buffer.from(build(iso), 'utf8');
  fs.writeFileSync(path.join(outDir, iso + '.ics'), buf);
  const raw = buf.toString('latin1');
  const lines = raw.split('\r\n');
  const bare = (raw.match(/(?<!\r)\n/g) || []).length;
  const long = lines.filter(l => Buffer.from(l, 'latin1').length > 75).length;
  console.log(iso,
    'events=' + (raw.match(/BEGIN:VEVENT/g) || []).length,
    'alarms=' + (raw.match(/BEGIN:VALARM/g) || []).length,
    'bareLF=' + bare, 'over75=' + long,
    'KB=' + Math.round(buf.length / 1024));
});
