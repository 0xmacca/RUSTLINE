// RUSTLINE — Rail Yard Tactical FPS. Fixed-step sim (1/60 s) apart from
// render; one shared state store (state.js). Modules: state, world,
// player, weapon, bots, bomb, rounds, hud, input, audio, render, palette.
import { createState, createFighter, resetFighter, damageFighter, pushEvent, TICK } from './state.js';
import { createWorld } from './world.js';
import { stepPlayer, lookPlayer, recoilPlayer } from './player.js';
import { WEAPONS, createWeaponState, tryFire, startReload, stepReload, giveWeapon, createGrenade, stepGrenade, spreadFor, losBlockedBySmoke, SMOKE_LIFE } from './weapon.js';
import { createBot, assignRound, stepBot, hearNoise, resetBot } from './bots.js';
import { stepBomb } from './bomb.js';
import { startFreeze, stepRounds, buyItem } from './rounds.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, createViewmodel, updateViewmodel, createBotMeshes, updateBotMeshes, spawnTracer, updateTracers, spawnImpact, updateImpacts, createBombMesh, createSmokeClouds, syncCamera } from './render.js';
import { createMinimap } from './minimap.js';
import { PALETTE } from './palette.js';
import * as THREE from 'three';

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


const params = new URLSearchParams(location.search);
const shotMode = params.get('shot');
const shotSeed = parseInt(params.get('seed') || '7', 10) || 7;
let rng = mulberry32(13);

const { renderer, scene, camera } = createRenderer();
document.getElementById('game').appendChild(renderer.domElement);
const world = createWorld(scene);
const state = createState();
const hud = createHud();
const audio = createAudio();
const bombMesh = createBombMesh(scene);
const smokeClouds = createSmokeClouds(scene);

const player = createFighter('player', 'vanguard', 'player');
state.player = player;
const bots = [];
for (let i = 1; i <= 4; i++) bots.push(createBot('v' + i, 'vanguard', world.spawns.vanguard[i - 1], i === 1 ? 'planter' : (i === 2 ? 'holder' : 'rifler')));
for (let i = 1; i <= 5; i++) bots.push(createBot('s' + i, 'sentinel', world.spawns.sentinel[i - 1], i === 1 ? 'holder' : 'rifler'));
state.bots = bots;
const botMeshes = createBotMeshes(scene, bots);
const minimap = createMinimap(document.getElementById('minimap'), world);
const vm = createViewmodel(camera);
const ray = new THREE.Raycaster();
const losRay = new THREE.Raycaster();
const grenades = [];
const v3 = new THREE.Vector3();
const dir3 = new THREE.Vector3();

let started = false, frozen = false, buyOpen = false;
let prevFiring = false, prevKeys = new Set(), grenadeMode = false;
let ws = createWeaponState('p9');
const owned = new Set(['p9']);
const wsMap = { p9: ws };
let last = {};
const input = createInput(renderer.domElement, (locked) => {
  if (locked) { started = true; audio.init(); hud.hideOverlay(); }
  else if (started && state.phase === 'live' && !shotMode) hud.showOverlay('paused');
});
document.getElementById('play').addEventListener('click', () => { audio.init(); input.requestLock(); });

function spawnAll() {
  state.comms.length = 0;
  resetFighter(player, world.spawns.vanguard[0]);
  player.weapon = 'p9';
  ws = wsMap.p9; ws.mag = player.mag; ws.reserve = player.reserve;
  const roles = ['planter', 'holder', 'rifler', 'rifler', 'holder', 'rifler', 'rifler', 'rifler', 'rifler'];
  bots.forEach((b, i) => {
    const sp = b.team === 'vanguard' ? world.spawns.vanguard[(i % 4) + 1] : world.spawns.sentinel[i - 4];
    resetBot(b, sp, roles[i]);
  });
  assignRound(bots, state, world, rng);
  state.bomb.carrier = 'player'; player.hasBomb = true;
  state.bomb.planted = false; state.bomb.plantProgress = 0; state.bomb.defuseProgress = 0;
  bombMesh.setVisible(false);
}

