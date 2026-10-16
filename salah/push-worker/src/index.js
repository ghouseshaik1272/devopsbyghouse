const ALLOWED_ORIGINS = new Set(['https://devopsbyghouse.co.in', 'https://www.devopsbyghouse.co.in']);
const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
const OFFSETS = [15, 5, 1, 0];
const encoder = new TextEncoder();
let jwksCache;

function json(body, status = 200, origin = '') {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  if (ALLOWED_ORIGINS.has(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers.Vary = 'Origin';
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

function b64url(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

async function getJwks() {
  if (jwksCache && jwksCache.expires > Date.now()) return jwksCache.keys;
  const response = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if (!response.ok) throw new Error('Unable to load Firebase signing keys.');
  const data = await response.json();
  jwksCache = { keys: data.keys, expires: Date.now() + 45 * 60 * 1000 };
  return data.keys;
}

async function verifyFirebaseToken(request, projectId) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token || !projectId) throw new Error('Sign in is required.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid sign-in token.');
  const header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Invalid sign-in token.');
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` || !claims.sub || claims.sub.length > 128 || claims.exp <= Date.now() / 1000 || claims.iat > Date.now() / 1000 + 60) throw new Error('Sign-in token expired or is for another project.');
  const jwk = (await getJwks()).find(key => key.kid === header.kid);
  if (!jwk) throw new Error('Firebase signing key was not found.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, b64url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) throw new Error('Sign-in token could not be verified.');
  return claims.sub;
}

function localClock(timeZone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return { day: `${value.year}-${value.month}-${value.day}`, minute: Number(value.hour) * 60 + Number(value.minute) };
}

function validPrayerTimes(times) {
  return Array.isArray(times) && times.length === 5 && times.every(time => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
}

async function sendOneSignal(env, row) {
  const isExact = row.minutes_before === 0;
  const message = isExact
    ? `${row.prayer} time has started now.`
    : `${row.prayer} in ${row.minutes_before} minute${row.minutes_before === 1 ? '' : 's'}.`;
  const response = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: { Authorization: `Key ${env.ONESIGNAL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: env.ONESIGNAL_APP_ID,
      target_channel: 'push',
      include_aliases: { external_id: [row.uid] },
      headings: { en: isExact ? `${row.prayer} prayer time` : `Salah reminder: ${row.prayer}` },
      contents: { en: message },
      url: 'https://devopsbyghouse.co.in/salah/index.html',
      data: { prayer: row.prayer, minutesBefore: row.minutes_before }
    })
  });
  if (!response.ok) throw new Error(`Push provider returned ${response.status}.`);
}

async function handleProfile(request, env, origin) {
  const uid = await verifyFirebaseToken(request, env.FIREBASE_PROJECT_ID);
  const body = await request.json();
  const timeZone = body.timeZone;
  if (typeof timeZone !== 'string' || timeZone.length > 80) return json({ error: 'Choose a valid device time zone.' }, 400, origin);
  try { new Intl.DateTimeFormat('en', { timeZone }); } catch { return json({ error: 'Choose a valid device time zone.' }, 400, origin); }
  if (!validPrayerTimes(body.prayerTimes)) return json({ error: 'Save all five prayer times before enabling reminders.' }, 400, origin);
  const tone = ['gentle', 'adhan', 'bell'].includes(body.tone) ? body.tone : 'gentle';
  await env.DB.prepare(`INSERT INTO reminder_users(uid, prayer_times, time_zone, tone, enabled, updated_at)
    VALUES(?, ?, ?, ?, ?, ?)
    ON CONFLICT(uid) DO UPDATE SET prayer_times=excluded.prayer_times, time_zone=excluded.time_zone,
      tone=excluded.tone, enabled=excluded.enabled, updated_at=excluded.updated_at`)
    .bind(uid, JSON.stringify(body.prayerTimes), timeZone, tone, body.enabled === false ? 0 : 1, new Date().toISOString()).run();
  return json({ ok: true }, 200, origin);
}

async function handleCheckIn(request, env, origin) {
  const uid = await verifyFirebaseToken(request, env.FIREBASE_PROJECT_ID);
  const { prayer } = await request.json();
  if (!PRAYERS.includes(prayer)) return json({ error: 'Unknown prayer.' }, 400, origin);
  const user = await env.DB.prepare('SELECT time_zone FROM reminder_users WHERE uid=?').bind(uid).first();
  if (!user) return json({ ok: true }, 200, origin);
  const { day } = localClock(user.time_zone);
  await env.DB.prepare('INSERT OR IGNORE INTO prayer_checkins(uid, local_day, prayer, created_at) VALUES(?, ?, ?, ?)')
    .bind(uid, day, prayer, new Date().toISOString()).run();
  return json({ ok: true }, 200, origin);
}

