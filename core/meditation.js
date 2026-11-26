// Meditation and grounding (Wellbeing page, Scott 26/11/2026).
// Three guided exercises in a full-screen overlay styled like Box breathing:
// - 5-4-3-2-1 senses: tap Next to move on (go at your own pace).
// - Body scan and Muscle release: timed steps that move on by themselves,
//   with a ring showing time left, Pause and Skip.
// Uses the breathing vibration setting at each step change, and plays a soft
// chime at the end (Settings, Breathing: "Soft chime at the end", default on).
// The screen is kept on, and timed exercises pause when the app is hidden.
import { getBreathingSettings, holdScreenOn } from './breathing.js';

export const EXERCISES = [
  {
    id: 'senses',
    title: '5-4-3-2-1 senses',
    blurb: 'Grounding through what is around you. Go at your own pace.',
    length: 'About 2 min',
    mode: 'tap',
    steps: [
      { title: 'Get settled', text: 'Wherever you are, pause. Take one slow breath in and out.' },
      { count: 5, title: 'Things you can see', text: 'Look around slowly. Name each one in your head.' },
      { count: 4, title: 'Things you can feel', text: 'Your feet on the floor, the seat under you, the air on your skin.' },
      { count: 3, title: 'Things you can hear', text: 'Near or far. Let each sound come and go.' },
      { count: 2, title: 'Things you can smell', text: 'If nothing comes, think of two smells you like.' },
      { count: 1, title: 'Thing you can taste', text: 'Or one thing you are grateful for today.' },
      { title: 'Back to now', text: 'One more slow breath. Notice how you feel.' },
    ],
  },
  {
    id: 'bodyscan',
    title: 'Body scan',
    blurb: 'Move your attention slowly from your feet to your head.',
    length: 'About 4 min',
    mode: 'timed',
    steps: [
      { title: 'Get comfortable', text: 'Sit or lie down. Let your eyes close or soften.', secs: 20 },
      { title: 'Your breath', text: 'Notice your breathing. No need to change it.', secs: 20 },
      { title: 'Feet and toes', text: 'Notice any warmth, pressure or tingling. Let them soften.', secs: 25 },
      { title: 'Legs', text: 'Calves, knees, thighs. Let them feel heavy.', secs: 25 },
      { title: 'Hips and lower back', text: 'Notice where you are supported. Let go a little more.', secs: 25 },
      { title: 'Stomach and chest', text: 'Feel them rise and fall with each breath.', secs: 25 },
      { title: 'Hands and arms', text: 'Fingers, palms, wrists, up to the elbows and shoulders.', secs: 25 },
      { title: 'Shoulders and neck', text: 'Let your shoulders drop away from your ears.', secs: 25 },
      { title: 'Face and jaw', text: 'Unclench your jaw. Soften your forehead and eyes.', secs: 25 },
      { title: 'Whole body', text: 'Feel your whole body at once, breathing and at rest.', secs: 25 },
    ],
  },
  {
    id: 'muscle',
    title: 'Muscle release',
    blurb: 'Tense each muscle group for a few seconds, then let it go.',
    length: 'About 4 min',
    mode: 'timed',
    steps: [
      { title: 'Get comfortable', text: 'Sit or lie down. Breathe slowly. Tense gently, never to the point of pain.', secs: 15 },
      ...[
        ['Hands', 'Make tight fists.'],
        ['Arms', 'Bend your elbows and tighten your upper arms.'],
        ['Shoulders', 'Lift your shoulders up towards your ears.'],
        ['Face', 'Scrunch your eyes and press your lips together.'],
        ['Stomach', 'Pull your stomach in tight.'],
        ['Legs', 'Press your knees together and tighten your thighs.'],
        ['Feet', 'Curl your toes down.'],
      ].flatMap(([part, how]) => [
        { title: `${part}: tense`, text: `${how} Hold it.`, secs: 5, tense: true },
        { title: `${part}: release`, text: 'Let go all at once. Notice the difference.', secs: 20 },
      ]),
      { title: 'Whole body', text: 'Let your whole body feel loose and heavy. Breathe slowly.', secs: 20 },
    ],
  },
];

// Settings: the chime lives with the breathing settings (settings.data.breathing.chime).
export async function getChimeSetting() {
  try { return (await getBreathingSettings()).chime !== false; } catch { return true; }
}

// Soft generated chime: two gentle sine tones fading out (no audio file).
function playChime(ctx) {
  if (!ctx) return;
  const now = ctx.currentTime + 0.05;
  [[523.25, 0], [783.99, 0.35]].forEach(([freq, delay]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.18, now + delay + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 2.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 2.8);
  });
}

const RING_R = 96;
const RING_C = 2 * Math.PI * RING_R;

