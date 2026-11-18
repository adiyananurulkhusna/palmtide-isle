// The game's rules and state, with no drawing and no browser in it: the player
// on foot and in cars, traffic and pedestrians, police and wanted, combat, the
// six missions, money and saving. step() advances one fixed step and returns
// what happened as bit flags, so the caller can react without the world knowing
// about screens or sound. Wanted is clamped to 0..5 on every change, and the
// number of police cars on the map is always exactly the wanted level.

import { CAR, PEDS, PLAYER, POLICE, TRAFFIC, WANTED, WORLD } from './config.js';
import { buildIsland, clampToWorld, collideBuildings, ROADS_X, ROADS_Y } from './island.js';
import { advanceStep, createMissionState, currentStep, failMission, MISSIONS, nextMission, startMission } from './missions.js';
import { pick, range } from './random.js';

export const EVENT_HIT = 1;
export const EVENT_MONEY = 2;
export const EVENT_OVER = 4;
export const EVENT_MISSION = 8;
export const EVENT_WANTED = 16;

const CAR_COLOURS = ['#e2574c', '#2f7fc4', '#f2c94c', '#7a5fb0', '#ff8c42', '#3fb8a6', '#e8e8e8', '#4fc3f7'];
const PED_SHIRTS = ['#ff7b54', '#4fc3f7', '#f2c94c', '#8e2de2', '#3fb8a6', '#ff5d8f', '#ffffff', '#7a5fb0'];

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function clampWanted(value) {
  return Math.max(WANTED.min, Math.min(WANTED.max, Math.round(value)));
}

