// Supabase Edge Function: lights
// Switches the Hue lights through Alexa. The app calls this function, which
// fires a Voice Monkey Routine Trigger, which starts an Alexa routine that
// turns a Hue room on or off. Commands only: there is no way to read whether
// the lights are on.
//
// Secret required: VOICEMONKEY_TOKEN.
// Optional secrets, only if a trigger is recreated with a new device ID:
//   VM_LIVING_ROOM_ON, VM_BEDROOM_ON, VM_ALL_OFF
// Three commands because the Voice Monkey free plan allows three triggers.
//
// Request (POST JSON): { cmd: 'living-room-on' | 'bedroom-on' | 'all-off' }
// Response: { result: 'ok' | 'busy' | 'notset' | 'error', message? }
// Only the signed-in owner with MFA (aal2) can call it.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://shawkins-sys.github.io', 'http://localhost:8000'];
const VM_URL = 'https://api-v3.voicemonkey.io/trigger';
// App command to Voice Monkey trigger device ID (from Scott's console, 21/11/2026).
const DEVICES: Record<string, string> = {
  'living-room-on': 'living-room-on-pufsj',
  'bedroom-on': 'bedroom-light-on-7qbzb',
  'all-off': 'all-lights-off-sbhmr',
};

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

  const token = Deno.env.get('VOICEMONKEY_TOKEN') ?? '';
  if (!token) return json({ result: 'notset' });

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const cmd = String(body.cmd ?? '');
  if (!(cmd in DEVICES)) return json({ result: 'error', message: 'Unknown command' }, 400);

  // A secret can replace a device ID if a trigger is ever recreated.
  const envKey = `VM_${cmd.replace(/-/g, '_').toUpperCase()}`;
  const device = Deno.env.get(envKey) || DEVICES[cmd];

  try {
    const res = await fetch(VM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, device }),
    });
    const out: any = await res.json().catch(() => ({}));
    if (res.ok && out.success) return json({ result: 'ok' });
    console.warn('Voice Monkey failed', res.status, out.error);
    if (res.status === 429) return json({ result: 'busy' });
    if (res.status === 401 || res.status === 404) return json({ result: 'notset' });
    return json({ result: 'error' });
  } catch (e) {
    console.warn('Voice Monkey unreachable', e);
    return json({ result: 'error' });
  }
});