export async function runMeditation(id) {
  const ex = EXERCISES.find((e) => e.id === id);
  if (!ex) return;
  // Sound must be unlocked during the tap that started the exercise, so the
  // audio context is made before anything else waits.
  let ctx = null;
  try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) ctx = new AC(); } catch { ctx = null; }

  let vibrate = true;
  try { vibrate = (await getBreathingSettings()).vibrate; } catch { /* default on */ }
  const chime = await getChimeSetting();
  if (!chime && ctx) { ctx.close().catch(() => {}); ctx = null; }
  const buzz = (p) => { if (vibrate && 'vibrate' in navigator) navigator.vibrate(p); };
  const releaseScreen = await holdScreenOn();
  const timed = ex.mode === 'timed';

  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'breathe meditate';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', ex.title);
    el.innerHTML = `
      <div class="breathe-inner meditate-inner">
        <p class="breathe-round" aria-live="polite"></p>
        <div class="meditate-visual">
          ${timed ? `<svg viewBox="0 0 220 220" class="meditate-ring" aria-hidden="true">
            <circle cx="110" cy="110" r="${RING_R}" class="breathe-track"/>
            <circle cx="110" cy="110" r="${RING_R}" class="meditate-arc" transform="rotate(-90 110 110)"
              style="stroke-dasharray:${RING_C};stroke-dashoffset:0"/>
          </svg>` : ''}
          <span class="meditate-big" aria-hidden="true"></span>
        </div>
        <p class="breathe-step meditate-title" aria-live="assertive"></p>
        <p class="meditate-text"></p>
        <div class="meditate-actions">
          ${timed ? '<button class="pill-btn" type="button" data-pause>Pause</button>' : '<button class="pill-btn meditate-next" type="button" data-next>Next</button>'}
          <button class="pill-btn breathe-skip" type="button" data-skip>Skip</button>
        </div>
      </div>`;
    document.body.appendChild(el);
    const roundEl = el.querySelector('.breathe-round');
    const bigEl = el.querySelector('.meditate-big');
    const titleEl = el.querySelector('.meditate-title');
    const textEl = el.querySelector('.meditate-text');
    const arc = el.querySelector('.meditate-arc');
    const pauseBtn = el.querySelector('[data-pause]');
    const nextBtn = el.querySelector('[data-next]');

    let index = -1;
    let done = false;
    let raf = 0;
    let stepStart = 0;   // performance.now() when the current step began (timed)
    let pausedAt = 0;    // 0 when running

    const close = (delay = 0) => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      document.removeEventListener('visibilitychange', onHidden);
      setTimeout(() => {
        el.classList.add('closing');
        releaseScreen();
        setTimeout(() => {
          el.remove();
          if (ctx) setTimeout(() => ctx.close().catch(() => {}), 3000);
          resolve();
        }, 250);
      }, delay);
    };

    const finish = () => {
      cancelAnimationFrame(raf);
      roundEl.textContent = '';
      bigEl.textContent = '';
      if (arc) arc.style.strokeDashoffset = '0';
      titleEl.textContent = 'Well done';
      textEl.textContent = 'Take a moment before you carry on.';
      el.querySelector('.meditate-actions').hidden = true;
      buzz([60, 80, 60]);
      if (ctx) { ctx.resume().catch(() => {}); playChime(ctx); }
      close(2600);
    };

    const show = (i) => {
      index = i;
      const step = ex.steps[i];
      roundEl.textContent = `Step ${i + 1} of ${ex.steps.length}`;
      titleEl.textContent = step.count ? `${step.count} ${step.title.toLowerCase()}` : step.title;
      textEl.textContent = step.text;
      el.classList.toggle('tense', !!step.tense);
      if (!timed) {
        bigEl.textContent = step.count ? String(step.count) : '';
        el.classList.toggle('meditate-plain', !step.count);
        nextBtn.textContent = i === ex.steps.length - 1 ? 'Finish' : 'Next';
      }
      if (i > 0) buzz(step.tense ? [40, 50, 40] : 50);
    };

    // Timed: move on when each step's time is up; the ring empties as it goes.
    const frame = (now) => {
      if (done || pausedAt) return;
      const step = ex.steps[index];
      const ms = step.secs * 1000;
      const t = Math.max(0, now - stepStart);
      if (t >= ms) {
        if (index >= ex.steps.length - 1) { finish(); return; }
        stepStart += ms;
        show(index + 1);
        raf = requestAnimationFrame(frame);
        return;
      }
      bigEl.textContent = String(Math.ceil((ms - t) / 1000));
      arc.style.strokeDashoffset = `${RING_C * (t / ms)}`;
      raf = requestAnimationFrame(frame);
    };

    const pause = () => {
      if (!timed || pausedAt || done) return;
      pausedAt = performance.now();
      cancelAnimationFrame(raf);
      pauseBtn.textContent = 'Resume';
      el.classList.add('paused');
    };
    const resume = () => {
      if (!pausedAt || done) return;
      stepStart += performance.now() - pausedAt;
      pausedAt = 0;
      pauseBtn.textContent = 'Pause';
      el.classList.remove('paused');
      raf = requestAnimationFrame(frame);
    };
    // Leaving the app pauses a timed exercise, so no steps are missed.
    const onHidden = () => { if (document.visibilityState === 'hidden') pause(); };
    document.addEventListener('visibilitychange', onHidden);

    el.querySelector('[data-skip]').addEventListener('click', () => close());
    if (pauseBtn) pauseBtn.addEventListener('click', () => (pausedAt ? resume() : pause()));
    if (nextBtn) nextBtn.addEventListener('click', () => {
      if (index >= ex.steps.length - 1) finish(); else show(index + 1);
    });

    show(0);
    if (timed) { stepStart = performance.now(); raf = requestAnimationFrame(frame); }
  });
}
