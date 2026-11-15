// weapon.js — RUSTLINE weapons table, fire / reload, grenades. No imports.
// Damage and hit resolution live in the combat module; this file only
// owns ammo, timing and the grenade's flight.

export const WEAPONS = {
  p9: { name: 'P9', price: 0, damage: 30, headMult: 3, mag: 15, reserve: 70, rate: 0.28, auto: false, reloadTime: 1.1, spread: 0.011, moveSpread: 0.016, recoil: 0.006, range: 70, tracer: 0xffc861 },
  vk7: { name: 'VK-7', price: 2700, damage: 34, headMult: 4, mag: 30, reserve: 90, rate: 0.1, auto: true, reloadTime: 2.2, spread: 0.008, moveSpread: 0.03, recoil: 0.011, range: 90, tracer: 0xffc861 },
  kestrel: { name: 'Kestrel', price: 1500, damage: 26, headMult: 3, mag: 25, reserve: 100, rate: 0.07, auto: true, reloadTime: 1.8, spread: 0.013, moveSpread: 0.024, recoil: 0.007, range: 55, tracer: 0xffc861 },
};

// Fresh per-fighter weapon state: a full mag, the table's reserve ammo,
// no cooldown, not reloading.
export function createWeaponState(name) {
  const def = WEAPONS[name];
  return { name, mag: def.mag, reserve: def.reserve, cooldown: 0, reloading: 0 };
}

// One trigger pull. The caller ticks ws.cooldown every simulation tick
// (a shot only happens when the gun is ready, loaded and not mid-reload),
// so the cooldown decays in real time even between trigger pulls.
// Returns true exactly when a round was spent. Semi-auto (auto === false)
// is enforced by the caller, which only calls this on a fresh press.
export function tryFire(ws, def, dt, moving) {
  if (ws.cooldown > 0 || ws.mag <= 0 || ws.reloading > 0) return false;
  ws.mag -= 1;
  ws.cooldown = def.rate;
  return true;
}

// Begin a reload when there is room in the mag and ammo in reserve.
export function startReload(ws, def) {
  if (ws.mag >= def.mag || ws.reserve <= 0 || ws.reloading > 0) return;
  ws.reloading = def.reloadTime;
}

// Tick a reload; on completion top the mag up from reserve. Returns
// true only on the frame the reload finishes.
export function stepReload(ws, def, dt) {
  if (ws.reloading <= 0) return false;
  ws.reloading -= dt;
  if (ws.reloading > 0) return false;
  ws.reloading = 0;
  const need = def.mag - ws.mag;
  const take = need < ws.reserve ? need : ws.reserve;
  ws.mag += take;
  ws.reserve -= take;
  return true;
}

// Hand a fighter a new weapon with a fresh full mag and reserve.
export function giveWeapon(f, name) {
  const def = WEAPONS[name];
  f.weapon = name;
  f.mag = def.mag;
  f.reserve = def.reserve;
}

// --- Grenades ---

const GRENADE_R = 0.12;
const GRENADE_GRAVITY = 14;
const BOUNCE = 0.35;

// A thrown grenade: position, velocity, owning team, 1.6 s fuse.
// kind is 'frag' (damage) or 'smoke' (a sight-blocking cloud).
export function createGrenade(x, y, z, vx, vy, vz, team, kind) {
  return { x, y, z, vx, vy, vz, team, kind: kind || 'frag', fuse: 1.6, alive: true };
}

