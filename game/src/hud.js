// hud.js — RUSTLINE heads-up display. Original code for threejs-fps-02.
// Writes textContent / style only in the hot path; the buy panel is built
// once at creation from SHOP (the one place innerHTML is used).
import { SHOP } from './rounds.js';

const TEAM_LABEL = { vanguard: 'Vanguard', sentinel: 'Sentinels' };
const REASON_LABEL = {
  elimination: 'Elimination',
  detonation: 'Bomb detonated',
  defuse: 'Bomb defused',
  time: 'Time expired',
};
const PHASE_LABEL = { freeze: 'FREEZE', live: 'LIVE', ended: 'ROUND END' };

function $(id) {
  return document.getElementById(id);
}

function setText(el, text) {
  if (el) el.textContent = text;
}

function fmtClock(sec) {
  const s = Number.isFinite(sec) ? Math.max(0, Math.ceil(sec)) : 0;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m + ':' + (r < 10 ? '0' + r : '' + r);
}

export function createHud() {
  const el = {
    game: $('game'), hud: $('hud'), crosshair: $('crosshair'),
    hitmarker: $('hitmarker'), ammo: $('ammo'), ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'), health: $('health'),
    healthNum: $('health-num'), armorNum: $('armor-num'),
    money: $('money'), score: $('score'), scoreV: $('score-v'),
    scoreS: $('score-s'), timer: $('timer'), roundNum: $('round-num'),
    weaponName: $('weapon-name'), killfeed: $('killfeed'),
    bombStatus: $('bomb-status'), overlay: $('overlay'),
    overlayTitle: $('overlay-title'), overlayCopy: $('overlay-copy'),
    play: $('play'), buyPanel: $('buy-panel'), buyItems: $('buy-items'),
    buyMoney: $('buy-money'), banner: $('banner'),
    bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    damageFlash: $('damage-flash'), grenades: $('grenades'), hint: $('hint'),
    comms: $('comms'), slots: $('slots'),
  };
  let lastMoney = 0;
  let hitTimer = 0;
  let flashTimer = 0;

  // Build the buy menu once: one row per SHOP item, buy keys 1-5.
  if (el.buyItems) {
    el.buyItems.innerHTML = SHOP.map((it, i) =>
      '<div class="buy-row"><span class="buy-key">' + (i + 1) +
      '</span><span class="buy-name">' + it.name +
      '</span><span class="buy-desc">' + it.desc +
      '</span><span class="buy-price">$' + it.price + '</span></div>'
    ).join('');
  }

  function showOverlayEl() {
    if (el.overlay) el.overlay.style.display = 'block';
  }
  function showBannerEl() {
    if (el.banner) el.banner.style.display = 'block';
  }
  function scoreText(data) {
    if (!data || !data.score) return '';
    return data.score.vanguard + ' — ' + data.score.sentinel;
  }

  return {
    setHealth(hp, armor) {
      setText(el.healthNum, String(Math.max(0, Math.ceil(hp))));
      setText(el.armorNum, String(Math.max(0, Math.ceil(armor))));
    },
    setAmmo(mag, reserve) {
      setText(el.ammoMag, String(mag));
      setText(el.ammoReserve, String(reserve));
    },
    setMoney(m) {
      lastMoney = m;
      setText(el.money, '$' + m);
      setText(el.buyMoney, '$' + m);
    },
    setScore(v, s) {
      setText(el.scoreV, String(v));
      setText(el.scoreS, String(s));
      setText(el.score, v + ' — ' + s);
    },
    setTimer(sec, phase) {
      const label = PHASE_LABEL[phase] || '';
      setText(el.timer, fmtClock(sec) + (label ? ' ' + label : ''));
    },
    setRound(n) {
      setText(el.roundNum, String(n));
    },
    setWeapon(name) {
      setText(el.weaponName, name);
    },
    showOverlay(kind, data) {
      if (kind === 'end') {
        const winner = data && data.winner ? TEAM_LABEL[data.winner] : '';
        const reason = data && data.reason ? REASON_LABEL[data.reason] : '';
        setText(el.bannerTitle, winner ? winner + ' win the round' : 'Round over');
        setText(el.bannerSub, (reason ? reason + '  ·  ' : '') + scoreText(data));
        showBannerEl();
        return;
      }
      if (kind === 'start') {
        setText(el.overlayTitle, 'RUSTLINE');
        setText(el.overlayCopy, 'Click to play. WASD move · Mouse aim · Click shoot · R reload · G frag · F smoke · B buy · Shift sprint · Ctrl crouch. Plant at a site, defend it — first to 8 rounds.');
        if (el.play) el.play.style.display = 'block';
      } else if (kind === 'paused') {
        setText(el.overlayTitle, 'Paused');
        setText(el.overlayCopy, 'Click to resume.');
        if (el.play) el.play.style.display = 'block';
      } else if (kind === 'match') {
        const winner = data && data.winner ? TEAM_LABEL[data.winner] : '';
        setText(el.overlayTitle, winner ? winner + ' win the match' : 'Match over');
        setText(el.overlayCopy, 'Final score: ' + scoreText(data));
        if (el.play) el.play.style.display = 'block';
      }
      showOverlayEl();
    },
    hideOverlay() {
      if (el.overlay) el.overlay.style.display = 'none';
      if (el.banner) el.banner.style.display = 'none';
    },
    hitMarker(kill, holdMs) {
      if (!el.hitmarker) return;
      el.hitmarker.classList.toggle('kill', !!kill);
      el.hitmarker.style.opacity = '1';
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => { el.hitmarker.style.opacity = '0'; }, holdMs || 120);
    },
    killfeed(text) {
      if (!el.killfeed) return;
      const line = document.createElement('div');
      line.className = 'killfeed-line';
      line.textContent = text;
      el.killfeed.prepend(line);
      while (el.killfeed.children.length > 5) el.killfeed.removeChild(el.killfeed.lastChild);
    },
    bombStatus(text) {
      setText(el.bombStatus, text || '');
    },
    showBuy(show) {
      if (el.buyPanel) el.buyPanel.style.display = show ? 'block' : 'none';
      setText(el.buyMoney, '$' + lastMoney);
    },
    setSpread(px) {
      if (!el.crosshair) return;
      el.crosshair.style.setProperty('--spread', px + 'px');
      el.crosshair.style.setProperty('--gap', px + 'px');
    },
    damageFlash() {
      if (!el.damageFlash) return;
      el.damageFlash.style.opacity = '1';
      clearTimeout(flashTimer);
      flashTimer = setTimeout(() => { el.damageFlash.style.opacity = '0'; }, 120);
    },
    setBombTimer(sec) {
      if (sec == null) { setText(el.bombStatus, ''); return; }
      setText(el.bombStatus, 'BOMB ' + Math.max(0, Math.ceil(sec)) + 's');
    },
    setGrenades(n) {
      setText(el.grenades, 'Grenades: ' + n);
    },
    setComms(lines) {
      if (el.comms) el.comms.textContent = lines.join('\n');
    },
    setSlots(text) {
      setText(el.slots, text);
    },
  };
}
