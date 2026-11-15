// bomb.js — RUSTLINE charge logic: plant, defuse, detonate, pickup.
// Original code written for the threejs-fps-02 entry. No imports needed.

const PLANT_TIME = 3;
const DEFUSE_TIME = 5;
const BOMB_TIMER = 35;
const DEFUSE_RANGE = 2.5;
const PICKUP_RANGE = 1.2;

function dist2d(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// Returns 'A' or 'B' when (x, z) is inside a bomb site, otherwise null.
function siteAt(world, x, z) {
  for (const id of ['A', 'B']) {
    const s = world.sites[id];
    if (s && dist2d(x, z, s.x, s.z) < s.r) return id;
  }
  return null;
}

// Advances the charge state one tick. inputKeys is the player's key Set
// (null when the player is dead). Returns 'detonated', 'defused', or null.
export function stepBomb(state, world, dt, inputKeys) {
  if (dt <= 0) return null;
  const bomb = state.bomb;
  const player = state.player;

  // --- planted: countdown to detonation, and defuse attempts ---
  if (bomb.planted) {
    bomb.timer -= dt;
    if (bomb.timer <= 0) {
      bomb.timer = 0;
      return 'detonated';
    }
    let defusing = false;
    if (player && player.alive && inputKeys && inputKeys.has('KeyE')) {
      if (dist2d(player.x, player.z, bomb.x, bomb.z) < DEFUSE_RANGE) {
        defusing = true;
      }
    }
    if (!defusing) {
      for (const bot of state.bots) {
        if (bot.alive && bot.team === 'sentinel' && bot.defusing === true) {
          if (dist2d(bot.x, bot.z, bomb.x, bomb.z) < DEFUSE_RANGE) {
            defusing = true;
            break;
          }
        }
      }
    }
    if (defusing) {
      bomb.defuseProgress += dt / DEFUSE_TIME;
      if (bomb.defuseProgress >= 1) {
        bomb.defuseProgress = 0;
        return 'defused';
      }
    } else {
      bomb.defuseProgress = Math.max(0, bomb.defuseProgress - dt / DEFUSE_TIME);
    }
    return null;
  }

  // --- pickup of a dropped charge: the player first, then a Vanguard bot ---
  if (bomb.carrier === null && player && player.alive) {
    if (dist2d(player.x, player.z, bomb.x, bomb.z) < PICKUP_RANGE) {
      bomb.carrier = 'player';
      player.hasBomb = true;
    }
  }
  if (bomb.carrier === null) {
    for (const bot of state.bots) {
      if (bot.alive && bot.team === 'vanguard' && dist2d(bot.x, bot.z, bomb.x, bomb.z) < PICKUP_RANGE) {
        bomb.carrier = bot.id;
        bot.hasBomb = true;
        break;
      }
    }
  }

  // --- planting: player first, then a Vanguard bot carrier ---
  let planting = false;
  let planter = null; // 'player' or a bot fighter
  let siteId = null;
  if (player && player.alive && player.hasBomb && inputKeys && inputKeys.has('KeyE')) {
    siteId = siteAt(world, player.x, player.z);
    if (siteId) {
      planting = true;
      planter = 'player';
    }
  }
  if (!planting) {
    for (const bot of state.bots) {
      if (bot.alive && bot.team === 'vanguard' && bot.hasBomb && bot.planting === true) {
        const s = siteAt(world, bot.x, bot.z);
        if (s) {
          planting = true;
          planter = bot;
          siteId = s;
          break;
        }
      }
    }
  }
  if (planting) {
    bomb.plantProgress += dt / PLANT_TIME;
    if (bomb.plantProgress >= 1) {
      bomb.planted = true;
      bomb.site = siteId;
      bomb.timer = BOMB_TIMER;
      bomb.plantProgress = 0;
      bomb.defuseProgress = 0;
      bomb.carrier = null;
      if (planter === 'player') {
        bomb.x = player.x;
        bomb.z = player.z;
        player.hasBomb = false;
      } else {
        bomb.x = planter.x;
        bomb.z = planter.z;
        planter.hasBomb = false;
      }
    }
  } else {
    bomb.plantProgress = Math.max(0, bomb.plantProgress - dt / PLANT_TIME);
  }
  return null;
}
