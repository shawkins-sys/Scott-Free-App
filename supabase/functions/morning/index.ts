// Supabase Edge Function: morning
// Everything the Morning page needs in one call:
// - Football (football-data.org free tier): the followed team's last result,
//   next fixture and league position, the latest Premier League results and
//   the table. Cached 3 hours (the free tier allows 10 calls a minute).
// - News from RSS feeds: Man Utd and FPL daily (1 each), plus one rotating
//   topic a day (3 stories from the past week). Heavy stories filtered out.
// - One good thing: one story from a positive news feed. Cached 30 minutes.
// - On this day: one event from Wikipedia's "On this day" feed. Cached per day.
// Each part can fail on its own; the page shows what it has.
//
// Secret required: FOOTBALL_DATA_TOKEN (free token from football-data.org).
// Request (POST JSON): { topics?: string[] }   Response: { football, news, good, onThisDay, builtAt }
// Only the signed-in owner with MFA (aal2) can call it.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://shawkins-sys.github.io', 'http://localhost:8000'];
const TEAM_ID = 66; // Manchester United on football-data.org
const UA = 'Mozilla/5.0 (compatible; ScottHub/1.0; personal app; +https://shawkins-sys.github.io/Scott-Free-App/)';

// Topics (Scott, 24/11/2026). Man Utd and FPL show every day (1 club story,
// 1 FPL story). The ROTATION topics take turns, one a day, each showing its 3
// best stories from the past week. `drop` removes stories off his focus.
export const TOPICS: Record<string, { title: string; feeds: string[]; drop?: RegExp }> = {
  utd: {
    title: 'Man Utd',
    feeds: [
      'https://feeds.bbci.co.uk/sport/football/teams/manchester-united/rss.xml',
      'https://www.theguardian.com/football/manchester-united/rss',
    ],
  },
  fpl: { title: 'FPL', feeds: ['https://www.fantasyfootballscout.co.uk/feed/'] },
  tech: {
    title: 'Phones and new tech',
    feeds: ['https://www.gsmarena.com/rss-news-reviews.php3', 'https://www.androidauthority.com/feed/'],
    drop: /\b(deal|deals|discount|sale|coupon|save \$|lawsuit|layoffs?)\b/i,
  },
  ps: {
    title: 'PlayStation',
    feeds: ['https://blog.playstation.com/feed/', 'https://www.pushsquare.com/feeds/latest'],
  },
  fish: {
    title: 'Fishkeeping',
    feeds: ['https://www.practicalfishkeeping.co.uk/feed/', 'https://www.thegreenmachineonline.com/feed/'],
    drop: /\b(marine|reef|reefs|coral|corals|saltwater|clownfish|anemone|seahorse|pond|koi)\b/i,
  },
  local: {
    title: 'Cheltenham',
    feeds: ['https://feeds.bbci.co.uk/news/england/gloucestershire/rss.xml', 'https://www.soglos.com/feeds/latest'],
  },
};
export const ROTATION = ['tech', 'ps', 'fish', 'local'];
const WEEK = 7 * 86400000;

// Which rotating topic shows on a London day (and the next one), from the
// topics Scott has switched on. Day 0 is 24/11/2026.
export function rotationFor(enabled: string[], date = new Date()) {
  const list = ROTATION.filter((t) => enabled.includes(t));
  if (!list.length) return { today: null, tomorrow: null };
  const london = new Date(date.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const day = Math.floor((Date.UTC(london.getFullYear(), london.getMonth(), london.getDate()) - Date.UTC(2026, 10, 24)) / 86400000);
  const i = ((day % list.length) + list.length) % list.length;
  return { today: list[i], tomorrow: list.length > 1 ? list[(i + 1) % list.length] : null };
}

const GOOD_FEEDS = [
  'https://www.positive.news/feed/',
  'https://www.goodnewsnetwork.org/feed/',
  'https://reasonstobecheerful.world/feed/',
];

// Headlines containing any of these are left out (Scott: keep it calm).
const HEAVY = /\b(holocaust|nazi\w*|genocide|exterminat\w*|ghetto\w*|concentration camp|pogrom\w*|execut(?:ed|ion\w*)|hanged|beheaded|assassinat\w*|slaughter\w*|famine|plague|epidemic|pandemic|invasion|invade\w*|battle\w*|bombing|bomber\w*|blitz|earthquake|tsunami|hurricane|disaster\w*|sank|sinking|shipwreck|riot\w*|lynch\w*|slave\w*|slavery|dies|died|dead|death|deaths|killed|kills|killing|murder\w*|war|wars|attack\w*|crash\w*|shooting|stabb\w*|terror\w*|abuse\w*|assault\w*|suicide|bomb\w*|missile\w*|hostage\w*|rape\w*|massacre|tragedy|tragic|victim\w*|injur\w*|fatal\w*)\b/i;

const MIN = 60 * 1000;
const cache = new Map<string, { at: number; data: unknown }>();
async function cached<T>(key: string, maxAge: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < maxAge) return hit.data as T;
  try {
    const data = await fn();
    cache.set(key, { at: Date.now(), data });
    return data;
  } catch (err) {
    if (hit) return hit.data as T; // keep showing the last good copy
    throw err;
  }
}

