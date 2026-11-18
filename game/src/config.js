// Palmtide Isle — every tuning number and colour in one place.
// The island is a fixed 3600x2600 world; the camera follows the player and the
// renderer scales the view to the window, so no rule below depends on screen size.

export const WORLD = { width: 3600, height: 2600 };

export const STEP = 1 / 60;

export const PLAYER = {
  radius: 16,
  walkSpeed: 230,
  runSpeed: 330,
  health: 100,
  punchRange: 48,
  punchDamage: 34,
  punchCooldown: 0.38,
};

export const CAR = {
  accel: 520,
  reverseAccel: 320,
  maxSpeed: 560,
  maxReverse: 180,
  turnRate: 2.6,
  drag: 0.55,
  grip: 6.5,
  health: 100,
  stealWanted: 1,
};

export const TRAFFIC = { count: 14, minSpeed: 150, maxSpeed: 260 };
export const PEDS = { count: 26, minSpeed: 40, maxSpeed: 75 };

// Wanted is always clamped to this range; police on the map equals the level.
export const WANTED = { min: 0, max: 5, decaySeconds: 26, maxPolice: 5 };

export const POLICE = {
  accel: 560,
  maxSpeed: 520,
  ramDamage: 2,
  ramCooldown: 2.0,
  punchHits: 3,
};

export const PALETTE = {
  seaDeep: '#0b6fa8',
  sea: '#1293c4',
  seaLight: '#2fb3d9',
  sand: '#f2dda6',
  sandWet: '#e3c98d',
  grass: '#58b368',
  grassDark: '#3f9a52',
  road: '#3a3f4a',
  roadLine: '#f7d54d',
  sidewalk: '#c9c2b4',
  roofA: '#e2574c',
  roofB: '#f28c28',
  roofC: '#2f7fc4',
  roofD: '#7a5fb0',
  wall: '#f5efe0',
  palmTrunk: '#8a6b46',
  palmLeaf: '#2fae5f',
  marketAwning: '#ff5d8f',
  pier: '#9a7b52',
  player: '#ffd23f',
  playerShirt: '#ff7b54',
  police: '#1c4fd7',
  policeLight: '#ff3b30',
  enemy: '#8e2de2',
  hudPanel: 'rgba(10, 26, 38, 0.72)',
  text: '#ffffff',
  muted: '#cfe8f2',
  gold: '#ffd23f',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export const SAVE_KEY = 'palmtide-isle.save.v1';
export const BEST_KEY = 'palmtide-isle.best.v1';

export const MISSION_REWARDS = [400, 650, 500, 900, 1200, 2000];