function switchWeapon(name) {
  if (!owned.has(name)) return;
  wsMap[player.weapon] = ws;
  ws = wsMap[name] || (wsMap[name] = createWeaponState(name));
  giveWeapon(player, name);
  player.mag = ws.mag; player.reserve = ws.reserve;
  hud.setWeapon(WEAPONS[name].name);
  audio.click();
}

function muzzlePos(out) {
  camera.getWorldDirection(dir3);
  out.copy(camera.position).addScaledVector(dir3, 0.6);
  out.y -= 0.12; out.x += Math.cos(player.yaw) * 0.18;
  return out;
}
// A carrier who dies drops the charge where they fell; until this ran the
// bomb stayed glued to a dead carrier and the round could not be planted.
function dropBombAt(f) {
  state.bomb.x = f.x; state.bomb.z = f.z; state.bomb.carrier = null;
}
function los(ax, ay, az, bx, by, bz) {
  if (losBlockedBySmoke(ax, az, bx, bz, state.smokeClouds, state.time)) return false;
  v3.set(bx - ax, by - ay, bz - az);
  const d = v3.length();
  if (d < 0.01) return true;
  losRay.set(new THREE.Vector3(ax, ay, az), v3.normalize());
  losRay.far = d;
  return losRay.intersectObjects(world.shootables, false).length === 0;
}
function firePlayer() {
  const def = WEAPONS[player.weapon];
  const moving = player.speed2d > 0.5;
  if (!tryFire(ws, def, TICK, moving)) { if (ws.mag === 0) audio.dry(); return; }
  player.mag = ws.mag; player.reserve = ws.reserve;
  const sp = spreadFor(def, moving, player.crouched, player.speed2d);
  camera.getWorldDirection(dir3);
  dir3.x += (rng() - 0.5) * 2 * sp; dir3.y += (rng() - 0.5) * 2 * sp; dir3.z += (rng() - 0.5) * 2 * sp;
  dir3.normalize();
  ray.set(camera.position, dir3);
  ray.far = def.range;
  const targets = world.shootables.concat(botMeshes.hitMeshes);
  const hits = ray.intersectObjects(targets, false);
  const from = muzzlePos(new THREE.Vector3());
  let end = camera.position.clone().addScaledVector(dir3, def.range);
  if (hits.length) {
    const h = hits[0];
    end = h.point.clone();
    const ud = h.object.userData;
    if (ud && ud.fighter) {
      const tgt = ud.fighter;
      const dmg = def.damage * (ud.part === 'head' ? def.headMult : 1);
      const res = damageFighter(tgt, dmg, player);
      if (res === 'dropped') dropBombAt(tgt);
      hud.hitMarker(res === 'dead');
      audio.hit();
      if (res === 'dead') {
        player.kills++; state.money += 300;
        hud.killfeed('You [' + def.name + (ud.part === 'head' ? ' HS' : '') + '] ▸ ' + (tgt.name || tgt.id));
        pushEvent(state, 'You eliminated ' + (tgt.name || tgt.id));
        audio.kill();
      }
    } else {
      spawnImpact(scene, h.point, new THREE.Vector3(0, 1, 0));
    }
  }
  spawnTracer(scene, from, end, def.tracer);
  recoilPlayer(player, def.recoil, (rng() - 0.5) * def.recoil);
  vm.flash.visible = true;
  audio.shot(player.weapon);
  if (ws.mag === 0) audio.dry();
}

