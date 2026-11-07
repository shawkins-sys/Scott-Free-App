// Supabase Edge Function: calendar-feed
// Reads private iCal feeds (secret CALENDAR_FEEDS) and returns events for a
// date range as JSON. Handles recurring events, edits to single occurrences,
// deleted occurrences, all-day events and time zones.
//
// Secret CALENDAR_FEEDS is either a single feed URL, or a JSON list so more
// calendars can be added later:
//   [{"id":"personal","name":"Personal","url":"https://calendar.google.com/..."}]
//
// Request (POST JSON): { from: 'YYYY-MM-DD' (London date), days: 1 to 31 }
// Only the signed-in owner with MFA (aal2) can call it.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import ICAL from 'npm:ical.js@2.1.0';

const ALLOWED_ORIGINS = ['https://shawkins-sys.github.io', 'http://localhost:8000'];
const TZ = 'Europe/London';
const CACHE_MS = 15 * 60 * 1000;
const MAX_STEPS = 20000; // safety limit when expanding recurring events

type Feed = { id: string; name: string; url: string };
const feedCache = new Map<string, { at: number; text: string }>();

function corsFor(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function jwtClaims(jwt: string) {
  const part = jwt.split('.')[1] ?? '';
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  return JSON.parse(atob(b64));
}

function readFeeds(): Feed[] {
  const raw = (Deno.env.get('CALENDAR_FEEDS') ?? '').trim();
  if (!raw) return [];
  if (!raw.startsWith('[')) return [{ id: 'personal', name: 'Personal', url: raw }];
  return (JSON.parse(raw) as Feed[]).filter((f) => f && f.url);
}

async function fetchFeed(feed: Feed): Promise<string> {
  const hit = feedCache.get(feed.url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
  const res = await fetch(feed.url.replace(/^webcal:/i, 'https:'));
  if (!res.ok) {
    if (hit) return hit.text; // keep showing the last good copy
    throw new Error(`Feed ${feed.id} returned ${res.status}`);
  }
  const text = await res.text();
  feedCache.set(feed.url, { at: Date.now(), text });
  return text;
}

// Milliseconds offset of London from UTC at a given instant.
function londonOffset(ms: number) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// UTC milliseconds for 00:00 London on a YYYY-MM-DD date.
function londonMidnight(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  return guess - londonOffset(guess - londonOffset(guess));
}

function addDays(dateStr: string, n: number) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const dateOnly = (t: ICAL.Time) =>
  `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;

function text(comp: ICAL.Component, name: string) {
  const v = comp.getFirstPropertyValue(name);
  return v == null ? '' : String(v);
}

function expandFeed(feed: Feed, ics: string, from: string, to: string) {
  const root = new ICAL.Component(ICAL.parse(ics));
  for (const tz of root.getAllSubcomponents('vtimezone')) {
    try { ICAL.TimezoneService.register(tz); } catch { /* already registered */ }
  }
  const rangeStart = londonMidnight(from);
  const rangeEnd = londonMidnight(to);

  // Group by UID: the main event plus any edited single occurrences.
  const groups = new Map<string, { master?: ICAL.Component; exceptions: ICAL.Component[] }>();
  for (const v of root.getAllSubcomponents('vevent')) {
    const uid = text(v, 'uid') || crypto.randomUUID();
    const g = groups.get(uid) ?? { exceptions: [] };
    if (v.hasProperty('recurrence-id')) g.exceptions.push(v); else g.master = v;
    groups.set(uid, g);
  }

  const out: unknown[] = [];
  const push = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time | null) => {
    if (text(item.component, 'status').toUpperCase() === 'CANCELLED') return;
    const allDay = start.isDate;
    let s: string, e: string;
    if (allDay) {
      s = dateOnly(start);
      e = end ? dateOnly(end) : addDays(s, 1); // end date is exclusive
      if (!(s < to && e > from)) return;
    } else {
      const sMs = start.toJSDate().getTime();
      const eMs = end ? end.toJSDate().getTime() : sMs;
      if (!(sMs < rangeEnd && eMs > rangeStart)) return;
      s = new Date(sMs).toISOString();
      e = new Date(eMs).toISOString();
    }
    out.push({
      id: `${feed.id}:${item.uid}:${s}`,
      calendar: feed.id,
      calendarName: feed.name,
      title: item.summary || '(No title)',
      start: s,
      end: e,
      allDay,
      location: item.location || '',
      description: item.description || '',
    });
  };

  for (const g of groups.values()) {
    if (!g.master) {
      // Edited occurrence whose main event is missing: show it as it is.
      for (const x of g.exceptions) { const ev = new ICAL.Event(x); push(ev, ev.startDate, ev.endDate); }
      continue;
    }
    const event = new ICAL.Event(g.master);
    for (const x of g.exceptions) event.relateException(x);
    if (!event.isRecurring()) { push(event, event.startDate, event.endDate); continue; }

    const it = event.iterator();
    let next: ICAL.Time | null;
    let steps = 0;
    while ((next = it.next()) && steps++ < MAX_STEPS) {
      const occStartMs = next.isDate ? londonMidnight(dateOnly(next)) : next.toJSDate().getTime();
      if (occStartMs >= rangeEnd) break;
      const d = event.getOccurrenceDetails(next);
      push(d.item, d.startDate, d.endDate);
    }
  }
  return out;
}

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'Not signed in' }, 401);
  try { if (jwtClaims(jwt).aal !== 'aal2') return json({ error: 'MFA required' }, 403); }
  catch { return json({ error: 'Not signed in' }, 401); }

  let body: { from?: string; days?: number } = {};
  try { body = await req.json(); } catch { /* use defaults */ }
  const from = /^\d{4}-\d{2}-\d{2}$/.test(body.from ?? '') ? body.from! : new Date().toISOString().slice(0, 10);
  const days = Math.min(31, Math.max(1, Number(body.days) || 8));
  const to = addDays(from, days);

  let feeds: Feed[];
  try { feeds = readFeeds(); } catch { return json({ error: 'CALENDAR_FEEDS is not valid JSON' }, 500); }
  if (!feeds.length) return json({ configured: false, events: [] });

  const events: any[] = [];
  const failed: string[] = [];
  await Promise.all(feeds.map(async (f) => {
    try { events.push(...expandFeed(f, await fetchFeed(f), from, to)); }
    catch (err) { console.error('Calendar feed failed', f.id, err); failed.push(f.id); }
  }));
  events.sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));
  return json({ configured: true, from, to, events, failed });
});
