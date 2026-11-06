// Supabase Edge Function: photos-import
// Copies photos chosen in the Google Photos Picker into the private
// `photos` bucket, resized to fit 2048px. This runs server-side because
// Google's photo links cannot be downloaded by the browser (no CORS).
//
// Actions (POST JSON):
//   { action: 'import', googleToken, items: [{ id, baseUrl }] }  (up to 5 items)
//   { action: 'remove', names: ['file.jpg', ...] }
//
// Only the signed-in owner with MFA (aal2) can call it.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ['https://shawkins-sys.github.io', 'http://localhost:8000'];
const BUCKET = 'photos';
const MAX_ITEMS = 5;
const SIZE = 2048;

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

const safeId = (id: string) => String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 120);
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

Deno.serve(async (req) => {
  const cors = corsFor(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // Check the caller is signed in with MFA.
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  if (userErr || !userData?.user) return json({ error: 'Not signed in' }, 401);
  try {
    if (jwtClaims(jwt).aal !== 'aal2') return json({ error: 'MFA required' }, 403);
  } catch {
    return json({ error: 'Not signed in' }, 401);
  }

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Bad request' }, 400); }

  if (body.action === 'remove') {
    const names: string[] = Array.isArray(body.names) ? body.names.map(String) : [];
    if (!names.length) return json({ removed: 0 });
    const { error } = await admin.storage.from(BUCKET).remove(names);
    if (error) return json({ error: 'Could not remove old photos' }, 500);
    return json({ removed: names.length });
  }

  if (body.action === 'import') {
    const token = String(body.googleToken ?? '');
    const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
    if (!token || !items.length) return json({ error: 'Bad request' }, 400);

    const saved: string[] = [];
    const failed: string[] = [];
    for (const item of items) {
      try {
        const url = new URL(String(item.baseUrl));
        // Only ever send the Google token to Google's own photo host.
        if (url.protocol !== 'https:' || !url.hostname.endsWith('.googleusercontent.com')) throw new Error('Bad host');
        const res = await fetch(`${url.href}=w${SIZE}-h${SIZE}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Google ${res.status}`);
        const type = (res.headers.get('Content-Type') ?? 'image/jpeg').split(';')[0];
        const name = `gp-${safeId(item.id)}.${EXT[type] ?? 'jpg'}`;
        const bytes = new Uint8Array(await res.arrayBuffer());
        const { error } = await admin.storage.from(BUCKET).upload(name, bytes, { contentType: type, upsert: true });
        if (error) throw error;
        saved.push(name);
      } catch (err) {
        console.error('Photo import failed', item?.id, err);
        failed.push(String(item?.id ?? ''));
      }
    }
    return json({ saved, failed });
  }

  return json({ error: 'Unknown action' }, 400);
});
