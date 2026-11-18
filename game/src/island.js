// Palmtide Isle's map: roads, buildings, palms, the harbour, the night market
// and the pier. Buildings are placed one per city block on a grid, with a gap
// between every building and its block's edge, so two buildings can never
// overlap and the player can never be walled into a corner: every block keeps
// open pavement on all four sides.

import { WORLD } from './config.js';
import { pick, range } from './random.js';

export const ROAD_WIDTH = 96;
export const ROADS_X = [600, 1200, 1800, 2400, 3000];
export const ROADS_Y = [500, 1000, 1500, 2000];

const ROOFS = ['roofA', 'roofB', 'roofC', 'roofD'];

function rectsOverlap(a, b, pad) {
  return a.x - pad < b.x + b.w + pad && a.x + a.w + pad > b.x - pad
    && a.y - pad < b.y + b.h + pad && a.y + a.h + pad > b.y - pad;
}

export function buildIsland(random) {
  const buildings = [];
  const palms = [];
  const stalls = [];
  const boats = [];
  const docks = [];

  // City blocks sit between the roads; each block gets at most one building,
  // centred with at least 70px of pavement around it.
  const xs = [180, ...ROADS_X, WORLD.width - 180];
  const ys = [180, ...ROADS_Y, WORLD.height - 180];
  for (let bx = 0; bx < xs.length - 1; bx += 1) {
    for (let by = 0; by < ys.length - 1; by += 1) {
      const block = {
        x: xs[bx] + ROAD_WIDTH / 2 + 24,
        y: ys[by] + ROAD_WIDTH / 2 + 24,
        w: xs[bx + 1] - xs[bx] - ROAD_WIDTH - 48,
        h: ys[by + 1] - ys[by] - ROAD_WIDTH - 48,
      };
      // The harbour block (west edge, middle) and the market block stay open.
      const isHarbour = bx === 0 && by === 2;
      const isMarket = bx === 2 && by === 2;
      if (isHarbour || isMarket) continue;
      if (random() < 0.18) continue; // an empty lot with palms instead
      const bw = Math.min(block.w - 140, range(random, 130, 220));
      const bh = Math.min(block.h - 140, range(random, 110, 190));
      const building = {
        x: block.x + (block.w - bw) / 2,
        y: block.y + (block.h - bh) / 2,
        w: bw,
        h: bh,
        roof: pick(random, ROOFS),
        kind: random() < 0.3 ? 'hotel' : random() < 0.5 ? 'shop' : 'house',
        name: '',
      };
      // Safety net: never accept a building that overlaps an earlier one.
      let ok = true;
      for (const other of buildings) {
        if (rectsOverlap(building, other, 40)) { ok = false; break; }
      }
      if (ok) buildings.push(building);
    }
  }

  // Palm trees: along the beach ring and scattered in empty lots.
  for (let i = 0; i < 150; i += 1) {
    const side = Math.floor(random() * 4);
    let x = 0;
    let y = 0;
    if (side === 0) { x = range(random, 60, WORLD.width - 60); y = range(random, 60, 130); }
    else if (side === 1) { x = range(random, 60, WORLD.width - 60); y = range(random, WORLD.height - 130, WORLD.height - 60); }
    else if (side === 2) { x = range(random, 60, 130); y = range(random, 60, WORLD.height - 60); }
    else { x = range(random, WORLD.width - 130, WORLD.width - 60); y = range(random, 60, WORLD.height - 60); }
    palms.push({ x, y, sway: random() * Math.PI * 2, size: range(random, 0.85, 1.25) });
  }
  for (let i = 0; i < 40; i += 1) {
    palms.push({ x: range(random, 200, WORLD.width - 200), y: range(random, 200, WORLD.height - 200), sway: random() * Math.PI * 2, size: range(random, 0.8, 1.2) });
  }

  // Night market stalls in the open central block.
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      stalls.push({
        x: 1300 + col * 105,
        y: 1210 + row * 100,
        w: 92,
        h: 64,
        colour: pick(random, ['#ff5d8f', '#ffd23f', '#2fb3d9', '#ff7b54']),
        goods: pick(random, ['Nasi Goreng', 'Es Kelapa', 'Sate Ikan', 'Jus Mangga', 'Kerang Bakar']),
      });
    }
  }

  // Harbour docks on the west edge, jutting into the sea, with moored boats.
  for (let i = 0; i < 3; i += 1) {
    docks.push({ x: 0, y: 1180 + i * 220, w: 260, h: 46 });
  }
  for (let i = 0; i < 6; i += 1) {
    boats.push({ x: range(random, 60, 700), y: range(random, 1050, 1900), angle: range(random, -0.4, 0.4), kind: i % 2 === 0 ? 'fishing' : 'speed', bob: random() * Math.PI * 2 });
  }
  // Tour boats out in the bay.
  for (let i = 0; i < 4; i += 1) {
    boats.push({ x: range(random, 300, 1500), y: range(random, 2200, 2450), angle: range(random, -0.3, 0.3), kind: 'tour', bob: random() * Math.PI * 2 });
  }

  const landmarks = {
    port: { x: 300, y: 1500, label: 'Pelabuhan Palmtide' },
    market: { x: 1750, y: 1150, label: 'Pasar Malam' },
    beachBar: { x: 3150, y: 2150, label: 'Bar Pantai Ombak' },
    warehouse: { x: 300, y: 1180, label: 'Gudang Pelabuhan' },
    pier: { x: 3300, y: 800, label: 'Dermaga Timur' },
    clinic: { x: 900, y: 750, label: 'Klinik Pantai' },
    resort: { x: 2100, y: 750, label: 'Resort Karang' },
    lighthouse: { x: 3450, y: 300, label: 'Mercusuar' },
  };

  return { buildings, palms, stalls, boats, docks, landmarks };
}

/** True when the point is on land (inside the island, off the sea). */
export function isOnLand(x, y) {
  return x > 120 && x < WORLD.width - 120 && y > 120 && y < WORLD.height - 120;
}

/** True when the point is on a road (either direction). */
export function isOnRoad(x, y) {
  for (const rx of ROADS_X) if (Math.abs(x - rx) < ROAD_WIDTH / 2) return true;
  for (const ry of ROADS_Y) if (Math.abs(y - ry) < ROAD_WIDTH / 2) return true;
  return false;
}

/** Push a circle out of every building it overlaps; returns true if pushed. */
export function collideBuildings(buildings, body, radius) {
  let hit = false;
  for (const b of buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      const d = Math.sqrt(d2) || 0.001;
      body.x = cx + (dx / d) * radius;
      body.y = cy + (dy / d) * radius;
      hit = true;
    }
  }
  return hit;
}

export function clampToWorld(body, margin) {
  body.x = Math.max(margin, Math.min(WORLD.width - margin, body.x));
  body.y = Math.max(margin, Math.min(WORLD.height - margin, body.y));
}
