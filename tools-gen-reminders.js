// Generate one reminders .ics per candidate start Monday.
// Pulls DAY_ORDER / TYPE_LABEL / PUMP / PUMP_MILESTONE / pumpFor straight out of
// index.html so the calendar text can never drift from the app's text.
const fs = require('fs');
const path = require('path');

const REPO = '/Volumes/AutoNuvo_1/fitness-hub';
const src = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');

function grab(startRe, endMarker){
  const m = src.match(startRe);
  if(!m) throw new Error('could not find ' + startRe);
  const from = m.index;
  const to = src.indexOf(endMarker, from);
  if(to < 0) throw new Error('no end marker after ' + startRe);
  return src.slice(from, to + endMarker.length);
}

const chunks = [
  grab(/  var DAY_ORDER = /, '];'),
  grab(/  var TYPE_LABEL = /, '};'),
  grab(/  var PUMP = \{/, '\n  };'),
  grab(/  var PUMP_MILESTONE = \{/, '\n  };'),
  grab(/  function pumpFor\(day, type\)\{/, '\n  }')
].join('\n');

const api = new Function(chunks + '\nreturn {DAY_ORDER:DAY_ORDER, TYPE_LABEL:TYPE_LABEL, PUMP:PUMP, pumpFor:pumpFor};')();
const { DAY_ORDER, TYPE_LABEL, pumpFor } = api;

// --- ICS helpers ---------------------------------------------------------
function esc(s){
  return String(s).replace(/\\/g,'\\\\').replace(/;/g,'\;').replace(/,/g,'\\,').replace(/\n/g,'\\n');
}
// RFC 5545: lines wrap at 75 octets. Continuation lines carry a leading space,
// which costs one of the 75 - so later chunks get 74 bytes of payload.
function fold(line){
  const b = Buffer.from(line, 'utf8');
  if(b.length <= 75) return line;
  const out = [b.slice(0, 75).toString('utf8')];
  let i = 75;
  while(i < b.length){ out.push(' ' + b.slice(i, i + 74).toString('utf8')); i += 74; }
  return out.join('\r\n');
}
function pad(n){ return String(n).padStart(2,'0'); }
function stamp(d){
  return d.getFullYear() + pad(d.getMonth()+1) + pad(d.getDate())
       + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
}

function build(startIso){
  const start = new Date(startIso + 'T07:00:00');
  const L = [
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Desmond Power Program//EN',
    'CALSCALE:GREGORIAN','METHOD:PUBLISH',
    'X-WR-CALNAME:Desmond\'s Power Program',
    'X-WR-CALDESC:Morning reminders for the 9-week offseason program'
  ];
  for(let day = 1; day <= 63; day++){
    const type = DAY_ORDER[(day - 1) % 7];
    const line = pumpFor(day, type);
    const label = TYPE_LABEL[type];
    const s = new Date(start); s.setDate(s.getDate() + day - 1);
    const e = new Date(s); e.setMinutes(e.getMinutes() + 20);
    const title = type === 'REST' ? 'Day ' + day + ' - Rest' : 'Day ' + day + ' - ' + label;
    L.push('BEGIN:VEVENT');
    L.push('UID:dpp-' + startIso + '-day' + day + '@natesteele888.github.io');
    L.push('DTSTAMP:20261031T120000Z');
    L.push('DTSTART:' + stamp(s));
    L.push('DTEND:' + stamp(e));
    L.push(fold('SUMMARY:' + esc(title)));
    L.push(fold('DESCRIPTION:' + esc(line + '\n\nOpen the app: https://natesteele888.github.io/fitness-hub/')));
    L.push('BEGIN:VALARM','ACTION:DISPLAY','TRIGGER:PT0M');
    L.push(fold('DESCRIPTION:' + esc(line)));
    L.push('END:VALARM','END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}

// Candidate start Mondays: Nov 2 (if the season ends this weekend) through
// Dec 7, which covers any playoff run plus a Thanksgiving-week slip.
const MONDAYS = ['2026-11-02','2026-11-09','2026-11-16','2026-11-23','2026-11-30','2026-12-07'];
const outDir = path.join(REPO, 'reminders');
fs.mkdirSync(outDir, { recursive: true });
MONDAYS.forEach(function(iso){
  const body = build(iso);
  const buf = Buffer.from(body, 'utf8');
  fs.writeFileSync(path.join(outDir, iso + '.ics'), buf);
  // validate as raw bytes - universal-newline reads lie about CRLF
  const lines = buf.toString('latin1').split('\r\n');
  const bare = (buf.toString('latin1').match(/(?<!\r)\n/g) || []).length;
  const long = lines.filter(function(l){ return Buffer.from(l,'latin1').length > 75; }).length;
  console.log(iso,
    'events=' + (body.match(/BEGIN:VEVENT/g)||[]).length,
    'alarms=' + (body.match(/BEGIN:VALARM/g)||[]).length,
    'bareLF=' + bare, 'over75=' + long, 'bytes=' + buf.length);
});
