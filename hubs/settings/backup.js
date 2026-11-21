// Settings: Backup and export. Downloads only for now; restore (add back only)
// is the next step.
import { buildBackup, wellbeingCsv, weeklyCsv, download, fileStamp } from '../../core/backup.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export async function renderBackupSettings(body) {
  body.innerHTML = `
    <p class="muted small">Keep a copy of your data, or open your wellbeing history in Excel or Google Sheets. Money data is not included.</p>
    <div class="backup-btns">
      <button class="pill-btn" data-export="full">Download full backup</button>
      <button class="pill-btn" data-export="daily">Download wellbeing spreadsheet</button>
      <button class="pill-btn" data-export="weekly">Download weekly reviews spreadsheet</button>
    </div>
    <p class="muted small">The full backup is for restoring the app. Restore is coming next.</p>
    <p class="form-msg" aria-live="polite"></p>`;
  const msg = body.querySelector('.form-msg');
  const say = (t, err = false) => { msg.textContent = t; msg.classList.toggle('error', err); };

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
