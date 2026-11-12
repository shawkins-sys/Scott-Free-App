// Supabase Edge Function: spotify
// Holds the Spotify tokens server-side (table spotify_auth, service role only)
// and makes all Spotify calls. Authorization Code with PKCE, so no client
// secret is needed. Secret required: SPOTIFY_CLIENT_ID.
//
// Actions (POST JSON):
//   { action: 'connect', code, verifier, redirectUri }
//   { action: 'status' }
//   { action: 'devices' }
//   { action: 'play', playlistUri, target: 'speaker' | 'phone', speakerId, speakerName }
//   { action: 'disconnect' }
//
// Responses never contain raw Spotify errors. `result` tells the app what to do:
//   'playing' | 'open' (open the playlist in the Spotify app) | 'reconnect' | 'error'
// Only the signed-in owner with MFA (aal2) can call it.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://shawkins-sys.github.io', 'http://localhost:8000'];
const API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPEAKER_VOLUME = 30;
const AUTH_LIFETIME_DAYS = 182; // refresh tokens expire six months after authorisation
const WARN_DAYS = 14;

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
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
  const userId = userData.user.id;

  const clientId = Deno.env.get('SPOTIFY_CLIENT_ID') ?? '';
  if (!clientId) return json({ result: 'error', message: 'Spotify is not set up yet' });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }

  const loadRow = async () => {
    const { data } = await admin.from('spotify_auth').select('*').eq('user_id', userId).maybeSingle();
    return data;
  };
  const saveRow = (fields: Record<string, unknown>) =>
    admin.from('spotify_auth').upsert({ user_id: userId, ...fields, updated_at: new Date().toISOString() });

  // Returns a valid access token, refreshing if needed, or null if Spotify must be reconnected.
  async function accessToken(): Promise<string | null> {
    const row = await loadRow();
    if (!row?.refresh_token) return null;
    if (row.access_token && row.access_expires_at && new Date(row.access_expires_at).getTime() - Date.now() > 60_000) {
      return row.access_token;
    }
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: row.refresh_token, client_id: clientId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('Spotify refresh failed', res.status, err?.error);
      if (err?.error === 'invalid_grant') await saveRow({ refresh_token: null, access_token: null, access_expires_at: null });
      return null;
    }
    const t = await res.json();
    await saveRow({
      access_token: t.access_token,
      access_expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
      ...(t.refresh_token ? { refresh_token: t.refresh_token } : {}),
    });
    return t.access_token;
  }

  async function api(token: string, path: string, init: RequestInit = {}) {
    return fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  }

  async function devices(token: string) {
    const res = await api(token, '/me/player/devices');
    if (!res.ok) return [];
    const d = await res.json();
    return (d.devices ?? []).map((x: any) => ({
      id: x.id, name: x.name, type: x.type, active: x.is_active, restricted: x.is_restricted, volume: x.supports_volume,
    }));
  }

  try {
    if (body.action === 'connect') {
      const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code', code: String(body.code ?? ''), redirect_uri: String(body.redirectUri ?? ''),
          client_id: clientId, code_verifier: String(body.verifier ?? ''),
        }),
      });
      if (!res.ok) {
        console.error('Spotify connect failed', res.status, await res.text());
        return json({ result: 'error', message: 'Spotify did not accept the connection. Please try again.' });
      }
      const t = await res.json();
      await saveRow({
        refresh_token: t.refresh_token, access_token: t.access_token,
        access_expires_at: new Date(Date.now() + (t.expires_in ?? 3600) * 1000).toISOString(),
        authorised_at: new Date().toISOString(),
      });
      return json({ result: 'connected' });
    }

    if (body.action === 'status') {
      const row = await loadRow();
      if (!row?.authorised_at) return json({ connected: false });
      const expiresAt = new Date(new Date(row.authorised_at).getTime() + AUTH_LIFETIME_DAYS * 86400000);
      const daysLeft = Math.floor((expiresAt.getTime() - Date.now()) / 86400000);
      return json({
        connected: !!row.refresh_token && daysLeft > 0,
        expired: !row.refresh_token || daysLeft <= 0,
        authorisedAt: row.authorised_at,
        expiresAt: expiresAt.toISOString(),
        reconnectSoon: !!row.refresh_token && daysLeft > 0 && daysLeft <= WARN_DAYS,
      });
    }

    if (body.action === 'disconnect') {
      await admin.from('spotify_auth').delete().eq('user_id', userId);
      return json({ result: 'disconnected' });
    }

    const token = await accessToken();
    if (!token) return json({ result: 'reconnect' });

    if (body.action === 'devices') return json({ result: 'ok', devices: await devices(token) });

    if (body.action === 'play') {
      const uri = String(body.playlistUri ?? '');
      if (!/^spotify:playlist:[A-Za-z0-9]+$/.test(uri)) return json({ result: 'error', message: 'Not a playlist' });
      const list = await devices(token);
      let target = body.target === 'speaker' ? 'speaker' : 'phone';
      let device = null as any;
      if (target === 'speaker') {
        device = list.find((d: any) => d.id === body.speakerId) ?? list.find((d: any) => body.speakerName && d.name === body.speakerName);
        if (!device) target = 'phone'; // speaker not available: fall back to the phone
      }
      if (target === 'phone') {
        const phones = list.filter((d: any) => d.type === 'Smartphone' && !d.restricted);
        device = phones.find((d: any) => d.active) ?? phones[0];
        if (!device) return json({ result: 'open', fellBack: body.target === 'speaker' });
      }

      // Make the device active without playing, set shuffle and (speaker only) volume, then play.
      await api(token, '/me/player', { method: 'PUT', body: JSON.stringify({ device_ids: [device.id], play: false }) });
      await sleep(600);
      await api(token, `/me/player/shuffle?state=true&device_id=${encodeURIComponent(device.id)}`, { method: 'PUT' });
      if (target === 'speaker' && device.volume !== false) {
        await api(token, `/me/player/volume?volume_percent=${SPEAKER_VOLUME}&device_id=${encodeURIComponent(device.id)}`, { method: 'PUT' });
      }
      const play = await api(token, `/me/player/play?device_id=${encodeURIComponent(device.id)}`, {
        method: 'PUT', body: JSON.stringify({ context_uri: uri }),
      });
      if (!play.ok) {
        console.error('Spotify play failed', play.status, await play.text());
        return json({ result: 'open', fellBack: true });
      }
      // Shuffle again once the playlist is the active context, in case the first call was ignored.
      await api(token, `/me/player/shuffle?state=true&device_id=${encodeURIComponent(device.id)}`, { method: 'PUT' });
      return json({ result: 'playing', target, deviceName: device.name, fellBack: body.target === 'speaker' && target === 'phone' });
    }

    return json({ result: 'error', message: 'Unknown action' }, 400);
  } catch (err) {
    console.error('Spotify function error', err);
    return json({ result: 'error' });
  }
});