// ---------- RSS ----------
function decode(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
const tag = (item: string, name: string) => {
  const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? decode(m[1]) : '';
};

export interface Story { title: string; url: string; source: string; at: number; summary?: string; image?: string }

// A small picture for the story: media:thumbnail (BBC), the media:content
// closest above 200px wide (The Guardian), an image enclosure, or the first <img>
// in the content. Only https images are used.
export function storyImage(item: string): string {
  const attr = (el: string, name: string) => (el.match(new RegExp(`${name}="([^"]+)"`, 'i')) || [])[1] || '';
  const clean = (u: string) => u.replace(/&amp;/g, '&');
  const thumb = item.match(/<media:thumbnail[^>]*>/i);
  if (thumb && attr(thumb[0], 'url')) return clean(attr(thumb[0], 'url'));
  const contents = (item.match(/<media:content[^>]*>/gi) || [])
    .map((el) => ({ url: attr(el, 'url'), w: Number(attr(el, 'width')) || 0, medium: attr(el, 'medium'), type: attr(el, 'type') }))
    .filter((c) => c.url && (c.medium === 'image' || /^image\//.test(c.type) || /\.(jpe?g|png|webp)(\?|$)/i.test(c.url) || c.w));
  if (contents.length) {
    // Smallest picture at least 200px wide (sharp on a phone), else the largest.
    const big = contents.filter((c) => (c.w || 600) >= 200).sort((a, b) => (a.w || 600) - (b.w || 600));
    return clean((big[0] || contents.sort((a, b) => b.w - a.w)[0]).url);
  }
  const enc = item.match(/<enclosure[^>]*type="image\/[^"]*"[^>]*>/i);
  if (enc && attr(enc[0], 'url')) return clean(attr(enc[0], 'url'));
  const img = item.match(/<img[^>]+src="([^"]+)"/i) || item.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').match(/<img[^>]+src="([^"]+)"/i);
  return img ? clean(img[1]) : '';
}

export function parseRss(xml: string, fallbackSource = ''): Story[] {
  const source = decode((xml.match(/<channel>[\s\S]*?<title>([\s\S]*?)<\/title>/i) || [])[1] || fallbackSource)
    .replace(/^BBC News - /, 'BBC ').replace(/^BBC Sport - /, 'BBC Sport ').replace(/ \| The Guardian$/, '');
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];
  return items.map((it) => ({
    title: tag(it, 'title'),
    url: tag(it, 'link') || (it.match(/<guid[^>]*>(https?:[^<]+)<\/guid>/i) || [])[1] || '',
    source,
    at: Date.parse(tag(it, 'pubDate') || tag(it, 'dc:date')) || 0,
    summary: tag(it, 'description').slice(0, 220),
    image: storyImage(it),
  })).map((st) => (/^https:/.test(st.image || '') ? st : { ...st, image: '' })).filter((s) => s.title && /^https?:/.test(s.url));
}

// Newest first, heavy stories and near-duplicate titles removed.
export function pickStories(lists: Story[][], max = 5, opts: { drop?: RegExp; within?: number } = {}): Story[] {
  const seen = new Set<string>();
  const key = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').slice(0, 6).join(' ');
  const now = Date.now();
  const all = lists.flat()
    .filter((s) => !HEAVY.test(s.title) && !(opts.drop && opts.drop.test(`${s.title} ${s.summary || ''}`)))
    .sort((a, b) => b.at - a.at);
  // Stories from the period first; older ones only fill any gap.
  const recent = opts.within ? all.filter((s) => now - s.at <= opts.within!) : all;
  const older = opts.within ? all.filter((s) => now - s.at > opts.within!) : [];
  return [...recent, ...older]
    .filter((s) => { const k = key(s.title); if (seen.has(k)) return false; seen.add(k); return true; })
    .slice(0, max)
    .map(({ summary: _s, ...rest }) => rest);
}

async function fetchFeed(url: string): Promise<Story[]> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/rss+xml, application/xml, text/xml' } });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  const host = new URL(url).hostname;
  const NAMES: [string, string][] = [
    ['bbc', 'BBC'], ['theguardian', 'The Guardian'], ['positive.news', 'Positive News'],
    ['goodnewsnetwork', 'Good News Network'], ['reasonstobecheerful', 'Reasons to be Cheerful'],
    ['fantasyfootballscout', 'Fantasy Football Scout'], ['gsmarena', 'GSMArena'],
    ['androidauthority', 'Android Authority'], ['playstation', 'PlayStation Blog'], ['pushsquare', 'Push Square'],
    ['practicalfishkeeping', 'Practical Fishkeeping'], ['thegreenmachine', 'The Green Machine'], ['soglos', 'SoGlos'],
  ];
  const label = (NAMES.find(([k]) => host.includes(k)) || [])[1] || host.replace(/^www\./, '');
  return parseRss(await res.text(), label).map((st) => ({ ...st, source: label }));
}

async function topicStories(id: string, max: number, within?: number) {
  const t = TOPICS[id];
  const lists = await Promise.all(t.feeds.map((u) => fetchFeed(u).catch(() => [] as Story[])));
  if (!lists.some((l) => l.length)) throw new Error(`No feed for ${id}`);
  return pickStories(lists, max, { drop: t.drop, within });
}

async function goodThing() {
  const lists = await Promise.all(GOOD_FEEDS.map((u) => fetchFeed(u).catch(() => [] as Story[])));
  const all = lists.flat().filter((s) => !HEAVY.test(s.title)).sort((a, b) => b.at - a.at);
  if (!all.length) throw new Error('No good news feed');
  // One story per day, the same all day.
  const day = Math.floor(Date.now() / 86400000);
  const s = all[day % Math.min(all.length, 5)];
  return { title: s.title, url: s.url, source: s.source, summary: s.summary || '', image: s.image || '' };
}

// ---------- On this day ----------
async function onThisDay() {
  const now = new Date();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const res = await fetch(`https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/${mm}/${dd}`,
    { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Wikipedia ${res.status}`);
  const data = await res.json();
  const calm = (data.selected || []).filter((e: { text: string }) => !HEAVY.test(e.text));
  const list = calm.length ? calm : data.selected || [];
  if (!list.length) throw new Error('Nothing on this day');
  const e = list[Number(dd) % list.length];
  const page = (e.pages || [])[0];
  return { year: e.year, text: e.text, url: page?.content_urls?.mobile?.page || page?.content_urls?.desktop?.page || '' };
}

// ---------- Football ----------
interface FdTeam { id: number; name: string; shortName?: string; tla?: string; crest?: string }
interface FdMatch {
  utcDate: string; status: string; matchday?: number;
  homeTeam: FdTeam; awayTeam: FdTeam;
  score: { fullTime: { home: number | null; away: number | null } };
}
const short = (t: FdTeam) => (t.shortName || t.name || '').replace(/ FC$/, '');
const slim = (m: FdMatch) => ({
  at: m.utcDate, status: m.status,
  home: short(m.homeTeam), away: short(m.awayTeam), homeId: m.homeTeam.id, awayId: m.awayTeam.id,
  homeGoals: m.score?.fullTime?.home ?? null, awayGoals: m.score?.fullTime?.away ?? null,
});

async function fd(path: string, token: string) {
  const res = await fetch(`https://api.football-data.org/v4${path}`, { headers: { 'X-Auth-Token': token } });
  if (res.status === 403 || res.status === 400) throw new Error(`notset ${res.status}`);
  if (!res.ok) throw new Error(`football-data ${res.status}`);
  return res.json();
}

export async function football(token: string) {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const from = new Date(today.getTime() - 10 * 86400000);
  const to = new Date(today.getTime() + 21 * 86400000);
  // Three calls: league matches around today, the table, and the team's own
  // matches (covers cups for the next fixture).
  const [league, standings, team] = await Promise.all([
    fd(`/competitions/PL/matches?dateFrom=${iso(from)}&dateTo=${iso(to)}`, token),
    fd('/competitions/PL/standings', token),
    fd(`/teams/${TEAM_ID}/matches?dateFrom=${iso(from)}&dateTo=${iso(to)}`, token),
  ]);

  const finished = (league.matches as FdMatch[]).filter((m) => m.status === 'FINISHED');
  const lastMatchday = Math.max(0, ...finished.map((m) => m.matchday || 0));
  const results = finished.filter((m) => m.matchday === lastMatchday)
    .sort((a, b) => a.utcDate.localeCompare(b.utcDate)).map(slim);

  const teamMatches = (team.matches as FdMatch[]).map((m) => ({ ...slim(m), competition: (m as unknown as { competition?: { name?: string } }).competition?.name || '' }));
  const last = teamMatches.filter((m) => m.status === 'FINISHED').sort((a, b) => b.at.localeCompare(a.at))[0] || null;
  const next = teamMatches.filter((m) => ['SCHEDULED', 'TIMED'].includes(m.status)).sort((a, b) => a.at.localeCompare(b.at))[0] || null;

  const table = ((standings.standings || []).find((s: { type: string }) => s.type === 'TOTAL')?.table || [])
    .map((r: { position: number; team: FdTeam; playedGames: number; points: number; goalDifference: number }) =>
      ({ pos: r.position, team: short(r.team), id: r.team.id, played: r.playedGames, gd: r.goalDifference, pts: r.points }));
  const mine = table.find((r: { id: number }) => r.id === TEAM_ID) || null;

  return { teamId: TEAM_ID, teamName: 'Man Utd', last, next, position: mine, matchday: lastMatchday, results, table };
}

// ---------- Server ----------
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

const settle = async <T>(p: Promise<T>) => {
  try { return { ok: true as const, data: await p }; }
  catch (err) { console.warn(String(err)); return { ok: false as const, error: String(err).startsWith('Error: notset') ? 'notset' : 'error' }; }
};

if (import.meta.main) Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ result: 'error' }, 405);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ result: 'error', message: 'Not signed in' }, 401);
  try { if (jwtClaims(jwt).aal !== 'aal2') return json({ result: 'error', message: 'MFA required' }, 403); }
  catch { return json({ result: 'error' }, 401); }

  const token = Deno.env.get('FOOTBALL_DATA_TOKEN') ?? '';
  const dayKey = new Date().toISOString().slice(0, 10);
  // Topics switched on in Settings (sent by the app); all if not sent.
  let body: { topics?: string[] } = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const enabled = Array.isArray(body.topics) ? body.topics.filter((t) => t in TOPICS) : Object.keys(TOPICS);
  const rot = rotationFor(enabled);

  const [foot, club, fpl, todayTopic, good, otd] = await Promise.all([
    token ? settle(cached('football', 180 * MIN, () => football(token))) : Promise.resolve({ ok: false as const, error: 'notset' }),
    enabled.includes('utd') ? settle(cached('news-utd', 30 * MIN, () => topicStories('utd', 1))) : Promise.resolve(null),
    enabled.includes('utd') ? settle(cached('news-fpl', 30 * MIN, () => topicStories('fpl', 1))) : Promise.resolve(null),
    rot.today ? settle(cached(`news-${rot.today}`, 60 * MIN, () => topicStories(rot.today!, 3, WEEK))) : Promise.resolve(null),
    settle(cached('good', 30 * MIN, goodThing)),
    settle(cached(`otd-${dayKey}`, 24 * 60 * MIN, onThisDay)),
  ]);

  const news = [];
  if (club || fpl) {
    news.push({ id: 'utd', title: 'Man Utd and FPL',
      stories: [...(club && club.ok ? club.data : []), ...(fpl && fpl.ok ? fpl.data : [])] });
  }
  if (rot.today && todayTopic) {
    news.push({ id: rot.today, title: TOPICS[rot.today].title, rotating: true,
      next: rot.tomorrow ? TOPICS[rot.tomorrow].title : null,
      stories: todayTopic.ok ? todayTopic.data : [] });
  }

  return json({
    result: 'ok',
    builtAt: new Date().toISOString(),
    football: foot.ok ? foot.data : { error: foot.error },
    news,
    good: good.ok ? good.data : null,
    onThisDay: otd.ok ? otd.data : null,
  });
});
