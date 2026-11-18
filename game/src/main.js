// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between five screens: title, play,
// paused, game over and win. One-shot presses are split here: confirm and
// pause drive the screens, while enter-car, punch and interact are handed to
// the world step, which consumes them — a press is never lost between frames,
// and a press while paused is put back for the next step.
//
// ?seed=N fixes the island. ?shot=chase|drive|market|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_MISSION, EVENT_MONEY, EVENT_OVER, EVENT_WANTED } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER_CAR, ACTION_INTERACT, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { MISSIONS } from './missions.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
const SAVE_EVERY = 5;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
// Exposed for playtesting and debugging in the browser console.
window.__palmtide = world;

function readJson(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best money then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;
  let pendingPlayActions = 0;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM' && !event.repeat) {
      const muted = !audioMuted;
      audioMuted = muted;
      audio.setEnabled(!muted);
    }
  });
  let audioMuted = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function saveNow() {
    writeJson(SAVE_KEY, world.makeSave());
    if (world.state.money > best) {
      best = world.state.money;
      saveBest(best);
    }
  }

  function startGame() {
    world.reset();
    const save = readJson(SAVE_KEY);
    if (save) world.loadSave(save);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Palmtide Isle. Selesaikan misi, kumpulkan uang, hindari polisi.');
  }

  function endGame() {
    saveNow();
    screen = SCREEN_OVER;
    announce(`Raka tumbang. Uang $${world.state.money}. Misi selesai ${world.state.missions.completed} dari ${MISSIONS.length}.`);
  }

  function winGame() {
    saveNow();
    screen = SCREEN_WIN;
    announce('Semua misi selesai! Pulau ini milikmu, Raka.');
  }

  function respawn() {
    const p = world.state.player;
    p.health = 100;
    world.state.wanted = 0;
    world.state.police = [];
    p.inCar = null;
    p.x = 900;
    p.y = 750;
    p.angle = -Math.PI / 2;
    world.state.camera.x = p.x;
    world.state.camera.y = p.y;
    screen = SCREEN_PLAY;
    announce('Raka bangkit lagi di Klinik Pantai.');
  }

  function handleScreenActions(actions) {
    const screenActions = actions & (ACTION_CONFIRM | ACTION_PAUSE);
    pendingPlayActions |= actions & (ACTION_ENTER_CAR | ACTION_PUNCH | ACTION_INTERACT);
    if (screenActions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN)) {
      if (screen === SCREEN_OVER) respawn();
      else startGame();
    } else if (screenActions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Jeda.');
    } else if (screenActions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Lanjut.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: 0, y: 0 }, 0, true, false);
      return;
    }
    const actions = pendingPlayActions;
    pendingPlayActions = 0;
    const events = world.step(STEP, input.move(), actions, false, input.running());
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_WANTED) audio.wantedUp();
    else if (events & EVENT_MONEY) audio.coin();
    else if (events & EVENT_MISSION) {
      audio.mission();
      saveNow();
      if (world.state.missions.completed >= MISSIONS.length) winGame();
    }
    if (events & 1) audio.punch();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleScreenActions(input.takeActions());
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
      // A press made while paused is kept for the step that runs after resume.
      if (pendingPlayActions) input.putBack(pendingPlayActions);
      pendingPlayActions = 0;
    }
    saveTimer += STEP;
    if (saveTimer >= SAVE_EVERY && screen === SCREEN_PLAY) {
      saveTimer = 0;
      saveNow();
    }
    const p = world.state.player;
    audio.engine(p.inCar ? Math.abs(p.inCar.speed) / 560 : 0);
    audio.siren(world.state.wanted >= 3 && screen === SCREEN_PLAY, world.state.waveTime);
    audio.music(STEP);
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting the island run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Jeda.');
    }
  });

  announce('Palmtide Isle. Tekan Spasi atau klik untuk mulai.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
