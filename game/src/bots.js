// bots.js — RUSTLINE bot AI: routing, holding, engaging, investigating,
// planting and defusing. Original code written for the threejs-fps-02 entry.
import * as THREE from 'three';
import { createFighter, resetFighter } from './state.js';
import { WEAPONS } from './weapon.js';

const WALK_SPEED = 4.0;
const STRAFE_SPEED = 2.2;
const HALF = 0.4; // fighter AABB half-width
const SEE_RANGE = 55;
const HEAR_RANGE = 25;
const INVESTIGATE_TIME = 4;

// Callsigns, one per bot. Killfeed lines and radio callouts use these,
// never the bare ids.
const NAMES = {
  vanguard: ['Rook', 'Sable', 'Forge', 'Talon'],
  sentinel: ['Heron', 'Brass', 'Wick', 'Fenn', 'Onyx'],
};

// Map zone label for callouts ("contact site A", "heard shots mid").
function zone(world, x, z) {
  const s = siteAt(world, x, z);
  if (s) return 'site ' + s;
  if (z > 12) return 'south yard';
  if (z < -12) return 'north yard';
  if (x < -12) return 'west yard';
  if (x > 12) return 'east yard';
  return 'mid';
}

// One radio line, newest first, at most four kept.
function say(state, bot, text) {
  state.comms.unshift(bot.name + ': ' + text);
  if (state.comms.length > 4) state.comms.length = 4;
}

// A route that starts at the waypoint nearest the bot, so a retasked bot
// never walks back to a spawn to follow the chain from the beginning.
function sliceRoute(route, x, z) {
  let bi = 0;
  let bd = Infinity;
  for (let i = 0; i < route.length; i++) {
    const dx = route[i].x - x;
    const dz = route[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; bi = i; }
  }
  return route.slice(bi);
}

// Module-level record of the most recent loud noise (gunfire). main.js calls
// hearNoise() on shots; each bot picks the noise up on its next tick.
const lastNoise = { x: 0, z: 0, at: -1, seq: 0, loud: true };

export function hearNoise(x, z, loud) {
  lastNoise.x = x;
  lastNoise.z = z;
  lastNoise.loud = loud !== false;
  lastNoise.seq += 1;
  lastNoise.at = lastNoise.seq;
}

function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Yaw whose forward vector (-sin(yaw), -cos(yaw)) points from a toward b.
function angleTo(ax, az, bx, bz) {
  return Math.atan2(-(bx - ax), -(bz - az));
}

function turnToward(bot, targetYaw, dt) {
  let d = targetYaw - bot.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  bot.yaw += THREE.MathUtils.clamp(d, -7.0 * dt, 7.0 * dt);
}

function siteAt(world, x, z) {
  for (const id of ['A', 'B']) {
    const s = world.sites[id];
    if (s && dist2d(x, z, s.x, s.z) < s.r) return id;
  }
  return null;
}

function hitsCollider(world, x, z, height) {
  for (const c of world.colliders) {
    if (c.maxY <= 0 || c.minY >= height) continue;
    if (x + HALF <= c.minX || x - HALF >= c.maxX) continue;
    if (z + HALF <= c.minZ || z - HALF >= c.maxZ) continue;
    return true;
  }
  return false;
}

// Move a bot with the same AABB rules as the player: per-axis resolve
// against world colliders, clamped to the map bounds, feet on y = 0.
function moveBot(bot, world, mx, mz, dt) {
  const height = bot.crouched ? 1.2 : 1.8;
  const startX = bot.x;
  const startZ = bot.z;
  let nx = bot.x + mx * dt;
  if (nx < world.bounds.minX + HALF) nx = world.bounds.minX + HALF;
  if (nx > world.bounds.maxX - HALF) nx = world.bounds.maxX - HALF;
  if (!hitsCollider(world, nx, bot.z, height)) bot.x = nx;
  let nz = bot.z + mz * dt;
  if (nz < world.bounds.minZ + HALF) nz = world.bounds.minZ + HALF;
  if (nz > world.bounds.maxZ - HALF) nz = world.bounds.maxZ - HALF;
  if (!hitsCollider(world, bot.x, nz, height)) bot.z = nz;
  bot.y = 0;
  bot.onGround = true;
  const moved = dist2d(startX, startZ, bot.x, bot.z);
  bot.speed2d = dt > 0 ? moved / dt : 0;
  return moved;
}

