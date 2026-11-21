// Settings: Backup and export. Three downloads, plus Restore from a full
// backup (add back only: restores anything missing, never deletes or changes).
import { buildBackup, wellbeingCsv, weeklyCsv, download, fileStamp, readBackupFile, restoreBackup } from '../../core/backup.js';

const LABELS = {
  settings: ['setting', 'settings'], layouts: ['tile layout', 'tile layouts'], checkins: ['check-in', 'check-ins'],
  phrases: ['phrase', 'phrases'], weekly_reviews: ['weekly review', 'weekly reviews'], key_dates: ['key date', 'key dates'],
  playlists: ['playlist', 'playlists'], shopping_lists: ['list', 'lists'],
  shopping_items: ['list item', 'list items'], shopping_staples: ['staple', 'staples'],
};
const count = (t, n) => { const l = LABELS[t] || [t, t]; return `${n} ${n === 1 ? l[0] : l[1]}`; };
const label = (t) => (LABELS[t] || [t, t])[1];

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export async function renderBackupSettings(body) {
  body.innerHTML = `
    <p class="muted small">Keep a copy of your data, or open your wellbeing history in Excel or Google Sheets. Money data is not included.</p>
    <div class="backup-btns">
      <button class="pill-btn" data-export="full">Download full backup</button>
      <button class="pill-btn" data-export="daily">Download wellbeing spreadsheet</button>
      <button class="pill-btn" data-export="weekly">Download weekly reviews spreadsheet</button>
    </div>
    <h3 class="w-head">Restore</h3>
    <p class="muted small">Choose a full backup file. Anything missing is added back. Nothing is deleted and nothing already in the app is changed.</p>
    <label class="pill-btn backup-file">Choose backup file<input type="file" accept=".json,application/json" hidden></label>
    <p class="form-msg" aria-live="polite"></p>`;
  const msg = body.querySelector('.form-msg');
  const say = (t, err = false) => { msg.textContent = t; msg.classList.toggle('error', err); };

  body.querySelector('input[type=file]').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // allow choosing the same file again
    if (!file) return;
    let backup;
    try { backup = readBackupFile(await file.text()); }
    catch (err) { say(err.message, true); return; }
    const when = backup.exportedAt ? new Date(backup.exportedAt).toLocaleDateString('en-GB') : 'an unknown date';
    const inFile = Object.entries(backup.tables).filter(([, rows]) => rows && rows.length)
      .map(([t, rows]) => count(t, rows.length)).join(', ');
    if (!confirm(`Restore from the backup made on ${when}?\n\nIt contains: ${inFile || 'nothing'}.\n\nOnly missing items are added. Nothing is deleted or changed.`)) return;
    say('Restoring...');
    try {
      const added = await restoreBackup(backup, (t) => say(`Restoring ${label(t)}...`));
      const parts = Object.entries(added).filter(([, n]) => n > 0).map(([t, n]) => count(t, n));
      say(parts.length ? `Restore complete. Added: ${parts.join(', ')}. Close and reopen the app to see everything.`
        : 'Restore complete. Nothing was missing, so nothing needed adding.');
    } catch (err) {
      console.error('Restore failed', err);
      say('The restore stopped part way. Anything added so far is kept. Check your connection and try again; it is safe to run again.', true);
    }
  });

  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-export]');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    say('Preparing your file...');
    try {
      const backup = await buildBackup();
      const stamp = fileStamp();
      const t = backup.tables;
      if (btn.dataset.export === 'full') {
        download(`scott-hub-backup-${stamp}.json`, JSON.stringify(backup, null, 2), 'application/json');
        const total = Object.values(t).reduce((n, rows) => n + rows.length, 0);
        say(`Backup downloaded (${plural(total, 'item', 'items')}, including ${plural(t.checkins.length, 'check-in', 'check-ins')} and ${plural(t.phrases.length, 'phrase', 'phrases')}).`);
      } else if (btn.dataset.export === 'daily') {
        download(`scott-hub-wellbeing-${stamp}.csv`, await wellbeingCsv(t.checkins), 'text/csv');
        say(`Wellbeing spreadsheet downloaded (${plural(t.checkins.length, 'day', 'days')}).`);
      } else {
        download(`scott-hub-weekly-reviews-${stamp}.csv`, weeklyCsv(t.weekly_reviews), 'text/csv');
        say(`Weekly reviews spreadsheet downloaded (${plural(t.weekly_reviews.length, 'week', 'weeks')}).`);
      }
    } catch (err) {
      console.error('Export failed', err);
      say('That did not work. Check your connection and try again.', true);
    } finally {
      btn.disabled = false;
    }
  });
}
