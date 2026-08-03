(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const scoreEl = document.getElementById('score');
  const palletsEl = document.getElementById('pallets');
  const bestEl = document.getElementById('best');
  const finalScoreEl = document.getElementById('finalScore');
  const startScreen = document.getElementById('startScreen');
  const wrapScreen = document.getElementById('wrapScreen');
  const gameOverScreen = document.getElementById('gameOverScreen');
  const wrapProgressEl = document.getElementById('wrapProgress');

  const COLS = 10;
  const ROWS = 16;
  const PALLET_ROWS = 13;

  const shapes = [
    [[1,1],[1,1]],
    [[1,1,1]],
    [[1],[1],[1]],
    [[1,1],[1,0]],
    [[1,1],[0,1]],
    [[1,1,1],[0,1,0]],
    [[1,1,1,1]],
    [[1,1,1],[1,1,1]],
    [[1,1],[1,1],[1,1]]
  ];

  const cardboard = ['#b7793b','#c58a4a','#a96832','#d09a5c','#8f5b2e'];
  let board, current, score, pallets, running, pausedForWrap, dropTimer, lastTime, dropInterval, wrapAmount;
  let cell = 24, offsetX = 0, offsetY = 0;
  let touchStart = null;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    cell = Math.floor(Math.min((rect.width - 34) / COLS, (rect.height - 64) / ROWS));
    offsetX = Math.floor((rect.width - COLS * cell) / 2);
    offsetY = Math.floor((rect.height - ROWS * cell) / 2) - 2;
    draw();
  }

  function reset() {
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    score = 0;
    pallets = 0;
    running = true;
    pausedForWrap = false;
    dropTimer = 0;
    lastTime = performance.now();
    dropInterval = 650;
    wrapAmount = 0;
    spawn();
    updateHud();
  }

  function randomPiece() {
    const shape = shapes[Math.floor(Math.random() * shapes.length)].map(r => [...r]);
    return {
      shape,
      x: Math.floor((COLS - shape[0].length) / 2),
      y: 0,
      color: cardboard[Math.floor(Math.random() * cardboard.length)],
      tape: Math.random() > .45,
      fragile: Math.random() > .82
    };
  }

  function spawn() {
    current = randomPiece();
    if (collides(current.x, current.y, current.shape)) endGame();
  }

  function collides(px, py, shape) {
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (!shape[y][x]) continue;
        const bx = px + x;
        const by = py + y;
        if (bx < 0 || bx >= COLS || by >= ROWS) return true;
        if (by >= 0 && board[by][bx]) return true;
      }
    }
    return false;
  }

  function move(dx, dy) {
    if (!running || pausedForWrap) return;
    if (!collides(current.x + dx, current.y + dy, current.shape)) {
      current.x += dx;
      current.y += dy;
      if (dy > 0) score += 1;
    } else if (dy > 0) {
      lockPiece();
    }
    updateHud();
    draw();
  }

  function rotate() {
    if (!running || pausedForWrap) return;
    const rotated = current.shape[0].map((_, i) => current.shape.map(row => row[i]).reverse());
    for (const shift of [0, -1, 1, -2, 2]) {
      if (!collides(current.x + shift, current.y, rotated)) {
        current.shape = rotated;
        current.x += shift;
        break;
      }
    }
    draw();
  }

  function hardDrop() {
    if (!running || pausedForWrap) return;
    let distance = 0;
    while (!collides(current.x, current.y + 1, current.shape)) {
      current.y++;
      distance++;
    }
    score += distance * 2;
    lockPiece();
    updateHud();
  }

  function lockPiece() {
    current.shape.forEach((row, y) => row.forEach((v, x) => {
      if (!v) return;
      const by = current.y + y;
      if (by >= 0) board[by][current.x + x] = {
        color: current.color,
        tape: current.tape,
        fragile: current.fragile
      };
    }));

    clearFullRows();
    score += 25;
    dropInterval = Math.max(220, 650 - pallets * 35 - Math.floor(score / 800) * 20);

    if (isPalletFullEnough()) {
      beginWrap();
    } else {
      spawn();
    }
    updateHud();
    draw();
  }

  function clearFullRows() {
    let cleared = 0;
    for (let y = ROWS - 1; y >= ROWS - PALLET_ROWS; y--) {
      if (board[y].every(Boolean)) {
        board.splice(y, 1);
        board.unshift(Array(COLS).fill(null));
        cleared++;
        y++;
      }
    }
    if (cleared) score += [0, 150, 400, 800, 1400][Math.min(cleared, 4)];
  }

  function isPalletFullEnough() {
    let filled = 0;
    let total = COLS * PALLET_ROWS;
    for (let y = ROWS - PALLET_ROWS; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) if (board[y][x]) filled++;
    }
    return filled / total >= 0.72;
  }

  function beginWrap() {
    pausedForWrap = true;
    wrapAmount = 0;
    wrapProgressEl.style.width = '0%';
    wrapScreen.classList.add('visible');
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
  }

  function addWrap(amount = 9) {
    if (!pausedForWrap) return;
    wrapAmount = Math.min(100, wrapAmount + amount);
    wrapProgressEl.style.width = wrapAmount + '%';
    if (navigator.vibrate) navigator.vibrate(20);
    if (wrapAmount >= 100) finishPallet();
  }

  function finishPallet() {
    pallets++;
    score += 1000 + pallets * 150;
    board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    pausedForWrap = false;
    wrapScreen.classList.remove('visible');
    spawn();
    updateHud();
  }

  function endGame() {
    running = false;
    const best = Math.max(score, Number(localStorage.getItem('fitBest') || 0));
    localStorage.setItem('fitBest', String(best));
    finalScoreEl.textContent = score;
    updateHud();
    gameOverScreen.classList.add('visible');
  }

  function updateHud() {
    scoreEl.textContent = score;
    palletsEl.textContent = pallets;
    bestEl.textContent = Math.max(score, Number(localStorage.getItem('fitBest') || 0));
  }

  function drawWarehouseBackground(w, h) {
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#1f2937';
    for (let i = 0; i < 5; i++) {
      const y = 40 + i * 58;
      ctx.fillRect(10, y, w - 20, 6);
      ctx.fillStyle = '#334155';
      for (let x = 18; x < w - 20; x += 54) ctx.fillRect(x, y - 32, 6, 38);
      ctx.fillStyle = '#1f2937';
    }

    const grad = ctx.createLinearGradient(0, h * .6, 0, h);
    grad.addColorStop(0, '#273449');
    grad.addColorStop(1, '#0f172a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, h * .62, w, h * .38);

    ctx.strokeStyle = 'rgba(255,255,255,.055)';
    ctx.lineWidth = 1;
    for (let y = h * .64; y < h; y += 24) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  function draw() {
    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);
    drawWarehouseBackground(rect.width, rect.height);

    // danger line
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = 'rgba(251,113,133,.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(offsetX, offsetY + 3 * cell);
    ctx.lineTo(offsetX + COLS * cell, offsetY + 3 * cell);
    ctx.stroke();
    ctx.setLineDash([]);

    // pallet base
    const py = offsetY + ROWS * cell + 2;
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(offsetX - 4, py, COLS * cell + 8, 9);
    ctx.fillStyle = '#5b371e';
    for (let x = 0; x < 4; x++) ctx.fillRect(offsetX + 12 + x * (COLS * cell / 4), py + 8, 14, 8);

    // grid floor
    ctx.strokeStyle = 'rgba(255,255,255,.045)';
    ctx.lineWidth = 1;
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + y * cell);
      ctx.lineTo(offsetX + COLS * cell, offsetY + y * cell);
      ctx.stroke();
    }
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(offsetX + x * cell, offsetY);
      ctx.lineTo(offsetX + x * cell, offsetY + ROWS * cell);
      ctx.stroke();
    }

    board.forEach((row, y) => row.forEach((box, x) => {
      if (box) drawBox(x, y, box);
    }));

    if (running && current) {
      current.shape.forEach((row, y) => row.forEach((v, x) => {
        if (v) drawBox(current.x + x, current.y + y, current);
      }));
    }

    // fill indicator
    let filled = 0;
    for (let y = ROWS - PALLET_ROWS; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (board[y][x]) filled++;
    const ratio = filled / (COLS * PALLET_ROWS);
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(offsetX, offsetY - 18, COLS * cell, 8);
    ctx.fillStyle = ratio > .65 ? '#fbbf24' : '#22c55e';
    ctx.fillRect(offsetX, offsetY - 18, COLS * cell * ratio, 8);
  }

  function drawBox(gx, gy, box) {
    const x = offsetX + gx * cell;
    const y = offsetY + gy * cell;
    const pad = 1.3;

    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.fillRect(x + pad + 2, y + pad + 3, cell - pad * 2, cell - pad * 2);

    const grd = ctx.createLinearGradient(x, y, x + cell, y + cell);
    grd.addColorStop(0, lighten(box.color, 18));
    grd.addColorStop(1, box.color);
    ctx.fillStyle = grd;
    ctx.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2);

    ctx.strokeStyle = 'rgba(74,45,20,.55)';
    ctx.strokeRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2);

    if (box.tape) {
      ctx.fillStyle = 'rgba(232,220,181,.58)';
      ctx.fillRect(x + cell * .42, y + pad, cell * .16, cell - pad * 2);
    }

    ctx.fillStyle = 'rgba(255,255,255,.72)';
    ctx.fillRect(x + cell * .12, y + cell * .19, cell * .25, cell * .17);
    ctx.fillStyle = '#111827';
    for (let i = 0; i < 5; i++) ctx.fillRect(x + cell * (.145 + i * .038), y + cell * .22, 1, cell * .11);

    if (box.fragile && cell > 20) {
      ctx.fillStyle = '#ef4444';
      ctx.font = `bold ${Math.max(9, cell * .29)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('!', x + cell * .72, y + cell * .68);
    }
  }

  function lighten(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.min(255, (n >> 16) + amount);
    const g = Math.min(255, ((n >> 8) & 255) + amount);
    const b = Math.min(255, (n & 255) + amount);
    return `rgb(${r},${g},${b})`;
  }

  function loop(now) {
    const dt = now - lastTime;
    lastTime = now;
    if (running && !pausedForWrap) {
      dropTimer += dt;
      if (dropTimer >= dropInterval) {
        dropTimer = 0;
        move(0, 1);
      }
    }
    draw();
    requestAnimationFrame(loop);
  }

  function bindHold(button, action, repeat = false) {
    let interval;
    const start = e => {
      e.preventDefault();
      action();
      if (repeat) interval = setInterval(action, 110);
    };
    const stop = () => clearInterval(interval);
    button.addEventListener('pointerdown', start);
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('pointerleave', stop);
  }

  bindHold(document.getElementById('leftBtn'), () => move(-1, 0), true);
  bindHold(document.getElementById('rightBtn'), () => move(1, 0), true);
  bindHold(document.getElementById('downBtn'), () => move(0, 1), true);
  bindHold(document.getElementById('rotateBtn'), rotate);
  bindHold(document.getElementById('wrapBtn'), () => addWrap(12), true);

  document.getElementById('startBtn').addEventListener('click', () => {
    startScreen.classList.remove('visible');
    reset();
  });

  document.getElementById('restartBtn').addEventListener('click', () => {
    gameOverScreen.classList.remove('visible');
    reset();
  });

  canvas.addEventListener('pointerdown', e => {
    touchStart = { x: e.clientX, y: e.clientY, t: Date.now() };
  });
  canvas.addEventListener('pointermove', e => {
    if (pausedForWrap && touchStart) {
      const dx = e.clientX - touchStart.x;
      const dy = e.clientY - touchStart.y;
      if (Math.hypot(dx, dy) > 22) {
        addWrap(7);
        touchStart = { x: e.clientX, y: e.clientY, t: Date.now() };
      }
    }
  });
  canvas.addEventListener('pointerup', e => {
    if (!touchStart || pausedForWrap) { touchStart = null; return; }
    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    const adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx < 12 && ady < 12) rotate();
    else if (adx > ady) move(dx > 0 ? 1 : -1, 0);
    else if (dy > 0 && ady > 55) hardDrop();
    else if (dy > 0) move(0, 1);
    touchStart = null;
  });

  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft') move(-1, 0);
    if (e.key === 'ArrowRight') move(1, 0);
    if (e.key === 'ArrowDown') move(0, 1);
    if (e.key === 'ArrowUp') rotate();
    if (e.key === ' ') hardDrop();
  });

  window.addEventListener('resize', resize);
  bestEl.textContent = localStorage.getItem('fitBest') || '0';
  board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  resize();
  requestAnimationFrame(loop);
})();
