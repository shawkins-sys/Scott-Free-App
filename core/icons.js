// Simple line icons (24x24, stroke uses currentColor).
const wrap = (d) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icons = {
  home: wrap('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'),
  // Sun rising over the horizon (Morning hub).
  morning: wrap('<path d="M3 18h18M6 21h12"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 6v3M5.6 10.6l1.6 1.6M18.4 10.6l-1.6 1.6M2.5 15h2M19.5 15h2"/>'),
  money: wrap('<rect x="3" y="6" width="18" height="12" rx="3"/><circle cx="12" cy="12" r="2.5"/>'),
  wellbeing: wrap('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'),
  plan: wrap('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  // Gear drawn edge to edge, so scaled to 80% to match the other icons.
  settings: wrap('<g transform="translate(2.4 2.4) scale(0.8)"><circle vector-effect="non-scaling-stroke" cx="12" cy="12" r="3"/><path vector-effect="non-scaling-stroke" d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></g>'),
  back: wrap('<path d="M15 5l-7 7 7 7"/>'),
  expand: wrap('<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>'),
  close: wrap('<path d="M6 6l12 12M18 6L6 18"/>'),
  lock: wrap('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
};
