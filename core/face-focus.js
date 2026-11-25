// Finds faces in a photo on the device (pico.js, vendor/pico.js) and returns
// the point to centre the crop on, or null when no face is found.
// Loaded only when a photo without a saved focus point is shown.
import pico from '../vendor/pico.js';

const MAX_SIDE = 480;   // photo is scanned at this size (fast, still finds faces)
const MIN_SCORE = 20;   // detections below this are ignored (fewer false faces)
let classify = null;

async function cascade() {
  if (classify) return classify;
  const res = await fetch(new URL('../assets/face/facefinder', import.meta.url));
  if (!res.ok) throw new Error(`Face data not loaded (${res.status})`);
  classify = pico.unpack_cascade(new Int8Array(await res.arrayBuffer()));
  return classify;
}

// img: a loaded <img> (or ImageBitmap) with naturalWidth/naturalHeight.
export async function findFocus(img) {
  const fn = await cascade();
  const iw = img.naturalWidth || img.width; const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return null;
  const k = Math.min(1, MAX_SIDE / Math.max(iw, ih));
  const w = Math.round(iw * k); const h = Math.round(ih * k);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < gray.length; i++, j += 4) {
    gray[i] = (2 * rgba[j] + 7 * rgba[j + 1] + rgba[j + 2]) / 10;
  }
  const image = { pixels: gray, nrows: h, ncols: w, ldim: w };
  const params = { shiftfactor: 0.1, minsize: Math.max(20, Math.round(Math.min(w, h) * 0.06)), maxsize: Math.max(w, h), scalefactor: 1.1 };
  let dets = pico.run_cascade(image, fn, params);
  dets = pico.cluster_detections(dets, 0.2).filter((d) => d[3] > MIN_SCORE);
  if (!dets.length) return null;

  // Several faces: centre on the group, weighted towards the bigger (nearer) ones.
  let sx = 0; let sy = 0; let sw = 0; let top = h;
  for (const [r, c, s] of dets) { sx += c * s; sy += r * s; sw += s; top = Math.min(top, r - s / 2); }
  const cx = sx / sw / w;
  // Aim a little below the face centre so the head is not jammed at the top edge,
  // but never so low that the top face is cut.
  const cy = Math.min(sy / sw / h + 0.05, (top / h) + 0.3);
  return { x: cx, y: cy, faces: dets.length };
}