// Step one grenade: gravity, bounce off the ground and collider tops
// (restitution 0.35), slide along walls (the velocity component into
// the wall is zeroed). Returns 'explode' when the fuse runs out.
export function stepGrenade(g, dt, colliders, bounds) {
  if (!g.alive || dt <= 0) return null;
  g.vy -= GRENADE_GRAVITY * dt;

  g.x += g.vx * dt;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (
      g.x + GRENADE_R > c.minX && g.x - GRENADE_R < c.maxX &&
      g.y + GRENADE_R > c.minY && g.y - GRENADE_R < c.maxY &&
      g.z + GRENADE_R > c.minZ && g.z - GRENADE_R < c.maxZ
    ) {
      if (g.vx > 0) g.x = c.minX - GRENADE_R;
      else if (g.vx < 0) g.x = c.maxX + GRENADE_R;
      g.vx = 0;
    }
  }
  if (bounds) {
    if (g.x < bounds.minX + GRENADE_R) { g.x = bounds.minX + GRENADE_R; g.vx = 0; }
    if (g.x > bounds.maxX - GRENADE_R) { g.x = bounds.maxX - GRENADE_R; g.vx = 0; }
  }

  g.z += g.vz * dt;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (
      g.x + GRENADE_R > c.minX && g.x - GRENADE_R < c.maxX &&
      g.y + GRENADE_R > c.minY && g.y - GRENADE_R < c.maxY &&
      g.z + GRENADE_R > c.minZ && g.z - GRENADE_R < c.maxZ
    ) {
      if (g.vz > 0) g.z = c.minZ - GRENADE_R;
      else if (g.vz < 0) g.z = c.maxZ + GRENADE_R;
      g.vz = 0;
    }
  }
  if (bounds) {
    if (g.z < bounds.minZ + GRENADE_R) { g.z = bounds.minZ + GRENADE_R; g.vz = 0; }
    if (g.z > bounds.maxZ - GRENADE_R) { g.z = bounds.maxZ - GRENADE_R; g.vz = 0; }
  }

  const prevY = g.y;
  g.y += g.vy * dt;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (
      g.x + GRENADE_R > c.minX && g.x - GRENADE_R < c.maxX &&
      g.z + GRENADE_R > c.minZ && g.z - GRENADE_R < c.maxZ &&
      g.y + GRENADE_R > c.minY && g.y - GRENADE_R < c.maxY
    ) {
      if (g.vy <= 0 && prevY - GRENADE_R >= c.maxY - 0.001) {
        g.y = c.maxY + GRENADE_R;
        g.vy = -g.vy * BOUNCE;
        if (Math.abs(g.vy) < 0.5) g.vy = 0;
      } else if (g.vy > 0 && prevY + GRENADE_R <= c.minY + 0.001) {
        g.y = c.minY - GRENADE_R;
        g.vy = -g.vy * BOUNCE;
      }
    }
  }
  if (g.y - GRENADE_R <= 0) {
    g.y = GRENADE_R;
    if (g.vy < 0) {
      g.vy = -g.vy * BOUNCE;
      if (Math.abs(g.vy) < 0.5) g.vy = 0;
    }
  }

  g.fuse -= dt;
  if (g.fuse <= 0) {
    g.alive = false;
    return g.kind === 'smoke' ? 'smoke' : 'explode';
  }
  return null;
}

// Smoke blocks sight, not bullets: a line of sight is blocked when the
// segment between two fighters passes within SMOKE_R of an active cloud.
// Pure function (no three.js) so the simulation and its tests share it;
// a cloud lives SMOKE_LIFE seconds of sim time from when it pops.
export const SMOKE_R = 2.6;
export const SMOKE_LIFE = 14;
export function losBlockedBySmoke(ax, az, bx, bz, clouds, now) {
  if (!clouds) return false;
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  for (let i = 0; i < clouds.length; i++) {
    const c = clouds[i];
    if (c.until <= now) continue;
    let t = len2 > 0 ? ((c.x - ax) * dx + (c.z - az) * dz) / len2 : 0;
    t = t < 0 ? 0 : (t > 1 ? 1 : t);
    const px = ax + dx * t - c.x, pz = az + dz * t - c.z;
    if (px * px + pz * pz < SMOKE_R * SMOKE_R) return true;
  }
  return false;
}

// Effective spread in radians: base spread, plus a movement penalty
// that scales with speed (full at walk speed) and is reduced while
// crouched. `moving` is the caller's moving flag; speed2d is the
// fighter's horizontal speed.
export function spreadFor(def, moving, crouched, speed2d) {
  let s = def.spread;
  if (moving) {
    const f = speed2d / 4.4;
    s += def.moveSpread * (f < 1 ? f : 1) * (crouched ? 0.6 : 1);
  }
  return s;
}
