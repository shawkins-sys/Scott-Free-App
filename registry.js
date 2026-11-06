// Registry of hubs and tiles.
// To add a tile: create /tiles/<id>/index.js and add one line to `tiles`.
// To add a hub:  create /hubs/<id>/index.js and add one line to `hubs`.
// `icon` must be a name from core/icons.js.

export const hubs = [
  { id: 'money',     title: 'Money',     icon: 'money',     path: './hubs/money/index.js' },
  { id: 'wellbeing', title: 'Wellbeing', icon: 'wellbeing', path: './hubs/wellbeing/index.js' },
  { id: 'plan',      title: 'Plan',      icon: 'plan',      path: './hubs/plan/index.js' },
];

// Order here is the default order on a fresh layout.
export const tiles = [
  { id: 'photos',   path: './tiles/photos/index.js' },
  { id: 'calendar', path: './tiles/calendar/index.js' },
  { id: 'weather',  path: './tiles/weather/index.js' },
];