function shootAt(shooter, tx, ty, tz, spread) {
  const def = WEAPONS[shooter.weapon] || WEAPONS.kestrel;
  const ox = shooter.x, oy = shooter.y + shooter.eye, oz = shooter.z;
  dir3.set(tx - ox, ty - oy, tz - oz);
  const dist = dir3.length();
  if (dist < 0.01 || dist > def.range) return;
  dir3.normalize();
  dir3.x += (rng() - 0.5) * 2 * spread; dir3.y += (rng() - 0.5) * 2 * spread;
  dir3.normalize();
  ray.set(new THREE.Vector3(ox, oy, oz), dir3);
  ray.far = def.range;
  const targets = world.shootables.concat(botMeshes.hitMeshes);
  const hits = ray.intersectObjects(targets, false);
  const from = new THREE.Vector3(ox, oy - 0.1, oz);
  let end = new THREE.Vector3(ox, oy, oz).addScaledVector(dir3, def.range);
  if (hits.length) {
    const h = hits[0];
    end = h.point.clone();
    const ud = h.object.userData;
    if (ud && ud.fighter && ud.fighter.team !== shooter.team) {
      const tgt = ud.fighter;
      const dmg = def.damage * (ud.part === 'head' ? def.headMult : 1);
      const res = damageFighter(tgt, dmg, shooter);
      if (res === 'dropped') dropBombAt(tgt);
      if (tgt === player) { hud.damageFlash(); audio.hurt(); }
      if (res === 'dead' && tgt === player) hud.killfeed((shooter.name || shooter.id) + ' [' + def.name + (ud.part === 'head' ? ' HS' : '') + '] ▸ You');
      if (res === 'dead' && shooter.team === 'vanguard') hud.killfeed((shooter.name || shooter.id) + ' [' + def.name + (ud.part === 'head' ? ' HS' : '') + '] ▸ ' + (tgt.name || tgt.id));
    } else if (!ud || !ud.fighter) {
      spawnImpact(scene, h.point, new THREE.Vector3(0, 1, 0));
    }
  }
  const col = shooter.team === 'vanguard' ? PALETTE.tracerVanguard : PALETTE.tracerSentinel;
  spawnTracer(scene, from, end, col);
  shooter.lastShotAt = state.time;
  const dx = shooter.x - player.x, dz = shooter.z - player.z;
  if (dx * dx + dz * dz < 900) audio.shot(shooter.weapon);
}

const botCtx = {
  los,
  shootAt,
  noise: (x, z, loud) => hearNoise(x, z, loud),
  rng,
};

function edge(code) { return input.state.pressed.has(code); }

function stepSim(dt) {
  const keys = input.state.keys;
  // The fire cooldown decays every tick, not only while the trigger is
  // held — otherwise a tap between ticks could never fire again.
  if (ws.cooldown > 0) ws.cooldown -= dt;
  if (started && !shotMode) {
    const look = input.takeLook();
    if (look.x || look.y) lookPlayer(player, look.x, look.y);
  }
  const def = WEAPONS[player.weapon];
  if (state.phase === 'live' && player.alive) {
    const wantFire = input.state.firing || input.state.clicked;
    const semi = !def.auto;
    if (wantFire && (!semi || !prevFiring)) firePlayer();
    prevFiring = wantFire;
    if (edge('KeyR') && ws.mag < def.mag && ws.reserve > 0 && !ws.reloading) { startReload(ws, def); audio.reload(); }
    if (edge('KeyG') && player.grenades > 0) {
      camera.getWorldDirection(dir3);
      grenades.push(createGrenade(camera.position.x + dir3.x * 0.5, camera.position.y, camera.position.z + dir3.z * 0.5, dir3.x * 14, 3, dir3.z * 14, 'vanguard'));
      player.grenades--; audio.click();
    }
    if (edge('KeyF') && player.smokes > 0) {
      camera.getWorldDirection(dir3);
      grenades.push(createGrenade(camera.position.x + dir3.x * 0.5, camera.position.y, camera.position.z + dir3.z * 0.5, dir3.x * 14, 3, dir3.z * 14, 'vanguard', 'smoke'));
      player.smokes--; audio.click();
    }
    if (edge('Digit1')) switchWeapon('p9');
    if (edge('Digit2')) switchWeapon('vk7');
    if (edge('Digit3')) switchWeapon('kestrel');
    if (edge('Digit4')) { grenadeMode = true; audio.click(); }
  }
  if (state.phase === 'freeze') {
    if (edge('KeyB')) { buyOpen = !buyOpen; hud.showBuy(buyOpen); audio.click(); }
    if (buyOpen) {
      if (edge('Digit1') && buyItem(state, 'vk7')) { owned.add('vk7'); wsMap.vk7 = createWeaponState('vk7'); audio.click(); }
      if (edge('Digit2') && buyItem(state, 'kestrel')) { owned.add('kestrel'); wsMap.kestrel = createWeaponState('kestrel'); audio.click(); }
      if (edge('Digit3') && buyItem(state, 'grenade')) { player.grenades++; audio.click(); }
      if (edge('Digit4') && buyItem(state, 'armor')) { audio.click(); }
      if (edge('Digit5') && buyItem(state, 'smoke')) { audio.click(); }
    }
  }
  if (ws.reloading) {
    if (stepReload(ws, def, dt)) { player.mag = ws.mag; player.reserve = ws.reserve; hud.setAmmo(ws.mag, ws.reserve); }
  }
  stepPlayer(player, dt, keys, world.colliders, world.bounds);
  player.mag = ws.mag; player.reserve = ws.reserve;
  if (state.phase === 'live') for (const b of bots) if (b.alive) stepBot(b, state, world, dt, botCtx);
  for (let i = grenades.length - 1; i >= 0; i--) {
    const gres = stepGrenade(grenades[i], dt, world.colliders, world.bounds);
    if (gres === 'smoke') {
      const g = grenades[i];
      grenades.splice(i, 1);
      state.smokeClouds.push({ x: g.x, z: g.z, until: state.time + SMOKE_LIFE });
      audio.click();
      continue;
    }
    if (gres === 'explode') {
      const g = grenades[i];
      grenades.splice(i, 1);
      audio.explosion();
      spawnImpact(scene, new THREE.Vector3(g.x, g.y, g.z), new THREE.Vector3(0, 1, 0));
      for (const f of [player, ...bots]) {
        if (!f.alive) continue;
        const d = Math.hypot(f.x - g.x, f.z - g.z);
        if (d < 6) {
          const res = damageFighter(f, Math.round(90 * (1 - d / 6)), player);
          if (res === 'dropped') dropBombAt(f);
          if (f === player) { hud.damageFlash(); audio.hurt(); }
          if (res === 'dead' && f !== player) { player.kills++; state.money += 300; hud.killfeed('You ▸ ' + f.id); }
        }
      }
    }
  }
  const bombResult = stepBomb(state, world, dt, player.alive ? keys : null);
  if (bombResult === 'detonated' || bombResult === 'defused') audio.beep();
  const ev = stepRounds(state, dt, bombResult);
  if (ev) handleRoundEvent(ev);
  prevKeys = new Set(keys);
  input.clearPressed();
  input.clearClicked();
  state.time += dt;
}

