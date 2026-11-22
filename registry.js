// Registry of hubs and tiles.
// To add a tile: create /tiles/<id>/index.js and add one line to `tiles`.
// To add a hub:  create /hubs/<id>/index.js and add one line to `hubs`.
// `icon` must be a name from core/icons.js.

export const hubs = [
  { id: 'morning',   title: 'Morning',   icon: 'morning',   path: './hubs/morning/index.js' },
  // Money was removed on 22/11/2026 (Scott: it felt like work). Its code and
  // data are kept but unused; to bring it back, restore this line:
  // { id: 'money', title: 'Money', icon: 'money', path: './hubs/money/index.js' },
  { id: 'wellbeing', title: 'Wellbeing', icon: 'wellbeing', path: './hubs/wellbeing/index.js' },
  { id: 'plan',      title: 'Plan',      icon: 'plan',      path: './hubs/plan/index.js' },
  { id: 'settings',  title: 'Settings',  icon: 'settings',  path: './hubs/settings/index.js' },
];

// Order here is the default order on a fresh layout.
export const tiles = [
  { id: 'photos',   path: './tiles/photos/index.js' },
  { id: 'calendar', path: './tiles/calendar/index.js' },
  { id: 'weather',  path: './tiles/weather/index.js' },
  { id: 'music',    path: './tiles/music/index.js' },
  { id: 'lights',   path: './tiles/lights/index.js' },
];
