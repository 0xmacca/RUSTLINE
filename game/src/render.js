import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Renderer / scene / camera, viewmodel, bot meshes, pooled tracers &
// impacts, bomb mesh. No allocation in the per-frame paths.
export function createRenderer() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.canvas);
  scene.fog = new THREE.Fog(PALETTE.fog, 18, 46);
  const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  const hemi = new THREE.HemisphereLight(PALETTE.sky, PALETTE.ground, 1.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe0b0, 2.6);
  sun.position.set(18, 30, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -36; sun.shadow.camera.right = 36;
  sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  for (const [x, z] of [[-22, -16], [22, 14]]) {
    const p = new THREE.PointLight(PALETTE.accent, 14, 16, 1.6);
    p.position.set(x, 4.2, z);
    scene.add(p);
  }
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  return { renderer, scene, camera };
}

export function createViewmodel(camera) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.55, metalness: 0.7 });
  const accent = new THREE.MeshStandardMaterial({ color: PALETTE.accent, roughness: 0.4, metalness: 0.4 });
  const add = (w, h, d, x, y, z, m) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || metal);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  add(0.09, 0.13, 0.42, 0, 0, 0);          // receiver
  add(0.05, 0.05, 0.3, 0, 0.02, -0.34);    // barrel
  add(0.07, 0.18, 0.1, 0, -0.14, 0.02);    // magazine
  add(0.02, 0.05, 0.08, 0, 0.09, -0.05, accent); // sight
  add(0.09, 0.03, 0.06, 0, -0.05, -0.2, accent); // grip accent
  const flashMat = new THREE.MeshBasicMaterial({ color: PALETTE.muzzle, transparent: true, opacity: 0.95 });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  flash.position.set(0, 0.02, -0.52);
  flash.visible = false;
  g.add(flash);
  const light = new THREE.PointLight(PALETTE.muzzle, 0, 4, 2);
  light.position.set(0, 0, -0.55);
  g.add(light);
  g.position.set(0.24, -0.22, -0.55);
  g.scale.setScalar(0.72); // slimmer gun: less of the screen, more of the yard
  camera.add(g);
  return { group: g, flash, light, t: 0, kick: 0, baseY: -0.22 };
}

export function updateViewmodel(vm, dt, moving, firing, reloading) {
  vm.t += dt;
  if (firing) vm.kick = 0.07;
  vm.kick = Math.max(0, vm.kick - dt * 0.45);
  const bob = moving ? Math.sin(vm.t * 9) * 0.008 : 0;
  const bobX = moving ? Math.cos(vm.t * 4.5) * 0.006 : 0;
  const dip = reloading ? Math.sin(Math.min(1, vm.t * 2) * Math.PI) * 0.06 : 0;
  vm.group.position.set(0.24 + bobX, vm.baseY + bob - dip, -0.55 + vm.kick);
  vm.group.rotation.x = vm.kick * 1.4 + (reloading ? 0.25 : 0);
  const show = firing;
  vm.flash.visible = show;
  if (show) { vm.flash.rotation.z = vm.t * 7; vm.light.intensity = 6; }
  else vm.light.intensity = 0;
}

export function createBotMeshes(scene, bots) {
  const groups = new Map();
  const hitMeshes = [];
  for (const bot of bots) {
    const g = new THREE.Group();
    const teamCol = bot.team === 'vanguard' ? PALETTE.vanguard : PALETTE.sentinel;
    const torsoMat = new THREE.MeshStandardMaterial({ color: teamCol, roughness: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x23211f, roughness: 0.8 });
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.25, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), torsoMat);
    body.position.y = 1.05;
    body.userData = { fighter: bot, part: 'body' };
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.3, 0.32), darkMat);
    head.position.y = 1.58;
    head.userData = { fighter: bot, part: 'head' };
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.05), visorMat);
    visor.position.set(0, 1.6, -0.17);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.22), darkMat);
    legL.position.set(-0.16, 0.35, 0);
    const legR = legL.clone();
    legR.position.x = 0.16;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.55), darkMat);
    gun.position.set(0.28, 1.18, -0.3);
    const flashMat = new THREE.MeshBasicMaterial({ color: PALETTE.muzzle, transparent: true, opacity: 0.95 });
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), flashMat);
    flash.position.set(0.28, 1.18, -0.62);
    flash.visible = false;
    g.add(body, head, visor, legL, legR, gun, flash);
    g.userData = { legL, legR, flash };
    scene.add(g);
    groups.set(bot.id, g);
    hitMeshes.push(body, head);
  }
  return { groups, hitMeshes };
}

export function updateBotMeshes(meshes, bots, t) {
  for (const bot of bots) {
    const g = meshes.groups.get(bot.id);
    if (!g) continue;
    g.position.set(bot.x, bot.y, bot.z);
    if (!bot.alive) {
      g.rotation.set(-Math.PI / 2, bot.yaw, 0);
      g.position.y = bot.y + 0.15;
      g.userData.flash.visible = false;
      continue;
    }
    g.rotation.set(0, bot.yaw, 0);
    const moving = bot.speed2d > 0.5;
    const swing = moving ? Math.sin(t * 10) * 0.55 : 0;
    g.userData.legL.rotation.x = swing;
    g.userData.legR.rotation.x = -swing;
    g.userData.flash.visible = (t - bot.lastShotAt) < 0.05;
    if (g.userData.flash.visible) g.userData.flash.rotation.z = t * 9;
  }
}

