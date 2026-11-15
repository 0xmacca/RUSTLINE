// minimap.js — RUSTLINE tactical map: walls, sites, player arrow, teammates
// and recently spotted enemies. Drawn on a HUD canvas every frame with
// plain 2D calls; no network, no allocation in the hot path.
export function createMinimap(canvas, world) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  const b = world.bounds;
  const sx = W / (b.maxX - b.minX);
  const sz = H / (b.maxZ - b.minZ);
  const X = (x) => (x - b.minX) * sx;
  const Z = (z) => (z - b.minZ) * sz;
  return {
    draw(state, player) {
      ctx.fillStyle = '#17130f';
      ctx.fillRect(0, 0, W, H);
      // Walls and solid cover.
      ctx.fillStyle = '#6b6156';
      for (let i = 0; i < world.colliders.length; i++) {
        const c = world.colliders[i];
        if (c.maxY < 1) continue;
        ctx.fillRect(X(c.minX), Z(c.minZ), Math.max(1, (c.maxX - c.minX) * sx), Math.max(1, (c.maxZ - c.minZ) * sz));
      }
      // Bomb sites: coloured disc + letter.
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const key of ['A', 'B']) {
        const s = world.sites[key];
        ctx.fillStyle = key === 'A' ? '#f0a830' : '#35b5b0';
        ctx.beginPath();
        ctx.arc(X(s.x), Z(s.z), 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#17130f';
        ctx.fillText(key, X(s.x), Z(s.z) + 0.5);
      }
      // A planted charge blinks on the map.
      if (state.bomb.planted && Math.floor(state.time * 2) % 2 === 0) {
        ctx.fillStyle = '#ff5a4a';
        ctx.beginPath();
        ctx.arc(X(state.bomb.x), Z(state.bomb.z), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // Smoke clouds show as grey circles while they last.
      ctx.fillStyle = '#8a8a84';
      for (let i = 0; i < state.smokeClouds.length; i++) {
        const c = state.smokeClouds[i];
        if (c.until <= state.time) continue;
        ctx.beginPath();
        ctx.arc(X(c.x), Z(c.z), 5, 0, Math.PI * 2);
        ctx.fill();
      }
      // Teammates are amber dots; enemies show only while spotted.
      for (const f of state.bots) {
        if (!f.alive) continue;
        if (f.team === player.team) {
          ctx.fillStyle = '#f0a830';
        } else if (state.time - f.spottedAt < 3) {
          ctx.fillStyle = '#ff5a4a';
        } else {
          continue;
        }
        ctx.beginPath();
        ctx.arc(X(f.x), Z(f.z), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      // The player: a white arrow pointing where they face.
      ctx.save();
      ctx.translate(X(player.x), Z(player.z));
      ctx.rotate(-player.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 5);
      ctx.lineTo(-4, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
  };
}