function handleRoundEvent(ev) {
  if (ev.type === 'roundEnd') {
    // stepRounds awarded it internally; no second award (no double-count).
    hud.showOverlay('end', { winner: ev.winner, reason: ev.reason, score: state.score });
    if (ev.winner === 'vanguard') audio.roundWin(); else audio.roundLose();
  } else if (ev.type === 'roundStart') {
    // Freeze already expired: stepRounds moved the phase to live.
    // Do NOT re-freeze or respawn here — that used to loop forever.
    hud.hideOverlay();
    hud.showBuy(false); buyOpen = false;
  } else if (ev.type === 'nextRound') {
    rng = mulberry32(state.round * 7919 + 13);
    botCtx.rng = rng;
    spawnAll();
    startFreeze(state);
    hud.setRound(state.round);
    hud.hideOverlay();
    hud.showBuy(false); buyOpen = false;
  } else if (ev.type === 'matchEnd') {
    hud.showOverlay('match', { winner: ev.winner, score: state.score });
    if (ev.winner === 'vanguard') audio.roundWin(); else audio.roundLose();
  }
}

function setHud(key, val, fn) {
  if (last[key] !== val) { last[key] = val; fn(val); }
}
function updateHud() {
  setHud('hp', player.health, () => hud.setHealth(player.health, player.armor));
  setHud('ammo', player.mag + '/' + player.reserve, () => hud.setAmmo(player.mag, player.reserve));
  setHud('money', state.money, (v) => hud.setMoney(v));
  setHud('score', state.score.vanguard + '-' + state.score.sentinel, () => hud.setScore(state.score.vanguard, state.score.sentinel));
  setHud('round', state.round, (v) => hud.setRound(v));
  setHud('timer', Math.ceil(state.phaseTime), (v) => hud.setTimer(v, state.phase));
  setHud('nades', player.grenades, (v) => hud.setGrenades(v));
  setHud('comms', state.comms.join('|'), () => hud.setComms(state.comms));
  const slotText = ['p9', 'vk7', 'kestrel'].map((n, i) => {
    if (!owned.has(n)) return (i + 1) + ' —';
    return player.weapon === n ? '[' + (i + 1) + ' ' + WEAPONS[n].name + ']' : (i + 1) + ' ' + WEAPONS[n].name;
  }).join('  ') + '   4 Nades×' + player.grenades + '   5 Smoke×' + player.smokes;
  setHud('slots', slotText, () => hud.setSlots(slotText));
  setHud('bomb', state.bomb.planted ? 'planted' : (state.bomb.carrier || ''), () => {
    hud.bombStatus(state.bomb.planted ? 'Charge planted — ' + Math.ceil(state.bomb.timer) + 's' : (player.hasBomb ? 'You carry the charge' : 'Charge: ' + (state.bomb.carrier || '—')));
    hud.setBombTimer(state.bomb.planted ? state.bomb.timer : 0);
  });
  const def = WEAPONS[player.weapon];
  const sp = spreadFor(def, player.speed2d > 0.5, player.crouched, player.speed2d);
  hud.setSpread(Math.round(6 + sp * 900));
}

