// RUSTLINE — the one state store. Every fighter, the match, the bomb and the
// killfeed live here and nowhere else; modules read and write this state and
// the render layer only mirrors it. Plain objects only — no three.js in here,
// so the simulation stays testable and free of the renderer.
import { WEAPONS } from './weapon.js';

/** The fixed simulation step, in seconds (60 Hz). */
export const TICK = 1 / 60;

/** A fighter: the player and every bot share this exact shape. x/y/z is the
 * feet position (y = height above the ground, 0 = standing on it). The eye
 * is the camera height above the feet. The head band is y+1.45..y+1.7. */
export function createFighter(id, team, kind) {
  return {
    id, team, kind,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0,
    eye: 1.62, health: 100, armor: 0, alive: true,
    crouched: false, onGround: true,
    weapon: 'p9', mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve,
    grenades: 0, smokes: 0, money: 0, kills: 0, deaths: 0,
    hasBomb: false, planting: 0, defusing: 0, flash: 0,
    lastShotAt: -99, speed2d: 0, spottedAt: -99,
  };
}

/** The match state. Phases: 'freeze' (buy, 5 s) -> 'live' (100 s) ->
 * 'ended' (banner, 4 s) -> next round's 'freeze'. bomb.planted is a flag
 * inside 'live'; the planted timer counts down from 35. */
export function createState() {
  return {
    time: 0, round: 1, phase: 'freeze', phaseTime: 5,
    score: { vanguard: 0, sentinel: 0 },
    money: 800,
    bomb: { carrier: 'player', planted: false, site: null,
      plantProgress: 0, defuseProgress: 0, timer: 0, x: 0, z: 0 },
    player: createFighter('player', 'vanguard', 'player'),
    bots: [],
    events: [],
    comms: [], // bot radio callouts, newest first, at most four kept
    smokeClouds: [], // active smoke clouds: { x, z, until } in sim time
    winner: null, roundWinner: null, roundReason: '',
  };
}

/** Put a fighter back on its spawn for a new round. Armour survives the
 * round (it is bought, not given); weapon resets to the P9 sidearm and the
 * bomb is dropped. spawn = { x, z, yaw }. */
export function resetFighter(f, spawn) {
  f.x = spawn.x; f.z = spawn.z; f.y = 0;
  f.vx = 0; f.vy = 0; f.vz = 0;
  f.yaw = spawn.yaw; f.pitch = 0;
  f.eye = 1.62; f.health = 100; f.alive = true;
  f.crouched = false; f.onGround = true;
  f.weapon = 'p9'; f.mag = WEAPONS.p9.mag; f.reserve = WEAPONS.p9.reserve;
  f.grenades = 0; f.smokes = 0; f.hasBomb = false;
  f.planting = 0; f.defusing = 0; f.flash = 0;
  f.lastShotAt = -99; f.speed2d = 0;
}

/** Damage a fighter. Armour absorbs half the hit, spending one armour
 * point per point absorbed. Returns 'dead' when the fighter dies,
 * 'dropped' when it dies carrying the charge, 'alive' otherwise. */
export function damageFighter(f, amount, attacker) {
  if (!f.alive || amount <= 0) return 'alive';
  let rest = amount;
  if (f.armor > 0) {
    const absorbed = Math.min(f.armor, rest * 0.5);
    f.armor -= absorbed;
    rest -= absorbed;
  }
  f.health -= rest;
  if (f.health > 0) return 'alive';
  f.health = 0;
  f.alive = false;
  f.deaths += 1;
  if (attacker) attacker.kills += 1;
  if (f.hasBomb) {
    f.hasBomb = false;
    return 'dropped';
  }
  return 'dead';
}

/** Push a killfeed line, newest first, at most five kept. */
export function pushEvent(state, text) {
  state.events.unshift(text);
  if (state.events.length > 5) state.events.length = 5;
}
