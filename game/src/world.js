// RUSTLINE world — original 64 x 48 m rail-yard map for make.fun threejs-fps-02.
// North: warehouse block with a door gap. East: rail tracks and rail cars.
// West: stacked containers. Middle: scattered crates. Two bomb sites (A Depot,
// B Siding). Vanguard spawns south facing north, Sentinel spawns north facing south.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Deterministic RNG for tiny visual variation (crate yaw jitter). No Math.random.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Solid box: mesh + AABB collider + shootable entry. x/z is the centre, y0 the base.
function solidBox(ctx, x, z, w, h, d, color, y0 = 0) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05 })
  );
  mesh.position.set(x, y0 + h / 2, z);
  mesh.castShadow = h >= 2;
  mesh.receiveShadow = true;
  ctx.scene.add(mesh);
  ctx.colliders.push({
    minX: x - w / 2, minY: y0, minZ: z - d / 2,
    maxX: x + w / 2, maxY: y0 + h, maxZ: z + d / 2,
  });
  ctx.shootables.push(mesh);
  return mesh;
}

// Non-solid visual box (door posts, lintels, rails, car roof ribs). No collider.
function decorBox(scene, x, y0, z, w, h, d, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.9, metalness: 0.05 })
  );
  mesh.position.set(x, y0 + h / 2, z);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// Flat painted panel (ground detail, site markers). Not solid, 0.02 thick.
function flatPanel(scene, x, z, w, d, color, y = 0.01) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.02, d),
    new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0 })
  );
  mesh.position.set(x, y, z);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// Amber strip light (emissive, visual only).
function stripLight(scene, x, y, z, w, d) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, 0.08, d),
    new THREE.MeshStandardMaterial({
      color: PALETTE.accent, emissive: PALETTE.accent,
      emissiveIntensity: 1.6, roughness: 0.4, metalness: 0,
    })
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);
  return mesh;
}

// Rust barrel: solid cover with a collider (placed clear of the routes).
function barrel(ctx, x, z, color) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 1.1, 10),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0.3 })
  );
  mesh.position.set(x, 0.55, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  ctx.scene.add(mesh);
  ctx.colliders.push({
    minX: x - 0.45, minY: 0, minZ: z - 0.45,
    maxX: x + 0.45, maxY: 1.1, maxZ: z + 0.45,
  });
  ctx.shootables.push(mesh);
  return mesh;
}

// Lamp post: thin pole with a glowing amber head (emissive only, no light).
function lampPost(scene, x, z) {
  decorBox(scene, x, 0, z, 0.18, 4.5, 0.18, PALETTE.rail);
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.22, 0.5),
    new THREE.MeshStandardMaterial({ color: PALETTE.accent, emissive: PALETTE.accent, emissiveIntensity: 2.2 })
  );
  lamp.position.set(x, 4.6, z);
  scene.add(lamp);
  return lamp;
}

