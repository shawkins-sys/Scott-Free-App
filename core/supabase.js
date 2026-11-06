// Shared Supabase client. Sessions persist on the device and refresh
// automatically, so a trusted device stays signed in.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.0/+esm';
import { CONFIG } from '../config.js';

export const supabase = CONFIG.supabaseUrl && CONFIG.supabaseAnonKey
  ? createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey, {
      // detectSessionInUrl off: sign-in is password + authenticator only, and the
      // Google Photos sign-in returns its own #access_token, which must not be
      // mistaken for a Supabase session.
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'sf-auth', detectSessionInUrl: false },
    })
  : null;

export async function currentUserId() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session ? data.session.user.id : null;
}
