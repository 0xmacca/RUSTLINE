// player.js — RUSTLINE movement, collision and look (pure math, no imports).
// Feet position (x, y, z); y = 0 is the ground. Forward = (-sin(yaw), 0, -cos(yaw)).

export const MOVE = {
  walk: 4.4,
  crouch: 2.2,
  air: 0.35,
  accel: 42,
  friction: 11,
  jump: 5.2,
  gravity: 14,
};

const HALF = 0.4;
const STAND_H = 1.8;
const CROUCH_H = 1.2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Step one fighter for dt seconds. keys is a Set of KeyboardEvent.code
// strings. colliders are {minX,minY,minZ,maxX,maxY,maxZ}; bounds clamp the
// playable XZ rectangle. No allocation inside this function.
export function stepPlayer(f, dt, keys, colliders, bounds) {
  if (dt <= 0) return;
  const crouched = keys.has('ControlLeft');
  f.crouched = crouched;
  const height = crouched ? CROUCH_H : STAND_H;
  f.eye = crouched ? 1.15 : 1.62;

  let speed = crouched ? MOVE.crouch : MOVE.walk;
  if (keys.has('ShiftLeft')) speed *= 0.55;

  const sy = Math.sin(f.yaw);
  const cy = Math.cos(f.yaw);
  // Forward (-sin, -cos) and right (cos, -sin) in XZ.
  const fx = -sy;
  const fz = -cy;
  const rx = cy;
  const rz = -sy;

  const ix = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const iz = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  let wx = fx * iz + rx * ix;
  let wz = fz * iz + rz * ix;
  const wl = Math.sqrt(wx * wx + wz * wz);
  if (wl > 1) {
    wx /= wl;
    wz /= wl;
  }
  const hasInput = wl > 0.001;

  const rate = MOVE.accel * (f.onGround ? 1 : MOVE.air);
  const k = Math.min(1, rate * dt);
  if (hasInput) {
    f.vx += (wx * speed - f.vx) * k;
    f.vz += (wz * speed - f.vz) * k;
  } else if (f.onGround) {
    const fr = Math.max(0, 1 - MOVE.friction * dt);
    f.vx *= fr;
    f.vz *= fr;
    if (Math.abs(f.vx) < 0.01) f.vx = 0;
    if (Math.abs(f.vz) < 0.01) f.vz = 0;
  }

  if (keys.has('Space') && f.onGround) {
    f.vy = MOVE.jump;
    f.onGround = false;
  }

  f.vy -= MOVE.gravity * dt;

  // --- X axis: move, then resolve against colliders and bounds.
  f.x += f.vx * dt;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (
      f.x + HALF > c.minX && f.x - HALF < c.maxX &&
      f.y + height > c.minY && f.y < c.maxY &&
      f.z + HALF > c.minZ && f.z - HALF < c.maxZ
    ) {
      if (f.vx > 0) f.x = c.minX - HALF;
      else if (f.vx < 0) f.x = c.maxX + HALF;
      f.vx = 0;
    }
  }
  if (bounds) {
    if (f.x < bounds.minX + HALF) { f.x = bounds.minX + HALF; if (f.vx < 0) f.vx = 0; }
    if (f.x > bounds.maxX - HALF) { f.x = bounds.maxX - HALF; if (f.vx > 0) f.vx = 0; }
  }

  // --- Z axis: same treatment.
  f.z += f.vz * dt;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (
      f.x + HALF > c.minX && f.x - HALF < c.maxX &&
      f.y + height > c.minY && f.y < c.maxY &&
      f.z + HALF > c.minZ && f.z - HALF < c.maxZ
    ) {
      if (f.vz > 0) f.z = c.minZ - HALF;
      else if (f.vz < 0) f.z = c.maxZ + HALF;
      f.vz = 0;
    }
  }
  if (bounds) {
    if (f.z < bounds.minZ + HALF) { f.z = bounds.minZ + HALF; if (f.vz < 0) f.vz = 0; }
    if (f.z > bounds.maxZ - HALF) { f.z = bounds.maxZ - HALF; if (f.vz > 0) f.vz = 0; }
  }

  // --- Y axis: gravity move, land on ground or on a collider top,
  // bump the head on a collider underside.
  const prevY = f.y;
  f.y += f.vy * dt;
  f.onGround = false;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (
      f.x + HALF > c.minX && f.x - HALF < c.maxX &&
      f.z + HALF > c.minZ && f.z - HALF < c.maxZ &&
      f.y + height > c.minY && f.y < c.maxY
    ) {
      if (f.vy <= 0 && prevY >= c.maxY - 0.001) {
        f.y = c.maxY;
        f.vy = 0;
        f.onGround = true;
      } else if (f.vy > 0 && prevY + height <= c.minY + 0.001) {
        f.y = c.minY - height;
        f.vy = 0;
      }
    }
  }
  if (f.y <= 0) {
    f.y = 0;
    f.vy = 0;
    f.onGround = true;
  }

  f.speed2d = Math.sqrt(f.vx * f.vx + f.vz * f.vz);
}

// Mouse-look deltas (pixels) -> yaw / pitch. Pitch clamped so the
// player can never flip over the top.
export function lookPlayer(f, dx, dy) {
  f.yaw -= dx * 0.0022;
  f.pitch = clamp(f.pitch - dy * 0.0022, -1.45, 1.45);
}

// Weapon kick: pitch up, yaw sideways, pitch kept in the look clamp.
export function recoilPlayer(f, pitchKick, yawKick) {
  f.pitch = clamp(f.pitch + pitchKick, -1.45, 1.45);
  f.yaw += yawKick;
}
