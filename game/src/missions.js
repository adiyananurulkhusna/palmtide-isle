// The story of Palmtide Isle: six missions for Raka, a harbour courier caught
// between the Tide Runners and the Coral Kings. Each mission is a small state
// machine: a start point, steps with a target and a hint, and a cash reward.
// Missions are unlocked in order; progress is saved between visits.

import { MISSION_REWARDS } from './config.js';

export const MISSIONS = [
  {
    id: 1,
    title: 'Paket Pertama',
    giver: 'Mara, pemilik Bar Pantai Ombak',
    intro: 'Antar paket es kelapa dari pelabuhan ke Bar Pantai Ombak. Jangan sampai basah.',
    steps: [
      { kind: 'goto', x: 300, y: 1500, hint: 'Ambil paket di Pelabuhan Palmtide' },
      { kind: 'goto', x: 3150, y: 2150, hint: 'Antar paket ke Bar Pantai Ombak' },
    ],
  },
  {
    id: 2,
    title: 'Kejar Kurir',
    giver: 'Mara',
    intro: 'Kurir Tide Runners kabur dengan paketmu. Kejar mobilnya dan tabrak sampai berhenti.',
    steps: [
      { kind: 'chase', hint: 'Kejar mobil kurir Tide Runners dan tabrak dia' },
    ],
  },
  {
    id: 3,
    title: 'Selamatkan Wisatawan',
    giver: 'Penjaga Pantai Lani',
    intro: 'Dua wisatawan terseret ombak di pantai timur. Capai mereka sebelum waktu habis!',
    steps: [
      { kind: 'timed', x: 3300, y: 2250, seconds: 75, hint: 'Capai wisatawan di pantai timur — cepat!' },
    ],
  },
  {
    id: 4,
    title: 'Gudang Pelabuhan',
    giver: 'Mara',
    intro: 'Coral Kings menyimpan barang curian di gudang pelabuhan. Lumpuhkan 3 penjaga dan ambil petinya.',
    steps: [
      { kind: 'fight', x: 300, y: 1180, count: 3, hint: 'Lumpuhkan 3 penjaga gudang (pukul dengan F)' },
      { kind: 'goto', x: 300, y: 1180, hint: 'Ambil peti barang curian di gudang' },
    ],
  },
  {
    id: 5,
    title: 'Balapan Senja',
    giver: 'Dito, pembalap jalanan',
    intro: 'Buktikan kamu pembalap tercepat di Palmtide. Lewati 4 titik balapan sebelum senja.',
    steps: [
      { kind: 'race', points: [[600, 500], [2400, 500], [2400, 2000], [600, 2000]], hint: 'Lewati titik balapan 1/4' },
    ],
  },
  {
    id: 6,
    title: 'Perebutan Dermaga',
    giver: 'Mara',
    intro: 'Malam penentuan: usir 5 anggota Coral Kings dari Dermaga Timur dan rebut pulau ini kembali.',
    steps: [
      { kind: 'fight', x: 3300, y: 800, count: 5, hint: 'Usir 5 anggota Coral Kings dari dermaga (F untuk memukul)' },
      { kind: 'goto', x: 3300, y: 800, hint: 'Ambil peti harta di ujung dermaga' },
    ],
  },
];

export function missionStartPoint(mission, island) {
  if (mission.id === 1) return island.landmarks.port;
  if (mission.id === 2) return island.landmarks.market;
  if (mission.id === 3) return island.landmarks.beachBar;
  if (mission.id === 4) return island.landmarks.port;
  if (mission.id === 5) return island.landmarks.market;
  return island.landmarks.pier;
}

export function createMissionState(completedCount) {
  return {
    completed: completedCount,
    active: null, // { mission, stepIndex, timer, raceIndex, defeated, target }
    message: '',
    messageTimer: 0,
  };
}

export function nextMission(missions) {
  return missions.completed < MISSIONS.length ? MISSIONS[missions.completed] : null;
}

export function startMission(missions, mission) {
  const first = mission.steps[0];
  missions.active = {
    mission,
    stepIndex: 0,
    timer: first.kind === 'timed' ? first.seconds : 0,
    raceIndex: 0,
    defeated: 0,
    target: null,
  };
  missions.message = `Misi ${mission.id}: ${mission.title} dimulai!`;
  missions.messageTimer = 6;
}

export function currentStep(missions) {
  if (!missions.active) return null;
  return missions.active.mission.steps[missions.active.stepIndex];
}

export function stepHint(missions) {
  const step = currentStep(missions);
  if (!step) return '';
  if (step.kind === 'race') {
    return `Lewati titik balapan ${missions.active.raceIndex + 1}/${step.points.length}`;
  }
  if (step.kind === 'fight') {
    return `${step.hint} (${missions.active.defeated}/${step.count})`;
  }
  return step.hint;
}

/** Advance the active mission one step; returns the reward when finished, else 0. */
export function advanceStep(missions) {
  const active = missions.active;
  active.stepIndex += 1;
  if (active.stepIndex >= active.mission.steps.length) {
    const reward = MISSION_REWARDS[active.mission.id - 1];
    missions.completed += 1;
    missions.active = null;
    missions.message = `Misi selesai! +$${reward}`;
    missions.messageTimer = 5;
    return reward;
  }
  const step = active.mission.steps[active.stepIndex];
  if (step.kind === 'timed') active.timer = step.seconds;
  missions.message = step.hint;
  missions.messageTimer = 4;
  return 0;
}

export function failMission(missions, reason) {
  missions.active = null;
  missions.message = reason;
  missions.messageTimer = 5;
}