function setWeaponForRole(f, role) {
  const name = role === 'holder' ? 'kestrel' : 'vk7';
  const w = WEAPONS[name];
  f.weapon = name;
  f.mag = w.mag;
  f.reserve = w.reserve;
}

function freshBrain(bot, spawn) {
  return {
    mode: 'route',
    route: [],
    wp: 0,
    holdX: spawn ? spawn.x : bot.x,
    holdZ: spawn ? spawn.z : bot.z,
    holdYaw: spawn && spawn.yaw !== undefined ? spawn.yaw : bot.yaw,
    target: null,
    react: 0,
    burst: 0,
    burstLeft: 0,
    aimErr: 0,
    repath: 0,
    stuck: 0,
    lastX: bot.x,
    lastZ: bot.z,
    investigateX: 0,
    investigateZ: 0,
    investigateT: 0,
    strafeDir: 1,
    strafeT: 0,
    scanPhase: 0,
    noiseSeq: lastNoise.seq,
    objective: null,
    saidPlant: false,
    saidDefuse: false,
  };
}

export function createBot(id, team, spawn, role) {
  const bot = createFighter(id, team, 'bot');
  bot.role = role;
  bot.name = NAMES[team][(parseInt(id.slice(1), 10) - 1) % NAMES[team].length];
  resetFighter(bot, spawn);
  setWeaponForRole(bot, role);
  bot.brain = freshBrain(bot, spawn);
  bot.planting = false;
  bot.defusing = false;
  return bot;
}

export function resetBot(bot, spawn, role) {
  resetFighter(bot, spawn);
  if (role) bot.role = role;
  setWeaponForRole(bot, bot.role || 'rifler');
  bot.brain = freshBrain(bot, spawn);
  bot.planting = false;
  bot.defusing = false;
}

export function assignRound(bots, state, world, rng) {
  const routes = world.routes;
  const vanguard = bots.filter((b) => b.team === 'vanguard');
  const sentinel = bots.filter((b) => b.team === 'sentinel');

  // Vanguard: the planter takes A or B; the others spread over mid / A / B.
  const spread = [routes.vanguardMid, routes.vanguardToA, routes.vanguardToB];
  let spreadIdx = Math.floor(rng() * spread.length);
  for (const bot of vanguard) {
    const b = bot.brain;
    b.target = null;
    b.react = 0;
    b.burst = 0;
    b.burstLeft = 0;
    b.investigateT = 0;
    b.stuck = 0;
    b.lastX = bot.x;
    b.lastZ = bot.z;
    b.objective = null;
    b.saidPlant = false;
    b.saidDefuse = false;
    bot.planting = false;
    bot.defusing = false;
    let route;
    if (bot.role === 'planter') {
      const site = rng() < 0.5 ? 'A' : 'B';
      route = site === 'A' ? routes.vanguardToA : routes.vanguardToB;
      say(state, bot, 'pushing site ' + site);
    } else {
      route = spread[spreadIdx % spread.length];
      spreadIdx += 1;
    }
    b.route = route.slice();
    b.wp = 0;
    b.mode = 'route';
  }

  // Sentinel: two hold A, two hold B, one holds mid. Shuffle the posts so
  // the same bot does not always take the same site.
  const posts = ['A', 'A', 'B', 'B', 'mid'];
  for (let i = posts.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = posts[i];
    posts[i] = posts[j];
    posts[j] = tmp;
  }
  sentinel.forEach((bot, i) => {
    const b = bot.brain;
    b.target = null;
    b.react = 0;
    b.burst = 0;
    b.burstLeft = 0;
    b.investigateT = 0;
    b.stuck = 0;
    b.lastX = bot.x;
    b.lastZ = bot.z;
    b.objective = null;
    b.saidPlant = false;
    b.saidDefuse = false;
    bot.planting = false;
    bot.defusing = false;
    const post = posts[i % posts.length];
    let hx;
    let hz;
    if (post === 'A') {
      hx = world.sites.A.x + (rng() - 0.5) * 6;
      hz = world.sites.A.z + (rng() - 0.5) * 6;
    } else if (post === 'B') {
      hx = world.sites.B.x + (rng() - 0.5) * 6;
      hz = world.sites.B.z + (rng() - 0.5) * 6;
    } else {
      hx = (rng() - 0.5) * 8;
      hz = (rng() - 0.5) * 8;
    }
    b.holdX = hx;
    b.holdZ = hz;
    // Face the likely approach: toward the middle of the map.
    b.holdYaw = angleTo(hx, hz, 0, 0);
    b.scanPhase = rng() * Math.PI * 2;
    b.route = [];
    b.wp = 0;
    b.mode = 'hold';
    bot.yaw = b.holdYaw;
  });
}

