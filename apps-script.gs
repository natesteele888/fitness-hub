/**
 * Power Program - progress mirror + parent notifications
 * ------------------------------------------------------
 * A free backend so a parent can see training progress without asking,
 * and so progress survives an installed iOS web app dropping its
 * localStorage (a real WebKit behaviour, not an app bug).
 *
 * SETUP (about four minutes, once):
 *   1. Go to script.google.com > New project. Name it "Power Program".
 *   2. Delete the stub Code.gs contents and paste this whole file in.
 *   3. Run setup(). Authorise when asked. It creates the Google Sheet,
 *      installs the evening check trigger, and logs the Sheet link.
 *   4. Deploy > New deployment > Web app.
 *        Execute as: Me          Who has access: Anyone
 *      Copy the /exec URL.
 *   5. Put that URL in index.html's SYNC_URL.
 *
 * LATER CHANGES: Deploy > Manage deployments > pencil > Version: New
 * version > Deploy. Saving the editor alone changes nothing live.
 */

// ===================== SETTINGS =====================

// Who gets the notifications. Deliberately NOT written here: this repo is
// public, and setup() reads it from whoever authorises the script and stores
// it in Script Properties. Set OWNER_EMAIL_OVERRIDE in the live script only
// if you want the mail to go somewhere other than that account.
const OWNER_EMAIL_OVERRIDE = '';

// Shared with the app. NOT a secret: the app is a public static page, so
// whatever the app sends must also live in the page source. It only keeps
// random passers-by from writing to the endpoint. Never put a real secret
// here - anything the client needs is public by construction.
const CLIENT_TOKEN = 'pp-7Qm4xL9vKd2Rb8Nt';

const NOTIFY_ON_COMPLETE = true;   // email the moment a day is marked done
const QUIET_CHECK_HOUR   = 20;     // evening check, only mails if nothing was logged
const TZ = 'America/New_York';

// ====================================================

const LOG_SHEET   = 'Log';
const STATE_SHEET = 'State';
const PROP_SHEET_ID = 'POWER_SHEET_ID';
const PROP_OWNER    = 'POWER_OWNER_EMAIL';

// 'Finished day' is the day just completed; 'Up next' is what comes after it.
// Keeping both means the email can never announce the wrong day number.
const LOG_HEADERS = ['Logged at', 'Event', 'Finished day', 'Up next', 'Up next type',
                     'Days done', 'Streak', 'Week', 'Phase', 'Percent'];

/**
 * RUN THIS ONCE. Creates the Sheet, installs the evening trigger, logs the
 * link. Safe to run again - it reuses the Sheet it already made.
 */
function setup() {
  const ss = spreadsheet_();
  ss.setSpreadsheetTimeZone(TZ);
  logSheet_();
  stateSheet_();

  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'eveningCheck') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('eveningCheck').timeBased()
    .atHour(QUIET_CHECK_HOUR).everyDays(1).inTimezone(TZ).create();

  // A web request from the app runs anonymously, so Session.getEffectiveUser()
  // is empty there. Capture it now, while setup() runs as you.
  const who = OWNER_EMAIL_OVERRIDE || Session.getEffectiveUser().getEmail();
  if (!who) throw new Error('Could not read your email. Set OWNER_EMAIL_OVERRIDE and run setup() again.');
  PropertiesService.getScriptProperties().setProperty(PROP_OWNER, who);

  Logger.log('Notifications will go to: ' + who);
  Logger.log('Sheet: ' + ss.getUrl());
  Logger.log('Evening check installed for ' + QUIET_CHECK_HOUR + ':00 ' + TZ);
  Logger.log('Now: Deploy > New deployment > Web app (Execute as Me, Access Anyone).');
  return ss.getUrl();
}

/** The Sheet this script owns, created on first use. */
function spreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(PROP_SHEET_ID);
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (e) { /* recreate below */ }
  }
  const ss = SpreadsheetApp.create('Power Program - Progress');
  props.setProperty(PROP_SHEET_ID, ss.getId());
  return ss;
}

function sheet_(name, headers) {
  const ss = spreadsheet_();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    const first = ss.getSheets()[0];
    if (first.getName() === 'Sheet1' && first.getLastRow() === 0) ss.deleteSheet(first);
  }
  if (headers && sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function logSheet_()   { return sheet_(LOG_SHEET, LOG_HEADERS); }
function stateSheet_() { return sheet_(STATE_SHEET, ['Updated', 'State JSON']); }

// ===================== WEB APP =====================

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.token !== CLIENT_TOKEN) return json_({ ok: false, error: 'bad token' });

    const s = body.summary || {};
    const event = String(body.event || 'save');

    // Append-only history: a bad or stale write can add noise but can never
    // erase what already happened.
    logSheet_().appendRow([
      new Date(), event, s.doneDay || '', s.day || '', s.type || '',
      s.completedCount || 0, s.streak || 0, s.week || '', s.phase || '',
      (s.pct == null ? '' : s.pct + '%')
    ]);

    if (body.state) {
      const sh = stateSheet_();
      const row = sh.getLastRow() < 2 ? 2 : 2;
      sh.getRange(row, 1, 1, 2).setValues([[new Date(), JSON.stringify(body.state)]]);
    }

    if (NOTIFY_ON_COMPLETE && event === 'complete') notifyComplete_(s);
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/** The app reads its own state back, so a wiped phone heals itself. */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.token !== CLIENT_TOKEN) return json_({ ok: false, error: 'bad token' });
  const sh = stateSheet_();
  if (sh.getLastRow() < 2) return json_({ ok: true, state: null });
  const row = sh.getRange(2, 1, 1, 2).getValues()[0];
  let state = null;
  try { state = JSON.parse(row[1]); } catch (err) { state = null; }
  return json_({ ok: true, updated: row[0], state: state });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===================== NOTIFICATIONS =====================