function renderFrame(dt) {
  syncCamera(camera, player);
  minimap.draw(state, player);
  updateViewmodel(vm, dt, player.speed2d > 0.5, input.state.firing && player.alive, ws.reloading > 0);
  updateBotMeshes(botMeshes, bots, state.time);
  updateTracers(dt);
  updateImpacts(dt);
  smokeClouds.sync(state.smokeClouds, state.time);
  bombMesh.update(dt);
  if (state.bomb.planted) bombMesh.setPlanted(state.bomb.x, state.bomb.z);
  renderer.render(scene, camera);
}

let acc = 0, lastT = 0;
function loop(t) {
  if (frozen) return;
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (t - lastT) / 1000 || 0);
  lastT = t;
  if (started || shotMode) {
    acc += dt;
    let n = 0;
    while (acc >= TICK && n < 5) { stepSim(TICK); acc -= TICK; n++; }
    if (n === 5) acc = 0;
  }
  updateHud();
  renderFrame(dt);
}

function setupShot(mode) {
  const srng = mulberry32(shotSeed);
  started = true;
  rng = srng; botCtx.rng = srng;
  spawnAll();
  hud.hideOverlay();
  if (mode === 'buy') {
    state.phase = 'freeze'; state.phaseTime = 20;
    buyOpen = true; hud.showBuy(true);
    hud.setMoney(state.money);
  } else if (mode === 'plant') {
    state.phase = 'live'; state.phaseTime = 60;
    state.bomb.planted = true; state.bomb.site = 'A'; state.bomb.timer = 35;
    state.bomb.x = world.sites.A.x; state.bomb.z = world.sites.A.z;
    player.x = -16; player.z = -10; player.yaw = Math.atan2(-(world.sites.A.x - player.x), -(world.sites.A.z - player.z));
    player.hasBomb = false; state.bomb.carrier = null;
    bombMesh.setPlanted(state.bomb.x, state.bomb.z);
  } else if (mode === 'win') {
    state.phase = 'ended';
    state.score.vanguard = 1; state.score.sentinel = 0;
    hud.showOverlay('end', { winner: 'vanguard', reason: 'Charge detonated', score: state.score });
  } else {
    state.phase = 'live'; state.phaseTime = 60;
    player.x = 0; player.z = 12; player.yaw = 0; player.pitch = 0;
    const e = bots.find((b) => b.id === 's1');
    if (e) { e.x = 1.5; e.z = -6; e.yaw = Math.PI; }
    bots.forEach((b, i) => { if (b.id !== 's1') { b.x = -20 + srng() * 40; b.z = -18 + srng() * 30; } });
  }
  updateHud();
  renderFrame(1 / 60);
  renderFrame(1 / 60);
  window.__shotReady = true;
  frozen = true;
}

spawnAll();
startFreeze(state);
// Live-test hook (read-only): play-tests read bot positions, the bomb
// state and the player's pitch through this; the game never reads it back.
window.__rustline = { state, world, bots, player };
hud.setRound(state.round);
hud.setWeapon(WEAPONS.p9.name);
hud.setMoney(state.money);
hud.showOverlay('start');
if (shotMode) setupShot(shotMode);
else requestAnimationFrame(loop);