export function createWorld(scene) {
  const ctx = { scene, colliders: [], shootables: [] };

  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 45, 95);

  const hemi = new THREE.HemisphereLight(PALETTE.ink, PALETTE.ground, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.9);
  sun.position.set(18, 26, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005;
  sun.shadow.camera.left = -35;
  sun.shadow.camera.right = 35;
  sun.shadow.camera.top = 35;
  sun.shadow.camera.bottom = -35;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 80;
  scene.add(sun);

  // Dusk sky dome: warm orange band at the horizon fading to deep blue
  // above (vertex colours on a big back-face sphere, no texture needed).
  {
    const skyGeo = new THREE.SphereGeometry(110, 24, 12);
    const pos = skyGeo.attributes.position;
    const cols = new Float32Array(pos.count * 3);
    const top = new THREE.Color(0x2e4a6b);
    const mid = new THREE.Color(0xc96a2e);
    const bot = new THREE.Color(0x3a2a1e);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 110;
      if (y > 0.12) c.copy(mid).lerp(top, Math.min(1, (y - 0.12) / 0.5));
      else c.copy(bot).lerp(mid, Math.min(1, (y + 0.08) / 0.2));
      cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
    }
    skyGeo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    scene.add(new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
  }

  // Ground slab (top at y = 0; the ground itself is implicit, y >= 0).
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(64, 0.1, 48),
    new THREE.MeshStandardMaterial({ color: PALETTE.ground, roughness: 1, metalness: 0 })
  );
  ground.position.set(0, -0.05, 0);
  ground.receiveShadow = true;
  scene.add(ground);
  // Worn concrete yard pad in the middle.
  flatPanel(scene, 0, 2, 22, 14, PALETTE.concreteDark, 0.012);

  // Perimeter walls, height 4, thickness 1.
  solidBox(ctx, 0, -23.5, 64, 4, 1, PALETTE.concrete);
  solidBox(ctx, 0, 23.5, 64, 4, 1, PALETTE.concrete);
  solidBox(ctx, -31.5, 0, 1, 4, 48, PALETTE.concrete);
  solidBox(ctx, 31.5, 0, 1, 4, 48, PALETTE.concrete);

  // Warehouse block, north edge (z -24..-20), height 6.
  // Door gap at x 0..4: two segments, rust posts + lintel + amber strip.
  solidBox(ctx, -8, -22, 16, 6, 4, PALETTE.concreteDark);
  solidBox(ctx, 10, -22, 12, 6, 4, PALETTE.concrete);
  decorBox(scene, 0, 0, -20, 0.5, 3.2, 0.5, PALETTE.rust);
  decorBox(scene, 4, 0, -20, 0.5, 3.2, 0.5, PALETTE.rust);
  decorBox(scene, 2, 3.2, -20, 4.5, 0.8, 0.6, PALETTE.rustDark);
  stripLight(scene, 2, 3.1, -19.9, 3.6, 0.12);
  stripLight(scene, -8, 5.7, -19.95, 12, 0.12);
  stripLight(scene, 10, 5.7, -19.95, 9, 0.12);

  // Rail yard, east (x 21..30): gravel bed, two track lines, three rail cars.
  flatPanel(scene, 25.5, 0, 9, 44, PALETTE.concreteDark, 0.012);
  for (const cx of [24, 27.5]) {
    for (const off of [-0.75, 0.75]) {
      decorBox(scene, cx + off, 0, 0, 0.16, 0.12, 44, PALETTE.rail);
    }
    for (let z = -20; z <= 20; z += 2.5) {
      flatPanel(scene, cx, z, 2.2, 0.5, PALETTE.wood, 0.006);
    }
  }
  solidBox(ctx, 24, -8, 2.6, 3, 6, PALETTE.railCar);
  solidBox(ctx, 27.5, 2, 2.6, 3, 6, PALETTE.railCar);
  solidBox(ctx, 27.3, 10.5, 2.6, 3, 5, PALETTE.railCar);
  decorBox(scene, 24, 3, -8, 2.7, 0.15, 6.1, PALETTE.rustDark);
  decorBox(scene, 27.5, 3, 2, 2.7, 0.15, 6.1, PALETTE.rustDark);
  decorBox(scene, 27.3, 3, 10.5, 2.7, 0.15, 5.1, PALETTE.rustDark);

  // Container stacks, west (x -30..-20). Two stacks rise to a second level.
  solidBox(ctx, -28.5, -8, 2.4, 2.6, 6, PALETTE.containerTeal);
  solidBox(ctx, -28.5, -7.5, 2.4, 2.6, 5, PALETTE.containerAmber, 2.6);
  solidBox(ctx, -24.5, -4, 2.4, 2.6, 6, PALETTE.containerGrey);
  solidBox(ctx, -28.5, 4, 2.4, 2.6, 6, PALETTE.containerAmber);
  solidBox(ctx, -28.5, 4.5, 2.4, 2.6, 5, PALETTE.containerTeal, 2.6);
  solidBox(ctx, -24, 10, 2.4, 2.6, 6, PALETTE.containerGrey);
  stripLight(scene, -27.24, 1.4, -8, 0.12, 4);
  stripLight(scene, -27.24, 1.4, 4, 0.12, 4);

  // Mid-yard crates (seeded yaw jitter; collider padded 0.15 m for the turn).
  const rng = mulberry32(0x52555354); // 'RUST'
  const crates = [
    [-8, -8, 2.0, 2.0, PALETTE.wood],
    [6, -10, 1.6, 1.6, PALETTE.concrete],
    [-2, -2, 2.4, 2.4, PALETTE.wood],
    [10, -2, 1.8, 1.8, PALETTE.concrete],
    [-12, 4, 2.2, 2.2, PALETTE.wood],
    [2, 6, 1.6, 1.6, PALETTE.concrete],
    [12, 8, 2.0, 2.0, PALETTE.wood],
    [-6, 12, 1.8, 1.8, PALETTE.concrete],
    [8, 16, 1.4, 1.4, PALETTE.wood],
    [-14, -4, 1.5, 1.5, PALETTE.concrete],
    [16, 10, 1.8, 1.8, PALETTE.wood],
  ];
  for (const [cx, cz, size, h, color] of crates) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, h, size),
      new THREE.MeshStandardMaterial({ color, roughness: 0.95, metalness: 0 })
    );
    mesh.position.set(cx, h / 2, cz);
    mesh.rotation.y = (rng() - 0.5) * 0.12;
    mesh.castShadow = h >= 2;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const p = 0.15;
    ctx.colliders.push({
      minX: cx - size / 2 - p, minY: 0, minZ: cz - size / 2 - p,
      maxX: cx + size / 2 + p, maxY: h, maxZ: cz + size / 2 + p,
    });
    ctx.shootables.push(mesh);
  }

  // Site markers: flat painted boxes, darker border under the site colour.
  flatPanel(scene, -22, -16, 8.6, 8.6, PALETTE.rustDark, 0.02);
  flatPanel(scene, -22, -16, 7.8, 7.8, PALETTE.accent, 0.03);
  flatPanel(scene, -22, -16, 1.2, 1.2, PALETTE.rustDark, 0.04);
  flatPanel(scene, 22, 14, 8.6, 8.6, PALETTE.concreteDark, 0.02);
  flatPanel(scene, 22, 14, 7.8, 7.8, PALETTE.sentinel, 0.03);
  flatPanel(scene, 22, 14, 1.2, 1.2, PALETTE.concreteDark, 0.04);
  // Hazard stripes across the two site approaches.
  for (let i = 0; i < 4; i++) {
    flatPanel(scene, -18.4 + i * 0.55, -16, 0.45, 1.4, i % 2 ? PALETTE.accent : PALETTE.rustDark, 0.02);
    flatPanel(scene, 16.6 + i * 0.55, 14, 0.45, 1.4, i % 2 ? PALETTE.sentinel : PALETTE.concreteDark, 0.02);
  }
  // Barrels and lamp posts (clear of routes and spawns).
  barrel(ctx, -10, 14, PALETTE.rust);
  barrel(ctx, -9.1, 14.6, PALETTE.containerTeal);
  barrel(ctx, 14, -6, PALETTE.containerTeal);
  barrel(ctx, 6, -14, PALETTE.rust);
  lampPost(scene, -8, 0);
  lampPost(scene, 8, 0);
  // Spawn pads.
  flatPanel(scene, 0, 20, 2, 2, PALETTE.vanguard, 0.02);
  flatPanel(scene, 0, -18, 2, 2, PALETTE.sentinel, 0.02);

  const spawns = {
    vanguard: [
      { x: 0, z: 20, yaw: 0 },
      { x: -4, z: 22, yaw: 0 },
      { x: 4, z: 22, yaw: 0 },
      { x: -2, z: 22, yaw: 0 },
      { x: 2, z: 22, yaw: 0 },
    ],
    sentinel: [
      { x: 0, z: -18, yaw: Math.PI },
      { x: -4, z: -18, yaw: Math.PI },
      { x: 4, z: -18, yaw: Math.PI },
      { x: -2, z: -18, yaw: Math.PI },
      { x: 2, z: -18, yaw: Math.PI },
    ],
  };
  const sites = {
    A: { x: -22, z: -16, r: 4 },
    B: { x: 22, z: 14, r: 4 },
  };
  // Waypoints stay >= 0.8 m clear of every collider; steps are 4-7 m apart.
  // forward = (-sin(yaw), 0, -cos(yaw)): yaw 0 faces -z (north), PI faces +z.
  const routes = {
    vanguardToA: [
      { x: 0, z: 20 }, { x: -4, z: 15 }, { x: -8, z: 10.5 }, { x: -14, z: 8 },
      { x: -17, z: 2 }, { x: -19, z: -4 }, { x: -20, z: -10 }, { x: -22, z: -16 },
    ],
    vanguardToB: [
      { x: 0, z: 20 }, { x: 5, z: 16 }, { x: 10, z: 13 },
      { x: 14, z: 13 }, { x: 18, z: 14 }, { x: 22, z: 14 },
    ],
    vanguardMid: [
      { x: 0, z: 20 }, { x: 0, z: 14 }, { x: 0, z: 8 }, { x: 0, z: 2 },
      { x: 2, z: -4 }, { x: 0, z: -10 }, { x: 0, z: -16 },
    ],
    sentinelToA: [
      { x: 0, z: -18 }, { x: -5, z: -15 }, { x: -10, z: -13 },
      { x: -15, z: -14 }, { x: -19, z: -13 }, { x: -22, z: -16 },
    ],
    sentinelToB: [
      { x: 0, z: -18 }, { x: 4, z: -13 }, { x: 8, z: -8 }, { x: 12, z: -4 },
      { x: 15, z: 1 }, { x: 18, z: 6 }, { x: 19, z: 10 }, { x: 22, z: 14 },
    ],
    sentinelMid: [
      { x: 0, z: -18 }, { x: 0, z: -12 }, { x: 2, z: -6 }, { x: 0, z: 0 },
      { x: 0, z: 6 }, { x: 0, z: 12 }, { x: 0, z: 18 },
    ],
  };
  return {
    colliders: ctx.colliders,
    shootables: ctx.shootables,
    spawns,
    sites,
    routes,
    bounds: { minX: -31, maxX: 31, minZ: -23, maxZ: 23 },
  };
}

export function siteAt(world, x, z) {
  for (const key of ['A', 'B']) {
    const s = world.sites[key];
    const dx = x - s.x;
    const dz = z - s.z;
    if (dx * dx + dz * dz <= s.r * s.r) return key;
  }
  return null;
}
