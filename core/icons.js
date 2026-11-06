// Simple line icons (24x24, stroke uses currentColor).
const wrap = (d) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icons = {
  home: wrap('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  money: wrap('<rect x="3" y="6" width="18" height="12" rx="3"/><circle cx="12" cy="12" r="2.5"/>'),
  wellbeing: wrap('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'),
  plan: wrap('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  back: wrap('<path d="M15 5l-7 7 7 7"/>'),
  expand: wrap('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>'),
  close: wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
  lock: wrap('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
};