export function createWorld(random) {
  const island = buildIsland(random);
  const state = {
    island,
    player: { x: 1750, y: 1600, angle: -Math.PI / 2, health: PLAYER.health, inCar: null, punchCooldown: 0, punchAnim: 0, speed: 0 },
    cars: [],
    peds: [],
    police: [],
    enemies: [],
    pickups: [],
    courier: null,
    money: 250,
    wanted: 0,
    wantedTimer: 0,
    crimeCooldown: 0,
    elapsed: 0,
    waveTime: 0,
    missions: createMissionState(0),
    stats: { carsStolen: 0, missionsDone: 0 },
    camera: { x: 1750, y: 1600 },
  };

  function spawnTrafficCar() {
    const horizontal = random() < 0.5;
    const road = horizontal ? pick(random, ROADS_Y) : pick(random, ROADS_X);
    const pos = range(random, 200, (horizontal ? WORLD.width : WORLD.height) - 200);
    const dir = random() < 0.5 ? 1 : -1;
    return {
      kind: 'traffic',
      x: horizontal ? pos : road + (dir > 0 ? 22 : -22),
      y: horizontal ? road + (dir > 0 ? 22 : -22) : pos,
      angle: horizontal ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      speed: range(random, TRAFFIC.minSpeed, TRAFFIC.maxSpeed),
      cruise: range(random, TRAFFIC.minSpeed, TRAFFIC.maxSpeed),
      axis: horizontal ? 'h' : 'v',
      road,
      dir,
      colour: pick(random, CAR_COLOURS),
      health: CAR.health,
      driver: true,
      ramCooldown: 0,
    };
  }

  function spawnParkedCar() {
    const horizontal = random() < 0.5;
    const road = horizontal ? pick(random, ROADS_Y) : pick(random, ROADS_X);
    const pos = range(random, 300, (horizontal ? WORLD.width : WORLD.height) - 300);
    return {
      kind: 'parked',
      x: horizontal ? pos : road + 30,
      y: horizontal ? road + 30 : pos,
      angle: horizontal ? 0 : Math.PI / 2,
      speed: 0,
      cruise: 0,
      axis: horizontal ? 'h' : 'v',
      road,
      dir: 1,
      colour: pick(random, CAR_COLOURS),
      health: CAR.health,
      driver: false,
      ramCooldown: 0,
    };
  }

  function spawnPed() {
    return {
      x: range(random, 200, WORLD.width - 200),
      y: range(random, 200, WORLD.height - 200),
      tx: 0, ty: 0, speed: range(random, PEDS.minSpeed, PEDS.maxSpeed),
      shirt: pick(random, PED_SHIRTS),
      wait: 0, flee: 0, angle: 0, hitCooldown: 0,
    };
  }

  function spawnPickup() {
    return { x: range(random, 200, WORLD.width - 200), y: range(random, 200, WORLD.height - 200), taken: false, bob: random() * Math.PI * 2, value: 25 };
  }

  function reset() {
    const p = state.player;
    p.x = 1750; p.y = 1600; p.angle = -Math.PI / 2;
    p.health = PLAYER.health; p.inCar = null; p.punchCooldown = 0; p.punchAnim = 0; p.speed = 0;
    state.cars = [];
    for (let i = 0; i < TRAFFIC.count; i += 1) state.cars.push(spawnTrafficCar());
    for (let i = 0; i < 6; i += 1) state.cars.push(spawnParkedCar());
    state.peds = [];
    for (let i = 0; i < PEDS.count; i += 1) {
      const ped = spawnPed();
      ped.tx = ped.x; ped.ty = ped.y;
      state.peds.push(ped);
    }
    state.police = [];
    state.enemies = [];
    state.pickups = [];
    for (let i = 0; i < 12; i += 1) state.pickups.push(spawnPickup());
    state.courier = null;
    state.money = 250;
    state.wanted = 0;
    state.wantedTimer = 0;
    state.crimeCooldown = 0;
    state.elapsed = 0;
    state.waveTime = 0;
    state.missions = createMissionState(0);
    state.stats = { carsStolen: 0, missionsDone: 0 };
    state.camera.x = p.x;
    state.camera.y = p.y;
  }

  function addWanted(amount) {
    const before = state.wanted;
    state.wanted = clampWanted(state.wanted + amount);
    state.wantedTimer = 0;
    return state.wanted !== before;
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (const car of state.cars) {
      if (car.kind === 'police') continue;
      const d = dist2(x, y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function spawnEnemies(count, x, y) {
    state.enemies = [];
    for (let i = 0; i < count; i += 1) {
      state.enemies.push({
        x: x + range(random, -90, 90),
        y: y + range(random, -90, 90),
        angle: 0, health: 100, speed: range(random, 95, 130),
        punchCooldown: 0, hitFlash: 0, dead: false,
      });
    }
  }

  function spawnCourier() {
    const p = state.player;
    const road = pick(random, ROADS_Y);
    state.courier = {
      kind: 'courier',
      x: p.x + 260, y: road,
      angle: 0, speed: 300, cruise: 330,
      axis: 'h', road, dir: 1,
      colour: '#8e2de2', health: 100, driver: true, ramCooldown: 0,
    };
    state.cars.push(state.courier);
  }

  function beginStep(step) {
    if (step.kind === 'fight') spawnEnemies(step.count, step.x, step.y);
    if (step.kind === 'chase') spawnCourier();
  }

  function punch() {
    const p = state.player;
    if (p.punchCooldown > 0) return 0;
    p.punchCooldown = PLAYER.punchCooldown;
    p.punchAnim = 0.22;
    let events = 0;
    const px = p.x + Math.cos(p.angle) * 26;
    const py = p.y + Math.sin(p.angle) * 26;
    // Hit enemies first (gang fights are the mission, not a crime).
    for (const e of state.enemies) {
      if (e.dead) continue;
      if (dist2(px, py, e.x, e.y) < PLAYER.punchRange * PLAYER.punchRange) {
        e.health -= PLAYER.punchDamage;
        e.hitFlash = 0.2;
        if (e.health <= 0) {
          e.dead = true;
          if (state.missions.active) state.missions.active.defeated += 1;
        }
        events |= EVENT_HIT;
      }
    }
    // Hit a police car: three punches disable it.
    for (const car of state.police) {
      if (car.disabled) continue;
      if (dist2(px, py, car.x, car.y) < 70 * 70) {
        car.punchHits = (car.punchHits || 0) + 1;
        if (car.punchHits >= POLICE.punchHits) car.disabled = true;
        addWanted(1);
        events |= EVENT_WANTED;
      }
    }
    // Hitting a bystander is a crime.
    for (const ped of state.peds) {
      if (dist2(px, py, ped.x, ped.y) < PLAYER.punchRange * PLAYER.punchRange) {
        ped.flee = 3;
        if (state.crimeCooldown <= 0) {
          addWanted(1);
          state.crimeCooldown = 2;
          events |= EVENT_WANTED;
        }
      }
    }
    return events;
  }

  function enterCar() {
    const p = state.player;
    if (p.inCar) {
      const car = p.inCar;
      p.inCar = null;
      p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 46;
      p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 46;
      p.angle = car.angle;
      return 0;
    }
    const car = nearestCar(p.x, p.y, 85);
    if (!car) return 0;
    let events = 0;
    if (car.kind === 'traffic' && car.driver) {
      car.driver = false;
      state.stats.carsStolen += 1;
      if (addWanted(CAR.stealWanted)) events |= EVENT_WANTED;
      // The driver flees on foot.
      const ped = spawnPed();
      ped.x = car.x + 40; ped.y = car.y + 40; ped.flee = 4;
      state.peds.push(ped);
    }
    car.kind = 'player';
    p.inCar = car;
    return events;
  }

  function startMissionIfNear() {
    if (state.missions.active) return 0;
    const mission = nextMission(state.missions);
    if (!mission) return 0;
    const lm = missionStartPoint(mission);
    const p = state.player;
    if (dist2(p.x, p.y, lm.x, lm.y) > 110 * 110) return 0;
    startMission(state.missions, mission);
    beginStep(mission.steps[0]);
    return EVENT_MISSION;
  }

  function driveCar(car, dt, move) {
    const forwardX = Math.cos(car.angle);
    const forwardY = Math.sin(car.angle);
    let speed = car.speed;
    if (move.y < 0) speed += CAR.accel * dt;
    else if (move.y > 0) speed -= CAR.reverseAccel * dt;
    else speed -= Math.sign(speed) * Math.min(Math.abs(speed), CAR.drag * 260 * dt);
    speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, speed));
    const steer = move.x * CAR.turnRate * (speed >= 0 ? 1 : -1) * Math.min(1, Math.abs(speed) / 160 + 0.25);
    car.angle += steer * dt;
    car.x += Math.cos(car.angle) * speed * dt;
    car.y += Math.sin(car.angle) * speed * dt;
    car.speed = speed;
    void forwardX; void forwardY;
    // Buildings stop the car; a hard hit hurts and slows it.
    const body = { x: car.x, y: car.y };
    if (collideBuildings(state.island.buildings, body, 30)) {
      if (Math.abs(speed) > 260) {
        state.player.health = Math.max(0, state.player.health - 6);
      }
      car.speed *= -0.25;
      car.x = body.x;
      car.y = body.y;
    }
    clampToWorld(car, 240);
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic' && car.kind !== 'courier') continue;
      if (car.kind === 'courier') {
        // The courier flees along the coast road, faster than traffic.
        car.speed = Math.min(430, car.speed + 120 * dt);
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;
        if (car.x > WORLD.width - 200) { car.angle = Math.PI; car.y = pick(random, ROADS_Y); }
        if (car.x < 200) { car.angle = 0; car.y = pick(random, ROADS_Y); }
        continue;
      }
      car.speed = car.cruise;
      // Slow down for the car ahead on the same road.
      for (const other of state.cars) {
        if (other === car || other.axis !== car.axis || other.road !== car.road || other.dir !== car.dir) continue;
        const along = car.axis === 'h' ? (other.x - car.x) * car.dir : (other.y - car.y) * car.dir;
        const side = car.axis === 'h' ? Math.abs(other.y - car.y) : Math.abs(other.x - car.x);
        if (along > 0 && along < 90 && side < 50) car.speed = Math.min(car.speed, other.speed * 0.6);
      }
      if (car.axis === 'h') car.x += car.dir * car.speed * dt;
      else car.y += car.dir * car.speed * dt;
      // At an intersection, sometimes turn onto the crossing road.
      const cross = car.axis === 'h' ? ROADS_X : ROADS_Y;
      for (const c of cross) {
        const along = car.axis === 'h' ? car.x : car.y;
        if (Math.abs(along - c) < car.speed * dt + 2 && random() < 0.12) {
          car.axis = car.axis === 'h' ? 'v' : 'h';
          car.road = c;
          car.dir = random() < 0.5 ? 1 : -1;
          car.angle = car.axis === 'h' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
          if (car.axis === 'h') car.y = c + (car.dir > 0 ? 22 : -22);
          else car.x = c + (car.dir > 0 ? 22 : -22);
          break;
        }
      }
      // Wrap around the far end of the road instead of piling up.
      if (car.axis === 'h' && (car.x < 240 || car.x > WORLD.width - 240)) car.dir *= -1;
      if (car.axis === 'v' && (car.y < 240 || car.y > WORLD.height - 240)) car.dir *= -1;
      car.angle = car.axis === 'h' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
  }

  function stepPeds(dt) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.hitCooldown > 0) ped.hitCooldown -= dt;
      if (ped.flee > 0) {
        ped.flee -= dt;
        const dx = ped.x - p.x;
        const dy = ped.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        ped.x += (dx / d) * ped.speed * 1.8 * dt;
        ped.y += (dy / d) * ped.speed * 1.8 * dt;
        ped.angle = Math.atan2(dy, dx);
      } else {
        if (ped.wait > 0) {
          ped.wait -= dt;
        } else {
          const dx = ped.tx - ped.x;
          const dy = ped.ty - ped.y;
          const d = Math.hypot(dx, dy);
          if (d < 12) {
            ped.tx = range(random, 200, WORLD.width - 200);
            ped.ty = range(random, 200, WORLD.height - 200);
            ped.wait = range(random, 0, 3);
          } else {
            ped.x += (dx / d) * ped.speed * dt;
            ped.y += (dy / d) * ped.speed * dt;
            ped.angle = Math.atan2(dy, dx);
          }
        }
      }
      collideBuildings(state.island.buildings, ped, 14);
      clampToWorld(ped, 130);
    }
  }

  function stepPolice(dt) {
    const p = state.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    // The number of police cars is always exactly the wanted level (0..5).
    while (state.police.length < state.wanted) {
      const angle = random() * Math.PI * 2;
      state.police.push({
        kind: 'police',
        x: px + Math.cos(angle) * 700,
        y: py + Math.sin(angle) * 700,
        angle: 0, speed: 0, cruise: 0, axis: 'h', road: 0, dir: 1,
        colour: '#1c4fd7', health: CAR.health, driver: true,
        ramCooldown: 0, punchHits: 0, disabled: false, disableTimer: 0,
      });
    }
    while (state.police.length > state.wanted) state.police.pop();
    for (const car of state.police) {
      if (car.ramCooldown > 0) car.ramCooldown -= dt;
      if (car.disabled) {
        car.disableTimer += dt;
        car.speed = 0;
        if (car.disableTimer > 6) {
          car.disabled = false;
          car.disableTimer = 0;
          car.punchHits = 0;
          const angle = random() * Math.PI * 2;
          car.x = px + Math.cos(angle) * 700;
          car.y = py + Math.sin(angle) * 700;
        }
        continue;
      }
      const dx = px - car.x;
      const dy = py - car.y;
      const d = Math.hypot(dx, dy) || 1;
      const target = Math.atan2(dy, dx);
      let diff = target - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      car.angle += Math.max(-2.8 * dt, Math.min(2.8 * dt, diff));
      // Ease off when right on the player's bumper, so the chase stays a
      // chase instead of a constant pile-up: a 30-second chase is survivable.
      const chaseSpeed = d < 90 ? 320 : POLICE.maxSpeed;
      car.speed = Math.min(chaseSpeed, car.speed + POLICE.accel * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      clampToWorld(car, 240);
      // Ram: small, capped damage with a cooldown, so a 30-second chase is survivable.
      if (d < 62 && car.ramCooldown <= 0) {
        car.ramCooldown = POLICE.ramCooldown;
        car.speed *= 0.4;
        state.player.health = Math.max(0, state.player.health - POLICE.ramDamage);
      }
    }
  }

  function stepEnemies(dt) {
    const p = state.player;
    for (const e of state.enemies) {
      if (e.dead) continue;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.punchCooldown > 0) e.punchCooldown -= dt;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d < 320) {
        e.angle = Math.atan2(dy, dx);
        if (d > 34) {
          e.x += Math.cos(e.angle) * e.speed * dt;
          e.y += Math.sin(e.angle) * e.speed * dt;
        } else if (e.punchCooldown <= 0 && !p.inCar) {
          e.punchCooldown = 1.0;
          state.player.health = Math.max(0, state.player.health - 8);
        }
      }
      collideBuildings(state.island.buildings, e, 14);
    }
    state.enemies = state.enemies.filter((e) => !e.dead || e.hitFlash > 0);
  }

  function stepMissions(dt) {
    const missions = state.missions;
    if (missions.messageTimer > 0) missions.messageTimer -= dt;
    const active = missions.active;
    if (!active) return 0;
    const step = currentStep(missions);
    if (!step) return 0;
    const p = state.player;
    const px = p.inCar ? p.inCar.x : p.x;
    const py = p.inCar ? p.inCar.y : p.y;
    if (step.kind === 'timed') {
      active.timer -= dt;
      if (active.timer <= 0) {
        failMission(missions, 'Waktu habis! Misi gagal — bicara lagi dengan pemberi misi (Q).');
        return EVENT_MISSION;
      }
      if (dist2(px, py, step.x, step.y) < 80 * 80) {
        const reward = advanceStep(missions);
        if (reward > 0) { state.money += reward; state.stats.missionsDone += 1; }
        return EVENT_MISSION;
      }
    } else if (step.kind === 'goto') {
      if (dist2(px, py, step.x, step.y) < 80 * 80) {
        const reward = advanceStep(missions);
        if (reward > 0) { state.money += reward; state.stats.missionsDone += 1; }
        else beginStep(currentStep(missions));
        return EVENT_MISSION;
      }
    } else if (step.kind === 'chase') {
      if (state.courier && state.courier.health <= 0) {
        const reward = advanceStep(missions);
        if (reward > 0) { state.money += reward; state.stats.missionsDone += 1; }
        return EVENT_MISSION;
      }
    } else if (step.kind === 'fight') {
      if (active.defeated >= step.count) {
        const reward = advanceStep(missions);
        if (reward > 0) { state.money += reward; state.stats.missionsDone += 1; }
        return EVENT_MISSION;
      }
    } else if (step.kind === 'race') {
      const point = step.points[active.raceIndex];
      if (point && dist2(px, py, point[0], point[1]) < 95 * 95) {
        active.raceIndex += 1;
        if (active.raceIndex >= step.points.length) {
          const reward = advanceStep(missions);
          if (reward > 0) { state.money += reward; state.stats.missionsDone += 1; }
          return EVENT_MISSION;
        }
        missions.message = `Titik balapan ${active.raceIndex + 1}/${step.points.length}`;
        missions.messageTimer = 2;
      }
    }
    return 0;
  }

  /**
   * One fixed step. `move` is the normalised input vector, `actions` the queued
   * one-shot flags; the step consumes them, so a press is never lost. `attract`
   * runs the title-screen backdrop: traffic moves, nothing can hurt the player.
   */
  function step(dt, move, actions, attract, running) {
    let events = 0;
    state.elapsed += dt;
    state.waveTime += dt;
    const p = state.player;
    if (p.punchCooldown > 0) p.punchCooldown -= dt;
    if (p.punchAnim > 0) p.punchAnim -= dt;
    if (state.crimeCooldown > 0) state.crimeCooldown -= dt;

    if (!attract) {
      if (actions & 4) events |= enterCar(); // ACTION_ENTER_CAR
      if (actions & 8) events |= punch(); // ACTION_PUNCH
      if (actions & 16) events |= startMissionIfNear(); // ACTION_INTERACT
    }

    if (p.inCar) {
      driveCar(p.inCar, dt, move);
      p.x = p.inCar.x;
      p.y = p.inCar.y;
      p.angle = p.inCar.angle;
      p.speed = Math.abs(p.inCar.speed);
      // Ramming the courier damages it; ramming traffic damages both cars.
      for (const car of state.cars) {
        if (car === p.inCar || car.kind === 'parked') continue;
        const d = Math.hypot(car.x - p.inCar.x, car.y - p.inCar.y);
        if (d < 58 && Math.abs(p.inCar.speed) > 200) {
          if (car.kind === 'courier') car.health -= 34;
          else car.speed *= 0.5;
          p.inCar.speed *= 0.55;
        }
      }
      // Running over a pedestrian at speed is a crime.
      for (const ped of state.peds) {
        if (ped.hitCooldown > 0) continue;
        if (dist2(p.inCar.x, p.inCar.y, ped.x, ped.y) < 55 * 55 && Math.abs(p.inCar.speed) > 120) {
          ped.hitCooldown = 3;
          ped.flee = 4;
          if (state.crimeCooldown <= 0) {
            addWanted(1);
            state.crimeCooldown = 2;
            events |= EVENT_WANTED;
          }
        }
      }
    } else {
      const speed = move.x !== 0 || move.y !== 0 ? (running ? PLAYER.runSpeed : PLAYER.walkSpeed) : 0;
      if (speed > 0) p.angle = Math.atan2(move.y, move.x);
      p.x += move.x * speed * dt;
      p.y += move.y * speed * dt;
      p.speed = speed;
      collideBuildings(state.island.buildings, p, PLAYER.radius);
      clampToWorld(p, 130);
      // Pick up cash on foot.
      for (const pickup of state.pickups) {
        if (!pickup.taken && dist2(p.x, p.y, pickup.x, pickup.y) < 40 * 40) {
          pickup.taken = true;
          state.money += pickup.value;
          events |= EVENT_MONEY;
        }
      }
    }

    stepTraffic(dt);
    stepPeds(dt);
    if (!attract) {
      stepPolice(dt);
      stepEnemies(dt);
      events |= stepMissions(dt);
      // Wanted decays after a quiet stretch.
      if (state.wanted > 0) {
        state.wantedTimer += dt;
        if (state.wantedTimer >= WANTED.decaySeconds) {
          state.wanted = clampWanted(state.wanted - 1);
          state.wantedTimer = 0;
        }
      }
      // Slow health regen while the police are not after you.
      if (state.wanted === 0 && p.health > 0 && p.health < PLAYER.health) {
        p.health = Math.min(PLAYER.health, p.health + 3 * dt);
      }
      if (p.health <= 0) events |= EVENT_OVER;
    }

    // Camera eases toward the player.
    state.camera.x += (p.x - state.camera.x) * Math.min(1, dt * 5);
    state.camera.y += (p.y - state.camera.y) * Math.min(1, dt * 5);
    return events;
  }

  function loadSave(save) {
    if (!save) return;
    state.money = save.money || 250;
    state.missions.completed = Math.min(MISSIONS.length, save.missionsCompleted || 0);
    state.stats = save.stats || state.stats;
  }

  function makeSave() {
    return {
      money: state.money,
      missionsCompleted: state.missions.completed,
      stats: state.stats,
    };
  }

  function missionStartPoint(mission) {
    const lm = state.island.landmarks;
    if (mission.id === 1) return lm.port;
    if (mission.id === 2) return lm.market;
    if (mission.id === 3) return lm.beachBar;
    if (mission.id === 4) return lm.port;
    if (mission.id === 5) return lm.market;
    return lm.pier;
  }

  function startMissionById(id) {
    const mission = MISSIONS.find((m) => m.id === id);
    if (!mission) return;
    state.missions.completed = id - 1;
    startMission(state.missions, mission);
    beginStep(mission.steps[0]);
  }

  function putPlayerInCar(x, y, angle) {
    const car = {
      kind: 'player', x, y, angle, speed: 0, cruise: 0,
      axis: 'h', road: y, dir: 1, colour: '#ff7b54',
      health: CAR.health, driver: true, ramCooldown: 0,
    };
    state.cars.push(car);
    state.player.inCar = car;
    state.player.x = x;
    state.player.y = y;
    state.player.angle = angle;
  }

  reset();
  return { state, reset, step, loadSave, makeSave, addWanted, missionStartPoint, startMissionById, putPlayerInCar };
}
