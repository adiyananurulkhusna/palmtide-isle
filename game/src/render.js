// Drawing only: the world's state and the current screen in, pixels out. The
// camera follows the player across the island; the HUD carries money, health,
// wanted stars, the mission objective and a live minimap. Flat shapes and
// canvas text, no images, so nothing is ever fetched.

import { FONT, PALETTE, WANTED, WORLD } from './config.js';
import { ROADS_X, ROADS_Y, ROAD_WIDTH } from './island.js';
import { currentStep, MISSIONS, nextMission, stepHint } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const VIEW = { width: 1280, height: 720 };
const MINIMAP = { x: 1052, y: 16, w: 212, h: 154 };

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const lastOrigin = { x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, baseline) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function plainText(value, x, y, size, color, align, baseline) {
    if (!fonts.has('p' + size)) fonts.set('p' + size, `${size}px ${FONT}`);
    context.font = fonts.get('p' + size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function drawSea(state) {
    context.fillStyle = PALETTE.seaDeep;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    // Animated wave bands rolling toward the beach.
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.lineWidth = 3;
    for (let band = 0; band < 5; band += 1) {
      const offset = ((state.waveTime * 22 + band * 34) % 170);
      context.beginPath();
      context.strokeRect(120 - offset, 120 - offset, WORLD.width - 240 + offset * 2, WORLD.height - 240 + offset * 2);
      context.stroke();
    }
    context.fillStyle = PALETTE.sea;
    context.fillRect(120, 120, WORLD.width - 240, WORLD.height - 240);
  }

  function drawLand(state) {
    const island = state.island;
    // Sand beach ring, then grass.
    context.fillStyle = PALETTE.sand;
    context.fillRect(120, 120, WORLD.width - 240, WORLD.height - 240);
    context.fillStyle = PALETTE.grass;
    context.fillRect(230, 230, WORLD.width - 460, WORLD.height - 460);
    // Grass patches for texture.
    context.fillStyle = PALETTE.grassDark;
    for (let i = 0; i < island.palms.length; i += 1) {
      const palm = island.palms[i];
      if (i % 3 === 0) {
        context.beginPath();
        context.arc(palm.x, palm.y, 26, 0, Math.PI * 2);
        context.fill();
      }
    }
    // Sidewalks and roads.
    context.fillStyle = PALETTE.sidewalk;
    for (const rx of ROADS_X) context.fillRect(rx - ROAD_WIDTH / 2 - 14, 230, ROAD_WIDTH + 28, WORLD.height - 460);
    for (const ry of ROADS_Y) context.fillRect(230, ry - ROAD_WIDTH / 2 - 14, WORLD.width - 460, ROAD_WIDTH + 28);
    context.fillStyle = PALETTE.road;
    for (const rx of ROADS_X) context.fillRect(rx - ROAD_WIDTH / 2, 230, ROAD_WIDTH, WORLD.height - 460);
    for (const ry of ROADS_Y) context.fillRect(230, ry - ROAD_WIDTH / 2, WORLD.width - 460, ROAD_WIDTH);
    // Dashed centre lines.
    context.fillStyle = PALETTE.roadLine;
    for (const rx of ROADS_X) {
      for (let y = 260; y < WORLD.height - 260; y += 64) context.fillRect(rx - 3, y, 6, 34);
    }
    for (const ry of ROADS_Y) {
      for (let x = 260; x < WORLD.width - 260; x += 64) context.fillRect(x, ry - 3, 34, 6);
    }
    // Harbour docks and the east pier.
    context.fillStyle = PALETTE.pier;
    for (const dock of island.docks) context.fillRect(dock.x, dock.y, dock.w, dock.h);
    context.fillRect(3300, 700, 180, 34);
    context.fillRect(3300, 700, 34, 220);
  }

  function drawPalm(palm, time) {
    const sway = Math.sin(time * 1.2 + palm.sway) * 0.12;
    context.save();
    context.translate(palm.x, palm.y);
    context.rotate(sway);
    context.strokeStyle = PALETTE.palmTrunk;
    context.lineWidth = 5 * palm.size;
    context.beginPath();
    context.moveTo(0, 0);
    context.lineTo(0, -26 * palm.size);
    context.stroke();
    context.fillStyle = PALETTE.palmLeaf;
    for (let leaf = 0; leaf < 6; leaf += 1) {
      const a = (leaf / 6) * Math.PI * 2;
      context.beginPath();
      context.ellipse(Math.cos(a) * 16 * palm.size, -26 * palm.size + Math.sin(a) * 8 * palm.size, 16 * palm.size, 6 * palm.size, a, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawBuilding(b) {
    context.fillStyle = PALETTE.wall;
    context.fillRect(b.x, b.y, b.w, b.h);
    context.fillStyle = PALETTE[b.roof];
    context.fillRect(b.x - 6, b.y - 6, b.w + 12, 18);
    context.fillStyle = 'rgba(0,0,0,0.18)';
    context.fillRect(b.x + 8, b.y + b.h - 26, 18, 26);
    context.fillStyle = '#bfe6f5';
    for (let wx = b.x + 26; wx < b.x + b.w - 22; wx += 44) {
      context.fillRect(wx, b.y + 26, 24, 18);
    }
    if (b.kind === 'hotel') {
      context.fillStyle = PALETTE.gold;
      context.font = `bold 15px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('HOTEL', b.x + b.w / 2, b.y + b.h / 2 + 6);
    }
  }

  function drawCar(car, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const w = 58;
    const h = 30;
    context.fillStyle = 'rgba(0,0,0,0.25)';
    roundedRect(context, -w / 2 + 3, -h / 2 + 4, w, h, 8);
    context.fill();
    context.fillStyle = car.colour;
    roundedRect(context, -w / 2, -h / 2, w, h, 8);
    context.fill();
    context.fillStyle = '#bfe6f5';
    roundedRect(context, -6, -h / 2 + 4, 18, h - 8, 4);
    context.fill();
    context.fillStyle = '#20242c';
    roundedRect(context, w / 2 - 10, -h / 2 + 3, 6, 8, 2);
    context.fill();
    roundedRect(context, w / 2 - 10, h / 2 - 11, 6, 8, 2);
    context.fill();
    context.fillStyle = '#fff8c9';
    context.fillRect(w / 2 - 2, -h / 2 + 4, 3, 6);
    context.fillRect(w / 2 - 2, h / 2 - 10, 3, 6);
    if (car.kind === 'police') {
      const flash = Math.floor(time * 6) % 2 === 0;
      context.fillStyle = flash ? '#ff3b30' : '#3b82ff';
      context.fillRect(-4, -h / 2 - 2, 10, 5);
      context.fillStyle = flash ? '#3b82ff' : '#ff3b30';
      context.fillRect(-4, h / 2 - 3, 10, 5);
      context.fillStyle = '#ffffff';
      context.font = `bold 10px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('POLISI', 0, 4);
    }
    if (car.kind === 'courier') {
      context.fillStyle = '#ffffff';
      context.font = `bold 10px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('TIDE', 0, 4);
    }
    if (car.disabled) {
      context.fillStyle = 'rgba(20,20,20,0.55)';
      roundedRect(context, -w / 2, -h / 2, w, h, 8);
      context.fill();
    }
    context.restore();
  }

  function drawPerson(x, y, angle, shirt, radius, flash) {
    context.save();
    context.translate(x, y);
    context.rotate(angle);
    context.fillStyle = flash ? '#ffffff' : shirt;
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2b2118';
    context.beginPath();
    context.arc(6, 0, radius * 0.45, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffd9b3';
    context.beginPath();
    context.arc(10, 0, radius * 0.55, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawMarker(x, y, time, label) {
    const bounce = Math.sin(time * 4) * 8;
    context.save();
    context.translate(x, y + bounce);
    context.rotate(Math.PI / 4);
    context.fillStyle = PALETTE.gold;
    context.fillRect(-13, -13, 26, 26);
    context.strokeStyle = '#7a5b00';
    context.lineWidth = 3;
    context.strokeRect(-13, -13, 26, 26);
    context.restore();
    context.fillStyle = 'rgba(255, 210, 63, 0.25)';
    context.beginPath();
    context.moveTo(x - 26, y + 60);
    context.lineTo(x + 26, y + 60);
    context.lineTo(x, y - 30);
    context.closePath();
    context.fill();
    if (label) {
      context.font = `bold 16px ${FONT}`;
      context.textAlign = 'center';
      context.fillStyle = '#08222e';
      context.fillText(label, x, y - 52);
    }
  }

  function drawWorld(state) {
    const island = state.island;
    drawSea(state);
    drawLand(state);
    // Boats bobbing in the bay.
    for (const boat of island.boats) {
      const bob = Math.sin(state.waveTime * 1.4 + boat.bob) * 3;
      context.save();
      context.translate(boat.x, boat.y + bob);
      context.rotate(boat.angle);
      context.fillStyle = boat.kind === 'tour' ? '#ffffff' : boat.kind === 'speed' ? '#ff7b54' : '#f2c94c';
      roundedRect(context, -34, -12, 68, 24, 10);
      context.fill();
      context.fillStyle = '#bfe6f5';
      context.fillRect(-12, -8, 24, 12);
      context.restore();
    }
    // Market stalls with striped awnings.
    for (const stall of island.stalls) {
      context.fillStyle = '#8a6b46';
      context.fillRect(stall.x, stall.y, stall.w, stall.h);
      context.fillStyle = stall.colour;
      context.beginPath();
      context.moveTo(stall.x - 6, stall.y);
      context.lineTo(stall.x + stall.w / 2, stall.y - 22);
      context.lineTo(stall.x + stall.w + 6, stall.y);
      context.closePath();
      context.fill();
      context.fillStyle = '#ffffff';
      context.font = `11px ${FONT}`;
      context.textAlign = 'center';
      context.fillText(stall.goods, stall.x + stall.w / 2, stall.y + stall.h + 16);
    }
    for (const b of island.buildings) drawBuilding(b);
    for (const palm of island.palms) drawPalm(palm, state.waveTime);
    // Cash pickups.
    for (const pickup of state.pickups) {
      if (pickup.taken) continue;
      const bob = Math.sin(state.waveTime * 3 + pickup.bob) * 4;
      context.fillStyle = PALETTE.gold;
      context.beginPath();
      context.arc(pickup.x, pickup.y + bob, 11, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#7a5b00';
      context.font = `bold 13px ${FONT}`;
      context.textAlign = 'center';
      context.fillText('$', pickup.x, pickup.y + bob + 5);
    }
    // Mission markers: next mission start, active objective, race points.
    const missions = state.missions;
    if (!missions.active) {
      const next = nextMission(missions);
      if (next) {
        const lm = state.island.landmarks;
        const point = next.id === 1 ? lm.port : next.id === 2 ? lm.market : next.id === 3 ? lm.beachBar : next.id === 4 ? lm.port : next.id === 5 ? lm.market : lm.pier;
        drawMarker(point.x, point.y, state.waveTime, 'MISI ' + next.id);
      }
    } else {
      const step = currentStep(missions);
      if (step) {
        if (step.kind === 'goto' || step.kind === 'timed' || step.kind === 'fight') drawMarker(step.x, step.y, state.waveTime, 'TUJUAN');
        if (step.kind === 'race') {
          const point = step.points[missions.active.raceIndex];
          if (point) drawMarker(point[0], point[1], state.waveTime, 'BALAP ' + (missions.active.raceIndex + 1));
        }
        if (step.kind === 'chase' && state.courier) drawMarker(state.courier.x, state.courier.y, state.waveTime, 'KEJAR');
      }
    }
    for (const car of state.cars) drawCar(car, state.waveTime);
    for (const car of state.police) drawCar(car, state.waveTime);
    for (const ped of state.peds) drawPerson(ped.x, ped.y, ped.angle, ped.shirt, 12, false);
    for (const e of state.enemies) {
      if (e.dead) continue;
      drawPerson(e.x, e.y, e.angle, PALETTE.enemy, 14, e.hitFlash > 0);
      context.fillStyle = '#3a0d5c';
      context.fillRect(e.x - 16, e.y - 26, 32, 5);
      context.fillStyle = '#c77dff';
      context.fillRect(e.x - 16, e.y - 26, 32 * (e.health / 100), 5);
    }
    const p = state.player;
    if (!p.inCar) {
      drawPerson(p.x, p.y, p.angle, PALETTE.playerShirt, 16, false);
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(p.x, p.y, 16, 0, Math.PI * 2);
      context.strokeStyle = PALETTE.player;
      context.lineWidth = 3;
      context.stroke();
      if (p.punchAnim > 0) {
        context.strokeStyle = '#ffffff';
        context.lineWidth = 5;
        context.beginPath();
        context.arc(p.x, p.y, 34, p.angle - 0.7, p.angle + 0.7);
        context.stroke();
      }
    }
    // Landmark labels, skipped where the HUD panels sit.
    context.font = `bold 15px ${FONT}`;
    context.textAlign = 'center';
    for (const key of Object.keys(island.landmarks)) {
      const lm = island.landmarks[key];
      const sx = lm.x - lastOrigin.x;
      const sy = lm.y - lastOrigin.y;
      if ((sx < 340 && sy < 150) || (sx > 1030 && sy < 200)) continue;
      context.fillStyle = 'rgba(8, 34, 46, 0.65)';
      const w = context.measureText(lm.label).width + 16;
      roundedRect(context, lm.x - w / 2, lm.y - 66, w, 22, 8);
      context.fill();
      context.fillStyle = '#ffffff';
      context.fillText(lm.label, lm.x, lm.y - 50);
    }
  }

  function drawMinimap(state) {
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    context.fillStyle = 'rgba(8, 34, 46, 0.85)';
    roundedRect(context, MINIMAP.x - 6, MINIMAP.y - 6, MINIMAP.w + 12, MINIMAP.h + 12, 10);
    context.fill();
    context.save();
    context.beginPath();
    roundedRect(context, MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h, 6);
    context.clip();
    context.fillStyle = PALETTE.sea;
    context.fillRect(MINIMAP.x, MINIMAP.y, MINIMAP.w, MINIMAP.h);
    context.fillStyle = PALETTE.grass;
    context.fillRect(MINIMAP.x + 230 * sx, MINIMAP.y + 230 * sy, (WORLD.width - 460) * sx, (WORLD.height - 460) * sy);
    context.strokeStyle = '#3a3f4a';
    context.lineWidth = 2;
    for (const rx of ROADS_X) {
      context.beginPath();
      context.moveTo(MINIMAP.x + rx * sx, MINIMAP.y);
      context.lineTo(MINIMAP.x + rx * sx, MINIMAP.y + MINIMAP.h);
      context.stroke();
    }
    for (const ry of ROADS_Y) {
      context.beginPath();
      context.moveTo(MINIMAP.x, MINIMAP.y + ry * sy);
      context.lineTo(MINIMAP.x + MINIMAP.w, MINIMAP.y + ry * sy);
      context.stroke();
    }
    const dot = (x, y, colour, r) => {
      context.fillStyle = colour;
      context.beginPath();
      context.arc(MINIMAP.x + x * sx, MINIMAP.y + y * sy, r, 0, Math.PI * 2);
      context.fill();
    };
    for (const car of state.cars) dot(car.x, car.y, '#ffffff', 2);
    for (const car of state.police) dot(car.x, car.y, '#ff3b30', 3);
    const missions = state.missions;
    if (missions.active) {
      const step = currentStep(missions);
      if (step && (step.kind === 'goto' || step.kind === 'timed' || step.kind === 'fight')) dot(step.x, step.y, PALETTE.gold, 5);
      if (step && step.kind === 'race') {
        const point = step.points[missions.active.raceIndex];
        if (point) dot(point[0], point[1], PALETTE.gold, 5);
      }
      if (step && step.kind === 'chase' && state.courier) dot(state.courier.x, state.courier.y, PALETTE.gold, 5);
    } else {
      const next = nextMission(missions);
      if (next) {
        const lm = state.island.landmarks;
        const point = next.id === 1 ? lm.port : next.id === 2 ? lm.market : next.id === 3 ? lm.beachBar : next.id === 4 ? lm.port : next.id === 5 ? lm.market : lm.pier;
        dot(point.x, point.y, PALETTE.gold, 5);
      }
    }
    const p = state.player;
    dot(p.x, p.y, PALETTE.player, 4);
    context.restore();
    context.fillStyle = 'rgba(8, 34, 46, 0.8)';
    roundedRect(context, MINIMAP.x + 34, MINIMAP.y + MINIMAP.h + 8, MINIMAP.w - 68, 20, 8);
    context.fill();
    plainText('PALMTIDE ISLE', MINIMAP.x + MINIMAP.w / 2, MINIMAP.y + MINIMAP.h + 23, 12, PALETTE.text, 'center');
  }

  function drawHud(state) {
    const p = state.player;
    // Top-left: money, health, wanted.
    context.fillStyle = PALETTE.hudPanel;
    roundedRect(context, 16, 16, 300, 108, 12);
    context.fill();
    text('$' + state.money, 32, 48, 30, PALETTE.gold, 'left');
    plainText('Uang', 32, 66, 13, PALETTE.muted, 'left');
    context.fillStyle = 'rgba(255,255,255,0.25)';
    roundedRect(context, 32, 78, 180, 12, 6);
    context.fill();
    context.fillStyle = p.health > 40 ? '#4ade80' : '#ff5d5d';
    roundedRect(context, 32, 78, 180 * (p.health / 100), 12, 6);
    context.fill();
    plainText('Sehat ' + Math.ceil(p.health), 222, 90, 13, PALETTE.text, 'left');
    // Wanted stars, always 0..5.
    const wanted = Math.max(WANTED.min, Math.min(WANTED.max, state.wanted));
    for (let i = 0; i < WANTED.max; i += 1) {
      text(i < wanted ? '★' : '☆', 32 + i * 30, 118, 24, i < wanted ? '#ffd23f' : 'rgba(255,255,255,0.4)', 'left');
    }
    plainText(wanted > 0 ? 'POLISI MENGEJAR!' : 'Aman', 190, 116, 13, wanted > 0 ? '#ff8a80' : PALETTE.muted, 'left');
    drawMinimap(state);
    // Mission objective bar.
    const missions = state.missions;
    const objective = missions.active
      ? `Misi ${missions.active.mission.id}: ${missions.active.mission.title} — ${stepHint(missions)}`
      : (nextMission(missions)
        ? `Misi berikutnya: ${nextMission(missions).title} — pergi ke penanda emas, tekan Q`
        : 'Semua misi selesai! Pulau ini milikmu, Raka.');
    context.font = `16px ${FONT}`;
    const ow = Math.min(760, context.measureText(objective).width + 60);
    context.fillStyle = PALETTE.hudPanel;
    roundedRect(context, (VIEW.width - ow) / 2, VIEW.height - 108, ow, 44, 12);
    context.fill();
    plainText(objective, VIEW.width / 2, VIEW.height - 79, 16, PALETTE.text, 'center');
    // Timed mission countdown.
    if (missions.active) {
      const step = currentStep(missions);
      if (step && step.kind === 'timed') {
        text(Math.ceil(missions.active.timer) + ' dtk', VIEW.width / 2, VIEW.height - 132, 26, '#ff8a80', 'center');
      }
    }
    // Message banner.
    if (missions.messageTimer > 0 && missions.message) {
      context.font = `16px ${FONT}`;
      const mw = Math.min(900, context.measureText(missions.message).width + 48);
      context.fillStyle = 'rgba(255, 210, 63, 0.92)';
      roundedRect(context, (VIEW.width - mw) / 2, 140, mw, 40, 12);
      context.fill();
      plainText(missions.message, VIEW.width / 2, 167, 16, '#08222e', 'center');
    }
    // Context hint.
    const nearCar = !p.inCar && state.cars.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 85 && c.kind !== 'police');
    const hint = p.inCar
      ? 'WASD mengemudi · E keluar mobil · F klakson'
      : nearCar
        ? 'Tekan E untuk naik mobil'
        : 'WASD jalan · Shift lari · E naik mobil · F pukul · Q misi';
    context.fillStyle = 'rgba(8, 34, 46, 0.7)';
    roundedRect(context, 8, VIEW.height - 34, 210, 26, 8);
    context.fill();
    context.font = `14px ${FONT}`;
    const hw = context.measureText(hint).width + 28;
    roundedRect(context, (VIEW.width - hw) / 2, VIEW.height - 34, hw, 26, 8);
    context.fill();
    plainText(hint, VIEW.width / 2, VIEW.height - 18, 14, 'rgba(255,255,255,0.9)', 'center');
    // Mission progress.
    plainText(`Misi ${missions.completed}/${MISSIONS.length} selesai`, 16, VIEW.height - 18, 14, PALETTE.text, 'left');
  }

  function drawPanel(title, lines, prompt) {
    const width = 640;
    const height = 190 + lines.length * 34;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = 'rgba(8, 34, 46, 0.88)';
    roundedRect(context, x, y, width, height, 18);
    context.fill();
    context.strokeStyle = PALETTE.gold;
    context.lineWidth = 3;
    roundedRect(context, x, y, width, height, 18);
    context.stroke();
    text(title, VIEW.width / 2, y + 72, 46, PALETTE.gold, 'center');
    for (let index = 0; index < lines.length; index += 1) {
      plainText(lines[index], VIEW.width / 2, y + 122 + index * 34, 19, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 36, 22, PALETTE.text, 'center');
  }

  /** Paint one frame: the island through the camera, then HUD or a panel. */
  function draw(state, screen, best) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#06283a';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const camX = Math.max(VIEW.width / 2, Math.min(WORLD.width - VIEW.width / 2, state.camera.x));
    const camY = Math.max(VIEW.height / 2, Math.min(WORLD.height - VIEW.height / 2, state.camera.y));
    const originX = camX - VIEW.width / 2;
    const originY = camY - VIEW.height / 2;
    lastOrigin.x = originX;
    lastOrigin.y = originY;
    context.setTransform(view.scale, 0, 0, view.scale, view.x - originX * view.scale, view.y - originY * view.scale);
    drawWorld(state);
    // Back to screen space for HUD and panels.
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      drawPanel('PALMTIDE ISLE', [
        'Pulau resort, dua geng, satu kurir: Raka.',
        'Jelajahi pulau, curi mobil, kabur dari polisi, selesaikan 6 misi.',
        'WASD jalan / mengemudi · E naik mobil · F pukul · Q mulai misi · P jeda',
        best > 0 ? 'Uang terbaik: $' + best : '',
      ].filter((line) => line !== ''), 'Tekan Spasi atau klik untuk mulai');
      return;
    }
    drawHud(state);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Jeda', ['Pulau menunggu. Ombak tidak.', 'M untuk suara: aktif'], 'Tekan P untuk lanjut');
    } else if (screen === SCREEN_OVER) {
      drawPanel('Raka Tumbang', [
        'Polisi atau geng berhasil menjatuhkanmu.',
        'Uang: $' + state.money + ' · Misi selesai: ' + state.missions.completed + '/' + MISSIONS.length,
        best > 0 ? 'Uang terbaik: $' + best : '',
      ].filter((line) => line !== ''), 'Tekan Spasi untuk bangkit lagi');
    } else if (screen === SCREEN_WIN) {
      drawPanel('PULAU MILIKMU!', [
        'Semua 6 misi selesai. Tide Runners dan Coral Kings kalah.',
        'Raka kini legenda Palmtide Isle.',
        'Uang: $' + state.money,
      ], 'Tekan Spasi untuk bermain lagi');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
