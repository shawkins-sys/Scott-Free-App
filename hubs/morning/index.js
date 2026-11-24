// Morning hub (replaces Money, 22/11/2026). One calm briefing page read top to
// bottom: Man Utd and the Premier League, headlines for Scott's topics (heavy
// stories filtered out on the server), one good thing, on this day, then an
// end line. Shows the saved copy at once and refreshes in the background.
import { CONFIG } from '../../config.js';
import { esc } from '../../core/wellbeing.js';
import { friendlyDate } from '../../core/date.js';
import { savedMorning, isFresh, fetchMorning, loadShow, showFrom } from '../../core/morning.js';

const tz = CONFIG.timezone;
const dayTime = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayOnly = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', day: '2-digit', month: '2-digit' });
const fmt = (f, iso) => f.format(new Date(iso)).replace(',', '');

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

function ago(ms) {
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

const link = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener">${text}</a>`;

function footballHtml(f) {
  if (!f || f.error === 'notset') return '<p class="muted small">Football will appear once the football token is set in Supabase.</p>';
  if (f.error) return '<p class="muted small">Football is not available right now.</p>';
  const team = f.teamId;
  const line = (m, done) => {
    const us = m.homeId === team ? 'home' : m.awayId === team ? 'away' : '';
    return `<span class="${us === 'home' ? 'mo-us' : ''}">${esc(m.home)}</span>
      <span class="mo-score">${done ? `${m.homeGoals ?? '-'} - ${m.awayGoals ?? '-'}` : 'v'}</span>
      <span class="${us === 'away' ? 'mo-us' : ''}">${esc(m.away)}</span>`;
  };
  const last = f.last;
  let outcome = '';
  if (last) {
    const ours = last.homeId === team ? last.homeGoals : last.awayGoals;
    const theirs = last.homeId === team ? last.awayGoals : last.homeGoals;
    outcome = ours > theirs ? 'Won' : ours < theirs ? 'Lost' : 'Drew';
  }
  return `
    ${last ? `<p class="mo-label">Last match</p>
      <div class="mo-match">${line(last, true)}</div>
      <p class="muted small mo-cap">${outcome}, ${fmt(dayOnly, last.at)}${last.competition && last.competition !== 'Premier League' ? ` &middot; ${esc(last.competition)}` : ''}${f.position ? ` &middot; ${ordinal(f.position.pos)} in the table, ${f.position.pts} pts` : ''}</p>` : ''}
    ${f.next ? `<p class="mo-label">Next match</p>
      <div class="mo-match">${line(f.next, false)}</div>
      <p class="muted small mo-cap">${fmt(dayTime, f.next.at)}${f.next.competition && f.next.competition !== 'Premier League' ? ` &middot; ${esc(f.next.competition)}` : ''}</p>` : ''}
    ${f.results && f.results.length ? `
      <details class="mo-table"><summary>Matchday ${f.matchday} results</summary>
        <ul class="mo-results">${f.results.map((m) => `<li>${line(m, true)}</li>`).join('')}</ul>
      </details>` : ''}
    ${f.table && f.table.length ? `
      <details class="mo-table"><summary>Premier League table</summary>
        <table><thead><tr><th>#</th><th>Team</th><th>P</th><th>GD</th><th>Pts</th></tr></thead>
        <tbody>${f.table.map((r) => `<tr class="${r.id === team ? 'mo-us-row' : ''}"><td>${r.pos}</td><td>${esc(r.team)}</td><td>${r.played}</td><td>${r.gd > 0 ? '+' : ''}${r.gd}</td><td>${r.pts}</td></tr>`).join('')}</tbody></table>
      </details>` : ''}`;
}

function newsHtml(topic) {
  if (!topic.stories || !topic.stories.length) return '<p class="muted small">No headlines right now.</p>';
  // News-site rows: small picture on the left (when the feed has one), then
  // headline, source and age. The whole row opens the article.
  return `<ul class="mo-news">${topic.stories.map((s) => `
    <li><a class="mo-story" href="${esc(s.url)}" target="_blank" rel="noopener">
      ${s.image ? `<img class="mo-thumb" src="${esc(s.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
      <span class="mo-story-text"><span class="mo-story-title">${esc(s.title)}</span>
        <span class="muted small">${esc(s.source)}${s.at ? ` &middot; ${ago(s.at)}` : ''}</span></span>
    </a></li>`).join('')}</ul>`;
}

// Rough reading time for the "x min read" line.
function minutes(d, show) {
  let words = 40;
  if (show.football && d.football && !d.football.error) words += 40 + (d.football.results || []).length * 6;
  for (const t of d.news || []) if (show[t.id]) words += (t.stories || []).reduce((n, s) => n + s.title.split(' ').length, 0);
  if (show.good && d.good) words += (d.good.title + ' ' + (d.good.summary || '')).split(' ').length;
  if (show.otd && d.onThisDay) words += d.onThisDay.text.split(' ').length;
  return Math.max(1, Math.round(words / 200));
}

function pageHtml(saved, show) {
  const d = saved.data;
  const parts = [];
  if (show.football) parts.push(`<section class="mo-sec"><h2 class="mo-head">Man Utd</h2>${footballHtml(d.football)}</section>`);
  for (const t of d.news || []) {
    if (!show[t.id]) continue;
    parts.push(`<section class="mo-sec"><h2 class="mo-head">${esc(t.title)}${t.rotating ? ' <span class="mo-tag">This week</span>' : ''}</h2>
      ${newsHtml(t)}${t.next ? `<p class="muted small mo-next">Tomorrow: ${esc(t.next)}</p>` : ''}</section>`);
  }
  if (show.good && d.good) {
    parts.push(`<section class="mo-sec"><h2 class="mo-head">One good thing</h2>
      ${d.good.image ? `<a href="${esc(d.good.url)}" target="_blank" rel="noopener"><img class="mo-good-img" src="${esc(d.good.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></a>` : ''}
      <p class="mo-good">${link(d.good.url, esc(d.good.title))}</p>
      ${d.good.summary ? `<p class="muted small">${esc(d.good.summary)}</p>` : ''}
      <p class="muted small">${esc(d.good.source)}</p></section>`);
  }
  if (show.otd && d.onThisDay) {
    const o = d.onThisDay;
    parts.push(`<section class="mo-sec"><h2 class="mo-head">On this day</h2>
      <p><strong>${esc(String(o.year))}</strong>: ${esc(o.text)}${o.url ? ` <a class="mo-more" href="${esc(o.url)}" target="_blank" rel="noopener">Read more</a>` : ''}</p></section>`);
  }
  if (!parts.length) parts.push('<p class="muted">All sections are turned off. Choose what to show in Settings, Morning.</p>');
  return `
    <div class="card mo-card">
      <h1 class="mo-title">Morning read</h1>
      <p class="muted small">${friendlyDate(new Date())} &middot; ${minutes(d, show)} min read</p>
      ${parts.join('')}
      <p class="mo-end">That's everything for today</p>
    </div>
    <p class="muted small mo-updated">Updated ${ago(saved.at)} &middot; <button type="button" class="link-btn mo-refresh">Refresh</button></p>`;
}

export default {
  id: 'morning',
  title: 'Morning',
  async render(container) {
    let show = showFrom({ show: (() => { try { return JSON.parse(localStorage.getItem('sf-morning-show')); } catch { return null; } })() });
    let saved = savedMorning();
    const draw = () => {
      if (!container.isConnected) return;
      container.innerHTML = saved ? pageHtml(saved, show)
        : '<div class="card"><p class="muted">Getting this morning\'s read...</p></div>';
    };
    const refresh = async () => {
      try { saved = await fetchMorning(); draw(); }
      catch (err) {
        console.warn('Morning refresh failed', err);
        if (!container.isConnected) return;
        if (!saved) {
          container.innerHTML = '<div class="card"><p class="muted">The morning read is not available right now. Check your connection and try again later.</p></div>';
        } else {
          const btn = container.querySelector('.mo-refresh');
          if (btn) btn.textContent = 'Could not refresh, try again';
        }
      }
    };
    // Refresh on demand (the page otherwise refreshes when over 20 minutes old).
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.mo-refresh');
      if (!btn) return;
      btn.textContent = 'Refreshing...';
      btn.disabled = true;
      refresh();
    });
    draw();
    loadShow().then((s) => { show = s; draw(); });
    if (!isFresh(saved)) await refresh();
  },
};