const tracers = [];
let tracerIdx = 0;
export function spawnTracer(scene, from, to, color) {
  if (!tracers.length) {
    for (let i = 0; i < 24; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
      const line = new THREE.Line(geo, mat);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      tracers.push({ line, life: 0 });
    }
  }
  const tr = tracers[tracerIdx];
  tracerIdx = (tracerIdx + 1) % tracers.length;
  const p = tr.line.geometry.attributes.position.array;
  p[0] = from.x; p[1] = from.y; p[2] = from.z;
  p[3] = to.x; p[4] = to.y; p[5] = to.z;
  tr.line.geometry.attributes.position.needsUpdate = true;
  tr.line.material.color.setHex(color);
  tr.line.material.opacity = 0.9;
  tr.line.visible = true;
  tr.life = 0.09;
}

export function updateTracers(dt) {
  for (const tr of tracers) {
    if (tr.life <= 0) continue;
    tr.life -= dt;
    if (tr.life <= 0) { tr.line.visible = false; tr.line.material.opacity = 0; }
    else tr.line.material.opacity = 0.9 * (tr.life / 0.09);
  }
}

const impacts = [];
let impactIdx = 0;
export function spawnImpact(scene, point, normal) {
  if (!impacts.length) {
    for (let i = 0; i < 12; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24), 3));
      const mat = new THREE.PointsMaterial({ color: PALETTE.accent, size: 0.07, transparent: true, opacity: 0 });
      const pts = new THREE.Points(geo, mat);
      pts.visible = false;
      pts.frustumCulled = false;
      scene.add(pts);
      impacts.push({ pts, life: 0, vel: new Float32Array(24) });
    }
  }
  const im = impacts[impactIdx];
  impactIdx = (impactIdx + 1) % impacts.length;
  const p = im.pts.geometry.attributes.position.array;
  const n = normal || { x: 0, y: 1, z: 0 };
  for (let i = 0; i < 8; i++) {
    p[i * 3] = point.x; p[i * 3 + 1] = point.y; p[i * 3 + 2] = point.z;
    const a = (i / 8) * Math.PI * 2;
    im.vel[i * 3] = n.x * 1.6 + Math.cos(a) * 1.4;
    im.vel[i * 3 + 1] = Math.abs(n.y) * 1.6 + 1.2;
    im.vel[i * 3 + 2] = n.z * 1.6 + Math.sin(a) * 1.4;
  }
  im.pts.geometry.attributes.position.needsUpdate = true;
  im.pts.material.opacity = 1;
  im.pts.visible = true;
  im.life = 0.4;
}

export function updateImpacts(dt) {
  for (const im of impacts) {
    if (im.life <= 0) continue;
    im.life -= dt;
    const p = im.pts.geometry.attributes.position.array;
    for (let i = 0; i < 8; i++) {
      im.vel[i * 3 + 1] -= 6 * dt;
      p[i * 3] += im.vel[i * 3] * dt;
      p[i * 3 + 1] += im.vel[i * 3 + 1] * dt;
      p[i * 3 + 2] += im.vel[i * 3 + 2] * dt;
    }
    im.pts.geometry.attributes.position.needsUpdate = true;
    im.pts.material.opacity = Math.max(0, im.life / 0.4);
    if (im.life <= 0) im.pts.visible = false;
  }
}

export function createBombMesh(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.2, 0.24),
    new THREE.MeshStandardMaterial({ color: 0x1c1a18, roughness: 0.5, metalness: 0.5 }));
  body.position.y = 0.1;
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: PALETTE.accent }));
  lamp.position.set(0.1, 0.22, 0);
  group.add(body, lamp);
  group.visible = false;
  scene.add(group);
  let t = 0;
  return {
    group,
    setPlanted(x, z) { group.position.set(x, 0, z); group.visible = true; },
    setVisible(v) { group.visible = v; },
    update(dt) {
      t += dt;
      lamp.visible = group.visible && (Math.sin(t * 6) > 0);
    },
  };
}

// Smoke clouds: a pool of translucent grey spheres, one per active
// cloud; the simulation owns the list, this only mirrors it. The mesh
// is never added to the shootables, so smoke blocks sight, not bullets.
const SMOKE_POOL = 4;
export function createSmokeClouds(scene) {
  const meshes = [];
  for (let i = 0; i < SMOKE_POOL; i++) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0x9a9a94, transparent: true, opacity: 0.55, depthWrite: false }));
    m.visible = false;
    m.scale.y = 0.55;
    scene.add(m);
    meshes.push(m);
  }
  return {
    sync(clouds, now) {
      let n = 0;
      for (let i = 0; i < clouds.length && n < SMOKE_POOL; i++) {
        const c = clouds[i];
        if (c.until <= now) continue;
        const m = meshes[n++];
        m.position.set(c.x, 1.4, c.z);
        m.visible = true;
      }
      for (let i = n; i < SMOKE_POOL; i++) meshes[i].visible = false;
    },
  };
}

export function syncCamera(camera, f) {
  camera.position.set(f.x, f.y + f.eye, f.z);
  camera.rotation.set(f.pitch, f.yaw, 0);
}