export function stepBot(bot, state, world, dt, ctx) {
  if (!bot.alive || dt <= 0) return;
  const b = bot.brain;
  const rng = ctx.rng;
  bot.planting = false;
  bot.defusing = false;

  // Pick up a noise heard since this bot's last tick.
  if (lastNoise.seq !== b.noiseSeq) {
    b.noiseSeq = lastNoise.seq;
    const radius = lastNoise.loud ? HEAR_RANGE : 10;
    if (dist2d(bot.x, bot.z, lastNoise.x, lastNoise.z) < radius) {
      if (b.investigateT <= 0) say(state, bot, 'heard shots ' + zone(world, lastNoise.x, lastNoise.z));
      b.investigateX = lastNoise.x;
      b.investigateZ = lastNoise.z;
      b.investigateT = INVESTIGATE_TIME;
    }
  }

  // Nearest visible enemy: line of sight, in range, and inside the bot's
  // 100-degree facing cone — unless hurt recently, when it is alerted and
  // can spot a threat in any direction.
  const eyeY = bot.y + bot.eye;
  const recentlyHurt = state.time - bot.lastShotAt < 3;
  let best = null;
  let bestD = SEE_RANGE;
  const foes = [];
  if (state.player && state.player.team !== bot.team && state.player.alive) {
    foes.push(state.player);
  }
  for (const other of state.bots) {
    if (other !== bot && other.team !== bot.team && other.alive) foes.push(other);
  }
  for (const foe of foes) {
    const d = dist2d(bot.x, bot.z, foe.x, foe.z);
    if (d >= bestD) continue;
    if (!recentlyHurt && d > 0.01) {
      const fx = -Math.sin(bot.yaw);
      const fz = -Math.cos(bot.yaw);
      const dx = (foe.x - bot.x) / d;
      const dz = (foe.z - bot.z) / d;
      if (fx * dx + fz * dz < 0.64) continue; // outside the ~100-degree cone
    }
    if (!ctx.los(bot.x, eyeY, bot.z, foe.x, foe.y + 1.2, foe.z)) continue;
    best = foe;
    bestD = d;
  }

  if (best) {
    if (b.target !== best) {
      b.target = best;
      best.spottedAt = state.time;
      say(state, bot, 'contact ' + zone(world, best.x, best.z));
      b.react = 0.25 + rng() * 0.25;
      b.burstLeft = 0;
      b.burst = 0;
    }
    b.mode = 'engage';
    turnToward(bot, angleTo(bot.x, bot.z, best.x, best.z), dt);
    // Strafe perpendicular to the target, flipping direction regularly.
    b.strafeT -= dt;
    if (b.strafeT <= 0) {
      b.strafeDir = rng() < 0.5 ? -1 : 1;
      b.strafeT = 0.7 + rng() * 0.7;
    }
    const rx = Math.cos(bot.yaw);
    const rz = -Math.sin(bot.yaw);
    let mx = rx * b.strafeDir * STRAFE_SPEED;
    let mz = rz * b.strafeDir * STRAFE_SPEED;
    if (bestD > 28) {
      mx += -Math.sin(bot.yaw) * 2.0;
      mz += -Math.cos(bot.yaw) * 2.0;
    }
    moveBot(bot, world, mx, mz, dt);
    // Fire in bursts after a short reaction delay.
    if (b.react > 0) {
      b.react -= dt;
    } else {
      b.burst -= dt;
      if (b.burst <= 0) {
        if (b.burstLeft <= 0) {
          b.burstLeft = 3 + Math.floor(rng() * 3);
          b.burst = 0.05;
        } else {
          const w = WEAPONS[bot.weapon];
          const err = 0.12 + bestD * 0.012 + best.speed2d * 0.05;
          b.aimErr = err;
          const tx = best.x + (rng() - 0.5) * 2 * err;
          const ty = best.y + 1.2 + (rng() - 0.5) * err;
          const tz = best.z + (rng() - 0.5) * 2 * err;
          ctx.shootAt(bot, tx, ty, tz, w.spread);
          b.burstLeft -= 1;
          b.burst = w.rate > 0 ? w.rate : 0.12;
          if (b.burstLeft <= 0) b.burst = 0.4 + rng() * 0.5;
        }
      }
    }
    return;
  }

  b.target = null;

  // Objectives: the charge decides what every bot does next.
  if (!state.bomb.planted && (b.objective === 'defuse' || b.objective === 'guard')) b.objective = null;
  if (state.bomb.planted && bot.team === 'sentinel' && b.objective !== 'defuse') {
    // Every defender converges on the planted charge to defuse it.
    b.objective = 'defuse';
    b.route = sliceRoute(world.routes['sentinelTo' + state.bomb.site], bot.x, bot.z);
    b.wp = 0;
    b.mode = 'route';
  } else if (state.bomb.planted && bot.team === 'vanguard' && b.objective !== 'guard') {
    // Attackers fall back to defend the planted charge.
    b.objective = 'guard';
    b.route = sliceRoute(world.routes['vanguardTo' + state.bomb.site], bot.x, bot.z);
    b.wp = 0;
    b.mode = 'route';
  } else if (!state.bomb.planted && state.bomb.carrier === null && bot.team === 'vanguard' && b.objective !== 'recover') {
    // The charge is on the ground: the nearest living attacker goes and gets it.
    let near = null;
    let nd = Infinity;
    for (const o of state.bots) {
      if (o.team !== 'vanguard' || !o.alive) continue;
      const d = dist2d(o.x, o.z, state.bomb.x, state.bomb.z);
      if (d < nd) { nd = d; near = o; }
    }
    if (near === bot) {
      b.objective = 'recover';
      b.route = [{ x: state.bomb.x, z: state.bomb.z }];
      b.wp = 0;
      b.mode = 'route';
    }
  } else if (bot.team === 'vanguard' && bot.hasBomb && !state.bomb.planted && b.objective !== 'plant') {
    // Whoever carries the charge takes it to the nearer site.
    const dA = dist2d(bot.x, bot.z, world.sites.A.x, world.sites.A.z);
    const dB = dist2d(bot.x, bot.z, world.sites.B.x, world.sites.B.z);
    const site = dA < dB ? 'A' : 'B';
    b.objective = 'plant';
    b.route = sliceRoute(world.routes['vanguardTo' + site], bot.x, bot.z);
    b.wp = 0;
    b.mode = 'route';
  }

  // Walk toward a recently heard noise for a few seconds.
  if (b.investigateT > 0) {
    b.mode = 'investigate';
    const d = dist2d(bot.x, bot.z, b.investigateX, b.investigateZ);
    if (d > 1.2) {
      turnToward(bot, angleTo(bot.x, bot.z, b.investigateX, b.investigateZ), dt);
      moveBot(bot, world, -Math.sin(bot.yaw) * WALK_SPEED, -Math.cos(bot.yaw) * WALK_SPEED, dt);
      b.stuck += dt;
      if (b.stuck >= 1.5) {
        if (dist2d(bot.x, bot.z, b.lastX, b.lastZ) < 0.2) b.investigateT = 0;
        b.lastX = bot.x;
        b.lastZ = bot.z;
        b.stuck = 0;
      }
    } else {
      b.investigateT = 0;
    }
    b.investigateT -= dt;
    if (b.investigateT <= 0) {
      b.mode = b.route.length > 0 ? 'route' : 'hold';
      b.investigateT = 0;
    }
    return;
  }

  // Follow the assigned route, skipping a waypoint when stuck on it.
  if (b.mode === 'route' || b.route.length > 0) {
    b.mode = 'route';
    if (b.wp >= b.route.length) {
      b.mode = 'hold';
      if (b.objective === 'defuse' && state.bomb.planted) {
        // Walk right up to the charge, not just to the site centre.
        b.holdX = state.bomb.x;
        b.holdZ = state.bomb.z;
      } else {
        b.holdX = bot.x;
        b.holdZ = bot.z;
      }
      b.holdYaw = bot.yaw;
    } else {
      const wp = b.route[b.wp];
      const d = dist2d(bot.x, bot.z, wp.x, wp.z);
      if (d < 0.6) {
        b.wp += 1;
        b.stuck = 0;
        b.lastX = bot.x;
        b.lastZ = bot.z;
      } else {
        turnToward(bot, angleTo(bot.x, bot.z, wp.x, wp.z), dt);
        moveBot(bot, world, -Math.sin(bot.yaw) * WALK_SPEED, -Math.cos(bot.yaw) * WALK_SPEED, dt);
        b.stuck += dt;
        if (b.stuck >= 1.5) {
          if (dist2d(bot.x, bot.z, b.lastX, b.lastZ) < 0.2) b.wp += 1;
          b.lastX = bot.x;
          b.lastZ = bot.z;
          b.stuck = 0;
        }
      }
    }
  }

  // Hold a post: walk there first, then scan the lane with slow yaw sweeps.
  if (b.mode === 'hold') {
    const d = dist2d(bot.x, bot.z, b.holdX, b.holdZ);
    if (d > 1.0) {
      turnToward(bot, angleTo(bot.x, bot.z, b.holdX, b.holdZ), dt);
      moveBot(bot, world, -Math.sin(bot.yaw) * WALK_SPEED, -Math.cos(bot.yaw) * WALK_SPEED, dt);
    } else {
      bot.yaw = b.holdYaw + Math.sin(state.time * 0.6 + (b.scanPhase || 0)) * 0.6;
      bot.speed2d = 0;
    }
  }

  // Plant: Vanguard carrier standing in a site with no enemy in sight.
  if (bot.team === 'vanguard' && bot.hasBomb && !state.bomb.planted) {
    const s = siteAt(world, bot.x, bot.z);
    if (s) {
      if (!b.saidPlant) { say(state, bot, 'planting site ' + s); b.saidPlant = true; }
      bot.planting = true;
    }
  }
  if (!bot.planting) b.saidPlant = false;
  // Defuse: Sentinel standing next to the planted charge, no enemy in sight.
  if (bot.team === 'sentinel' && state.bomb.planted) {
    if (dist2d(bot.x, bot.z, state.bomb.x, state.bomb.z) < 2.5) {
      if (!b.saidDefuse) { say(state, bot, 'defusing the charge'); b.saidDefuse = true; }
      bot.defusing = true;
    }
  }
  if (!bot.defusing) b.saidDefuse = false;
}
