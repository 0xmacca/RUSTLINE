// input.js — RUSTLINE keyboard / mouse / pointer-lock input. No imports.
// The game loop reads state.keys and calls takeLook() once per frame;
// R / B / G / E / 1-4 are read from state.keys by main.js, not here.

export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    pressed: new Set(),
    firing: false,
    clicked: false,
    lookX: 0,
    lookY: 0,
  };

  let locked = false;

  function requestLock() {
    if (canvas.requestPointerLock) canvas.requestPointerLock();
  }

  // Clicking the canvas grabs the pointer; the game only reads the mouse
  // while the lock is held, so menu clicks never steer the player.
  canvas.addEventListener('click', requestLock);

  document.addEventListener('pointerlockchange', function () {
    locked = document.pointerLockElement === canvas;
    if (onLockChange) onLockChange(locked);
    if (!locked) {
      state.firing = false;
      // Drop any look built up while unlocked so re-locking does not
      // whip the view around with a stale delta.
      state.lookX = 0;
      state.lookY = 0;
    }
  });

  document.addEventListener('mousemove', function (e) {
    if (!locked) return;
    state.lookX += e.movementX || 0;
    state.lookY += e.movementY || 0;
  });

  document.addEventListener('mousedown', function (e) {
    if (!locked || e.button !== 0) return;
    state.firing = true;
    // A short tap between simulation ticks must still fire once: the loop
    // consumes this flag (see clearClicked), like the key-press queue.
    state.clicked = true;
  });

  document.addEventListener('mouseup', function (e) {
    if (e.button !== 0) return;
    state.firing = false;
  });

  // Keyboard: hold state in a Set so the loop can poll any combination.
  // Repeats are ignored (a held key must not re-trigger anything).
  // Space and Tab are swallowed so the page never scrolls or shifts focus
  // mid-round; every other key is left alone for the browser.
  function onKeyDown(e) {
    if (e.repeat) return;
    if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    state.keys.add(e.code);
    state.pressed.add(e.code);
  }

  function onKeyUp(e) {
    state.keys.delete(e.code);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  // Losing the window (alt-tab etc.) must not leave a key stuck down.
  window.addEventListener('blur', function () {
    state.keys.clear();
    state.firing = false;
  });

  // Drain the accumulated look deltas; the caller applies them once
  // per frame, so a slow frame never double-applies a mouse movement.
  function takeLook() {
    const out = { x: state.lookX, y: state.lookY };
    state.lookX = 0;
    state.lookY = 0;
    return out;
  }

  // Drain one-shot key presses; the loop calls this once per tick so a
  // tap between frames is never lost on a slow machine.
  function clearPressed() {
    state.pressed.clear();
  }

  // Drain the one-shot click flag; the loop calls this once per tick.
  function clearClicked() {
    state.clicked = false;
  }

  return { state, requestLock, takeLook, clearPressed, clearClicked };
}
