// The screenshot scenes behind ?shot=chase|drive|market|mission. Each one drives
// the real world forward from a fresh reset — the player really drives, the
// police really chase, the mission really runs — so the frame is what a short
// game really looks like, and the same seed always gives the same frame.

import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const IDLE_SECONDS = 4;

/** Drive forward in a straight line for `seconds`, at fixed steps. */
function driveForward(world, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, { x: 0, y: -1 }, 0, false, false);
  }
}

/** Walk toward a point for `seconds`, steering around nothing in particular. */
function walkToward(world, tx, ty, seconds) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const p = world.state.player;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy) || 1;
    world.step(STEP, { x: dx / d, y: dy / d }, 0, false, false);
    if (d < 40) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it and the
 * best money to show. Unknown names stage the title screen.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name === 'chase') {
    // Cover: a police chase on the coast road, wanted 3, mission 2 running,
    // the courier ahead, the minimap and the objective all on screen.
    world.putPlayerInCar(1500, 2000, 0);
    world.addWanted(3);
    world.startMissionById(2);
    state.money = 1250;
    driveForward(world, 3);
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    return { screen: SCREEN_PLAY, best: 1250 };
  }
  if (name === 'drive') {
    // Cruising the beach road in a stolen convertible, mission 1 running.
    world.putPlayerInCar(900, 1000, 0);
    world.startMissionById(1);
    state.money = 650;
    driveForward(world, 4);
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    return { screen: SCREEN_PLAY, best: 650 };
  }
  if (name === 'market') {
    // On foot in the night market, stalls and pedestrians all around.
    state.player.x = 1560;
    state.player.y = 1420;
    state.player.angle = Math.PI / 2;
    state.money = 900;
    walkToward(world, 1700, 1300, 3);
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    return { screen: SCREEN_PLAY, best: 900 };
  }
  if (name === 'mission') {
    // Mission 4: the warehouse fight — Raka walks into the Coral Kings and
    // throws punches, enemies closing in with health bars showing.
    state.player.x = 460;
    state.player.y = 1180;
    state.player.angle = Math.PI;
    world.startMissionById(4);
    state.money = 1400;
    for (let i = 0; i < 200; i += 1) {
      const punch = i % 26 === 13 ? 8 : 0;
      world.step(STEP, { x: -1, y: 0 }, punch, false, false);
      const p = state.player;
      if (Math.hypot(p.x - 300, p.y - 1180) < 60) break;
    }
    state.camera.x = state.player.x;
    state.camera.y = state.player.y;
    return { screen: SCREEN_PLAY, best: 1400 };
  }
  // Title backdrop: the island alive behind the panel.
  for (let i = 0; i < IDLE_SECONDS / STEP; i += 1) {
    world.step(STEP, { x: 0, y: 0 }, 0, true, false);
  }
  return { screen: SCREEN_TITLE, best: 0 };
}