function ownerEmail_() {
  return OWNER_EMAIL_OVERRIDE ||
         PropertiesService.getScriptProperties().getProperty(PROP_OWNER) || '';
}

function notifyComplete_(s) {
  const to = ownerEmail_();
  if (!to) return;   // setup() has not run yet
  const day  = s.doneDay || s.day || '?';
  const type = s.doneType || '';
  MailApp.sendEmail({
    to: to,
    subject: 'Day ' + day + ' done' + (type ? ' - ' + type : ''),
    htmlBody: shell_(
      '<h2 style="margin:0 0 4px">Day ' + day + ' is done' + (type ? ' &middot; ' + esc_(type) : '') + '</h2>' +
      '<p style="margin:0 0 18px;color:#666">Logged at ' + fmtTime_(new Date()) + '</p>' +
      standings_(s) + recent_()
    )
  });
}

/** Runs every evening. Mails only when nothing was logged, so one note a day. */
function eveningCheck() {
  const to = ownerEmail_();
  if (!to) return;
  const today = fmtDate_(new Date());
  if (loggedOn_(today)) return;   // the completion email already told the story

  const s = lastSummary_();
  const quiet = quietDays_();
  const sinceLine = quiet > 1
    ? '<p style="margin:0 0 18px;color:#a33"><b>' + quiet + ' days</b> since the last session.</p>'
    : '<p style="margin:0 0 18px;color:#666">Yesterday was logged, so this is just today.</p>';

  MailApp.sendEmail({
    to: to,
    subject: 'Nothing logged today' + (s.day ? ' (day ' + s.day + ' of ' + (s.total || 63) + ' is next)' : ''),
    htmlBody: shell_(
      '<h2 style="margin:0 0 4px">No session logged today</h2>' +
      sinceLine + standings_(s) + recent_()
    )
  });
}

function standings_(s) {
  if (!s || !s.day) return '';
  const rows = [
    ['Up next', 'Day ' + s.day + ' of ' + (s.total || 63) + (s.type ? ' &middot; ' + esc_(s.type) : '')],
    ['Block', (s.phase ? esc_(s.phase) : '') + (s.week ? ' &middot; week ' + s.week + ' of ' + (s.weeks || 9) : '')],
    ['Days done', (s.completedCount || 0) + ' of ' + (s.total || 63) + (s.pct != null ? ' (' + s.pct + '%)' : '')],
    ['Streak', (s.streak || 0) + (s.streak === 1 ? ' day' : ' days')]
  ];
  return '<table style="border-collapse:collapse;font-size:15px;margin-bottom:18px">' +
    rows.map(function (r) {
      return '<tr><td style="padding:3px 14px 3px 0;color:#777">' + r[0] +
             '</td><td style="padding:3px 0"><b>' + r[1] + '</b></td></tr>';
    }).join('') + '</table>';
}

/** Last 7 days as ticks, newest last. */
function recent_() {
  const sh = logSheet_();
  if (sh.getLastRow() < 2) return '';
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  const done = {};
  vals.forEach(function (r) {
    if (String(r[1]) === 'complete' && r[0] instanceof Date) done[fmtDate_(r[0])] = true;
  });
  let out = '';
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = fmtDate_(d);
    out += '<td style="padding:0 7px;text-align:center;font-size:12px;color:#888">' +
      Utilities.formatDate(d, TZ, 'EEE') + '<br>' +
      '<span style="font-size:19px">' + (done[key] ? '&#9679;' : '&#9675;') + '</span></td>';
  }
  return '<p style="margin:0 0 4px;color:#777;font-size:13px">Last 7 days</p>' +
         '<table style="border-collapse:collapse"><tr>' + out + '</tr></table>';
}

function shell_(inner) {
  return '<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;' +
         'max-width:460px;color:#222;line-height:1.45">' + inner +
         '<p style="margin:22px 0 0;font-size:12px;color:#999">Power Program</p></div>';
}

// ===================== HELPERS =====================

function loggedOn_(dateStr) {
  const sh = logSheet_();
  if (sh.getLastRow() < 2) return false;
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  return vals.some(function (r) {
    return String(r[1]) === 'complete' && r[0] instanceof Date && fmtDate_(r[0]) === dateStr;
  });
}

function quietDays_() {
  const sh = logSheet_();
  if (sh.getLastRow() < 2) return 0;
  const vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  let last = null;
  vals.forEach(function (r) {
    if (String(r[1]) === 'complete' && r[0] instanceof Date && (!last || r[0] > last)) last = r[0];
  });
  if (!last) return 0;
  return Math.floor((new Date() - last) / 86400000);
}

function lastSummary_() {
  const sh = logSheet_();
  if (sh.getLastRow() < 2) return {};
  const r = sh.getRange(sh.getLastRow(), 1, 1, LOG_HEADERS.length).getValues()[0];
  const pct = String(r[9] || '').replace('%', '');
  return {
    doneDay: r[2], day: r[3], type: r[4], completedCount: r[5], streak: r[6],
    week: r[7], phase: r[8], pct: pct === '' ? null : Number(pct), total: 63, weeks: 9
  };
}

function fmtDate_(d) { return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); }
function fmtTime_(d) { return Utilities.formatDate(d, TZ, "h:mm a 'on' EEE, MMM d"); }
function esc_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Handy from the editor: proves mail works and shows what you'd receive. */
function testEmail() {
  const real = lastSummary_();
  notifyComplete_(real.day ? real : {
    doneDay: 3, doneType: 'Dumbbells', day: 4, type: 'Speed & Agility',
    total: 63, week: 1, weeks: 9, phase: 'Foundation', pct: 5,
    streak: 3, completedCount: 3
  });
}
