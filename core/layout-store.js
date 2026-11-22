// Saves and loads tile layouts, one per device type ('phone', 'desktop' or 'wall').
// Supabase is the source of truth. Local storage is a fast offline cache.
import { supabase } from './supabase.js';

const key = (device) => `sf.layout.${device}`;

// Local copy is { items, at } (at = time of the change, ms). Older copies
// were a bare array and count as oldest.
function readLocal(device) {
  try {
    const raw = JSON.parse(localStorage.getItem(key(device)));
    if (!raw) return null;
    return Array.isArray(raw) ? { items: raw, at: 0 } : raw;
  } catch {
    return null;
  }
}

function writeLocal(device, items, at) {
  try { localStorage.setItem(key(device), JSON.stringify({ items, at })); } catch { /* ignore */ }
}

async function pushLayout(device, items, at) {
  const { error } = await supabase
    .from('layouts')
    .upsert({ device, items, updated_at: new Date(at).toISOString() }, { onConflict: 'user_id,device' });
  if (error) console.warn('Layout not saved to Supabase, kept on this device', error.message);
  return !error;
}

// Newest copy wins. If this device has a newer change that never reached
// Supabase (for example the app was closed mid-save), it is used and sent again.
export async function loadLayout(device) {
  const local = readLocal(device);
  if (supabase) {
    const { data, error } = await supabase
      .from('layouts').select('items, updated_at').eq('device', device).maybeSingle();
    if (!error) {
      const serverAt = data && data.updated_at ? Date.parse(data.updated_at) : 0;
      if (local && local.at > serverAt) {
        pushLayout(device, local.items, local.at);
        return local.items;
      }
      if (data) writeLocal(device, data.items, serverAt);
      return data ? data.items : (local && local.items);
    }
  }
  return local && local.items;
}

export async function saveLayout(device, items) {
  const at = Date.now();
  writeLocal(device, items, at);
  if (!supabase) return;
  await pushLayout(device, items, at);
}
