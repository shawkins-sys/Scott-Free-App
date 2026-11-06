// Saves and loads tile layouts, one per device type ('phone' or 'desktop').
// Supabase is the source of truth. Local storage is a fast offline cache.
import { supabase } from './supabase.js';

const key = (device) => `sf.layout.${device}`;

function readLocal(device) {
  try {
    const raw = localStorage.getItem(key(device));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeLocal(device, items) {
  try { localStorage.setItem(key(device), JSON.stringify(items)); } catch { /* ignore */ }
}

export async function loadLayout(device) {
  if (supabase) {
    const { data, error } = await supabase
      .from('layouts').select('items').eq('device', device).maybeSingle();
    if (!error) {
      if (data) writeLocal(device, data.items);
      return data ? data.items : readLocal(device);
    }
  }
  return readLocal(device);
}

export async function saveLayout(device, items) {
  writeLocal(device, items);
  if (!supabase) return;
  const { error } = await supabase
    .from('layouts')
    .upsert({ device, items, updated_at: new Date().toISOString() }, { onConflict: 'user_id,device' });
  if (error) console.warn('Layout not saved to Supabase, kept on this device', error.message);
}
