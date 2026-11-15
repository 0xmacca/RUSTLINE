// rounds.js — RUSTLINE round flow, shop and economy.
// Original code for the threejs-fps-02 entry. No simulation randomness here:
// all outcomes come from state, dt and the bomb result passed in.
import { giveWeapon } from './weapon.js';

export const SHOP = [
  { id: 'vk7', name: 'VK-7 rifle', price: 2700, desc: 'Long-range automatic rifle' },
  { id: 'kestrel', name: 'Kestrel SMG', price: 1500, desc: 'Fast close-range SMG' },
  { id: 'grenade', name: 'Frag grenade', price: 300, desc: 'One frag grenade (throw with G)' },
  { id: 'armor', name: 'Kevlar armour', price: 650, desc: '+50 armour' },
  { id: 'smoke', name: 'Smoke grenade', price: 250, desc: 'Smoke grenade (throw with F)' },
];

const FREEZE_TIME = 5;
const LIVE_TIME = 100;
const END_TIME = 4;
const WIN_ROUNDS = 8;
const MAX_ROUNDS = 15;
const WIN_MONEY = 3250;
const LOSE_MONEY = 1900;

export function startFreeze(state) {
  state.phase = 'freeze';
  state.phaseTime = FREEZE_TIME;
  state.roundWinner = null;
  state.roundReason = null;
}

function aliveCount(state, team) {
  let n = 0;
  const all = [state.player].concat(state.bots || []);
  for (const f of all) {
    if (f && f.team === team && f.alive) n += 1;
  }
  return n;
}

export function awardRoundEnd(state, winner, reason) {
  if (winner === 'vanguard') state.score.vanguard += 1;
  else if (winner === 'sentinel') state.score.sentinel += 1;
  state.money += winner === 'vanguard' ? WIN_MONEY : LOSE_MONEY;
}

// Score the round, move to the 'ended' phase, and report the outcome.
// Returns matchEnd instead of roundEnd once the match is decided.
// Money follows the round winner (3250 Vanguard / 1900 Sentinels) per spec.
function endRound(state, winner, reason) {
  awardRoundEnd(state, winner, reason);
  state.roundWinner = winner;
  state.roundReason = reason;
  state.phase = 'ended';
  state.phaseTime = END_TIME;
  const v = state.score.vanguard;
  const s = state.score.sentinel;
  if (v >= WIN_ROUNDS || s >= WIN_ROUNDS || state.round >= MAX_ROUNDS) {
    if (v >= WIN_ROUNDS) state.winner = 'vanguard';
    else if (s >= WIN_ROUNDS) state.winner = 'sentinel';
    else state.winner = v >= s ? 'vanguard' : 'sentinel';
    return { type: 'matchEnd', winner: state.winner };
  }
  return { type: 'roundEnd', winner, reason };
}

export function stepRounds(state, dt, bombResult) {
  if (state.phase === 'freeze') {
    state.phaseTime -= dt;
    if (state.phaseTime <= 0) {
      state.phase = 'live';
      state.phaseTime = LIVE_TIME;
      return { type: 'roundStart', round: state.round };
    }
    return null;
  }
  if (state.phase === 'live') {
    state.phaseTime -= dt;
    if (bombResult === 'detonated') return endRound(state, 'vanguard', 'detonation');
    if (bombResult === 'defused') return endRound(state, 'sentinel', 'defuse');
    const v = aliveCount(state, 'vanguard');
    const s = aliveCount(state, 'sentinel');
    if (v === 0 && s === 0) {
      const planted = state.bomb && state.bomb.planted;
      return endRound(state, planted ? 'vanguard' : 'sentinel', 'elimination');
    }
    if (v === 0) return endRound(state, 'sentinel', 'elimination');
    if (s === 0) return endRound(state, 'vanguard', 'elimination');
    // Time only ends the round while the bomb is not planted; once it is
    // planted the bomb timer (via bombResult) decides the round.
    if (state.phaseTime <= 0 && !(state.bomb && state.bomb.planted)) {
      return endRound(state, 'sentinel', 'time');
    }
    if (state.phaseTime < 0) state.phaseTime = 0;
    return null;
  }
  if (state.phase === 'ended') {
    // After a matchEnd the match is over: never advance to another round.
    if (state.winner) return null;
    state.phaseTime -= dt;
    if (state.phaseTime <= 0) {
      state.round += 1;
      return { type: 'nextRound', round: state.round };
    }
    return null;
  }
  return null;
}

export function buyItem(state, id) {
  const item = SHOP.find((s) => s.id === id);
  if (!item || !state.player) return false;
  if (state.money < item.price) return false;
  if (id === 'grenade') {
    state.player.grenades = Math.min(2, state.player.grenades + 1);
  } else if (id === 'smoke') {
    state.player.smokes = Math.min(2, state.player.smokes + 1);
  } else if (id === 'armor') {
    state.player.armor = Math.min(100, state.player.armor + 50);
  } else {
    giveWeapon(state.player, id);
  }
  state.money -= item.price;
  return true;
}