async function runScheduler(env) {
  if (!env.ONESIGNAL_API_KEY || !env.ONESIGNAL_APP_ID || !env.FIREBASE_PROJECT_ID) throw new Error('Set the required Worker secrets first.');
  const users = await env.DB.prepare('SELECT uid, prayer_times, time_zone FROM reminder_users WHERE enabled=1').all();
  for (const user of users.results) {
    let times;
    try { times = JSON.parse(user.prayer_times); } catch { continue; }
    if (!validPrayerTimes(times)) continue;
    let local;
    try { local = localClock(user.time_zone); } catch { continue; }
    for (let i = 0; i < PRAYERS.length; i++) {
      const prayerMinute = Number(times[i].slice(0, 2)) * 60 + Number(times[i].slice(3));
      const delta = prayerMinute - local.minute;
      if (!OFFSETS.includes(delta)) continue;
      const prayer = PRAYERS[i];
      const checked = await env.DB.prepare('SELECT 1 FROM prayer_checkins WHERE uid=? AND local_day=? AND prayer=?').bind(user.uid, local.day, prayer).first();
      if (checked) continue;
      const eventKey = `${user.uid}:${local.day}:${i}:${delta}`;
      const now = new Date().toISOString();
      await env.DB.prepare(`INSERT OR IGNORE INTO sent_events(event_key, uid, local_day, prayer, minutes_before, state, attempts, next_attempt_at, created_at)
        VALUES(?, ?, ?, ?, ?, 'pending', 0, ?, ?)`)
        .bind(eventKey, user.uid, local.day, prayer, delta, now, now).run();
    }
  }
  const pending = await env.DB.prepare(`SELECT event_key, uid, local_day, prayer, minutes_before, attempts
    FROM sent_events WHERE state='pending' AND next_attempt_at <= ? ORDER BY created_at LIMIT 50`).bind(new Date().toISOString()).all();
  for (const event of pending.results) {
    const claimed = await env.DB.prepare(`UPDATE sent_events SET state='sending', attempts=attempts+1
      WHERE event_key=? AND state='pending' RETURNING event_key`).bind(event.event_key).first();
    if (!claimed) continue;
    try {
      const checked = await env.DB.prepare('SELECT 1 FROM prayer_checkins WHERE uid=? AND local_day=? AND prayer=?').bind(event.uid, event.local_day, event.prayer).first();
      if (!checked) await sendOneSignal(env, event);
      await env.DB.prepare("UPDATE sent_events SET state='sent' WHERE event_key=?").bind(event.event_key).run();
    } catch {
      const attempts = Number(event.attempts) + 1;
      if (attempts >= 4) {
        await env.DB.prepare("UPDATE sent_events SET state='failed' WHERE event_key=?").bind(event.event_key).run();
      } else {
        const retryAt = new Date(Date.now() + attempts * 60_000).toISOString();
        await env.DB.prepare("UPDATE sent_events SET state='pending', next_attempt_at=? WHERE event_key=?").bind(retryAt, event.event_key).run();
      }
    }
  }
  await env.DB.prepare("DELETE FROM prayer_checkins WHERE local_day < date('now', '-8 days')").run();
  await env.DB.prepare("DELETE FROM sent_events WHERE local_day < date('now', '-8 days') AND state!='pending'").run();
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    if (request.method === 'OPTIONS') return json({}, 204, origin);
    if (!ALLOWED_ORIGINS.has(origin)) return json({ error: 'Origin is not allowed.' }, 403);
    const url = new URL(request.url);
    try {
      if (request.method === 'POST' && url.pathname === '/api/profile') return await handleProfile(request, env, origin);
      if (request.method === 'POST' && url.pathname === '/api/check-in') return await handleCheckIn(request, env, origin);
      return json({ error: 'Not found.' }, 404, origin);
    } catch (error) {
      const status = /sign in|token|Firebase/i.test(error.message) ? 401 : 500;
      return json({ error: status === 401 ? error.message : 'The reminder service could not complete this request.' }, status, origin);
    }
  },
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduler(env));
  }
};
