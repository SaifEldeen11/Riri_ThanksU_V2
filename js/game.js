// ---------------------------------------------------------------------------
// PIXEL QUEST — game engine
// Vanilla JS, HTML5 Canvas. No frameworks, no build step.
// ---------------------------------------------------------------------------

// ---- DOM refs -------------------------------------------------------------
const canvasEl = document.getElementById('gameCanvas');
const ctx      = canvasEl.getContext('2d');
const candyEl  = document.getElementById('candy-popup');
const modalEl  = document.getElementById('victory-modal');
const lossModalEl = document.getElementById('loss-modal');

// ---- Core constants --------------------------------------------------------
const GAME_W = 800, GAME_H = 480;
const TILE = 40;
const WORLD_ROWS = 12; // rows 0..11 (480 / 40)

// ---- Level definition -------------------------------------------------------
// Every floating platform reachable directly from the ground sits at ROW 8
// (a 2-tile / 80px rise — comfortably inside the jump's max ~127px reach).
// Anything higher (row 7/6/5) is only ever placed 1-2 rows above a platform
// that's already reachable, so no single jump ever needs more than a safe,
// forgiving hop. The two pits are bridged with a low (row 9) stepping stone
// in the middle, so the level is always completable even if you skip every
// bonus platform/coin block.
const LEVEL = {
  widthInTiles: 76,
  groundRow: 10,
  groundRanges: [[0, 9], [12, 19], [22, 33], [37, 50], [54, 75]],
  platforms: [
    { col: 6,  row: 8, length: 3 },  // direct hop from ground
    { col: 14, row: 8, length: 3 },  // direct hop from ground
    { col: 18, row: 9, length: 2 },  // low bonus step
    { col: 24, row: 8, length: 3 },  // direct hop from ground
    { col: 35, row: 9, length: 1 },  // stepping stone across pit #1
    { col: 40, row: 9, length: 2 },  // direct hop from ground
    { col: 43, row: 7, length: 2 },  // chained hop from the row-9 platform above
    { col: 52, row: 9, length: 1 },  // stepping stone across pit #2
    { col: 60, row: 8, length: 3 },  // direct hop from ground
    { col: 64, row: 7, length: 2 },  // chained hop from the row-8 platform above
  ],
  qBlocks: [                         // "lucky" blocks — hit from below for coins
    { col: 7,  row: 6 },
    { col: 25, row: 6 },
    { col: 26, row: 6 },
    { col: 61, row: 6 },
    { col: 65, row: 5 },
  ],
  chest: { col: 72, row: 10 },
};
const LEVEL_WIDTH_PX = LEVEL.widthInTiles * TILE;

// ---- Tile lookup tables ------------------------------------------------------
const solidTiles = new Set();
const tileType = new Map();
function tileKey(c, r) { return c + ',' + r; }

function buildTiles() {
  solidTiles.clear();
  tileType.clear();

  LEVEL.groundRanges.forEach(([start, end]) => {
    for (let c = start; c <= end; c++) {
      for (let r = LEVEL.groundRow; r < WORLD_ROWS; r++) {
        const k = tileKey(c, r);
        solidTiles.add(k);
        tileType.set(k, r === LEVEL.groundRow ? 'groundTop' : 'groundFill');
      }
    }
  });

  LEVEL.platforms.forEach(p => {
    for (let i = 0; i < p.length; i++) {
      const k = tileKey(p.col + i, p.row);
      solidTiles.add(k);
      tileType.set(k, 'platform');
    }
  });

  LEVEL.qBlocks.forEach(q => {
    const k = tileKey(q.col, q.row);
    solidTiles.add(k);
    tileType.set(k, 'qblock');
  });
}
buildTiles();
function isSolid(c, r) { return solidTiles.has(tileKey(c, r)); }

// ---- Coin system (lucky blocks) ----------------------------------------------
// Each qBlock gets 1-3 coins, re-randomized every time the page loads (and
// every time the player hits "Play Again") for replay variety.
let qBlockCoins = new Map();    // tileKey -> coins remaining
let qBlockBumpTime = new Map(); // tileKey -> timestamp of last hit (for bounce fx)
let coinPops = [];              // floating "+coin" animations in flight
let score = 0;

function generateQBlockCoins() {
  qBlockCoins = new Map();
  qBlockBumpTime = new Map();
  LEVEL.qBlocks.forEach(q => {
    const key = tileKey(q.col, q.row);
    const coinCount = 1 + Math.floor(Math.random() * 3); // random 1, 2, or 3
    qBlockCoins.set(key, coinCount);
  });
}

function handleQBlockHit(col, row) {
  const key = tileKey(col, row);
  qBlockBumpTime.set(key, performance.now()); // always bounce, even if empty
  const remaining = qBlockCoins.get(key) || 0;
  if (remaining > 0) {
    qBlockCoins.set(key, remaining - 1);
    score++;
    spawnCoinPop(col, row);
  }
}

function spawnCoinPop(col, row) {
  coinPops.push({ x: col * TILE + TILE / 2, y: row * TILE, start: performance.now() });
}

// ---- Chest (fixed world position) --------------------------------------------
const CHEST_W = 32, CHEST_H = 32;
const CHEST_X = LEVEL.chest.col * TILE + 4;
const CHEST_Y = LEVEL.chest.row * TILE - CHEST_H;

// ---- Player entity ------------------------------------------------------------
const player = {
  x: 40, y: LEVEL.groundRow * TILE - 32, w: 32, h: 32,
  vx: 0, vy: 0,
  onGround: false,
  facing: 1,
};
const SPAWN = { x: player.x, y: player.y };

// Movement tuned slightly slower/floatier than before per feedback.
const MOVE_ACCEL   = 0.45;  // was 0.6
const MOVE_MAX      = 3.3;  // was 4.2
const FRICTION      = 0.82;
const GRAVITY        = 0.7;
const JUMP_VELOCITY  = -13;
const MAX_FALL_SPEED = 18;

// ---- Camera ---------------------------------------------------------------
const camera = { x: 0 };
function updateCamera() {
  camera.x = player.x + player.w / 2 - GAME_W / 2;
  camera.x = Math.max(0, Math.min(camera.x, LEVEL_WIDTH_PX - GAME_W));
}

// ---- Game / win state -------------------------------------------------------
const state = { won: false, lost: false, chestBounceStart: 0 };

// ---- Input ------------------------------------------------------------------
const keys = { left: false, right: false, jumpHeld: false, jumpPressed: false };

function setupInput() {
  window.addEventListener('keydown', (e) => {
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') keys.left = true;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = true;
    if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') {
      if (!keys.jumpHeld) keys.jumpPressed = true;
      keys.jumpHeld = true;
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft'  || e.code === 'KeyA') keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') keys.right = false;
    if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Space') keys.jumpHeld = false;
  });

  bindHoldButton('btn-left',  (v) => { keys.left = v; });
  bindHoldButton('btn-right', (v) => { keys.right = v; });
  bindHoldButton('btn-jump',  (v) => {
    if (v && !keys.jumpHeld) keys.jumpPressed = true;
    keys.jumpHeld = v;
  });
}

function bindHoldButton(id, setter) {
  const el = document.getElementById(id);
  const down = (e) => { e.preventDefault(); setter(true); };
  const up   = (e) => { e.preventDefault(); setter(false); };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointerleave', up);
  el.addEventListener('pointercancel', up);
}

// ---- Physics & collision -----------------------------------------------------
function updatePlayer() {
  if (state.won || state.lost) return; // freeze on victory or loss

  if (keys.left)  { player.vx -= MOVE_ACCEL; player.facing = -1; }
  if (keys.right) { player.vx += MOVE_ACCEL; player.facing = 1; }
  if (!keys.left && !keys.right) player.vx *= FRICTION;
  player.vx = Math.max(-MOVE_MAX, Math.min(MOVE_MAX, player.vx));
  if (Math.abs(player.vx) < 0.05) player.vx = 0;

  if (keys.jumpPressed && player.onGround) {
    player.vy = JUMP_VELOCITY;
  }
  keys.jumpPressed = false;

  player.vy = Math.min(player.vy + GRAVITY, MAX_FALL_SPEED);
  player.onGround = false;

  moveAndCollide(player, player.vx, 0);
  moveAndCollide(player, 0, player.vy);

  if (player.y > GAME_H + 200) triggerLoss(); // fell into a pit

  checkChestCollision();
}

function moveAndCollide(entity, dx, dy) {
  if (dx !== 0) { entity.x += dx; resolveAxis(entity, 'x', dx); }
  if (dy !== 0) { entity.y += dy; resolveAxis(entity, 'y', dy); }
}

function resolveAxis(entity, axis, delta) {
  const minCol = Math.floor(entity.x / TILE);
  const maxCol = Math.floor((entity.x + entity.w) / TILE);
  const minRow = Math.floor(entity.y / TILE);
  const maxRow = Math.floor((entity.y + entity.h) / TILE);

  for (let c = minCol; c <= maxCol; c++) {
    for (let r = minRow; r <= maxRow; r++) {
      if (!isSolid(c, r)) continue;
      const tx = c * TILE, ty = r * TILE;
      const overlap = entity.x < tx + TILE && entity.x + entity.w > tx &&
                       entity.y < ty + TILE && entity.y + entity.h > ty;
      if (!overlap) continue;

      if (axis === 'x') {
        if (delta > 0) entity.x = tx - entity.w;
        else if (delta < 0) entity.x = tx + TILE;
        entity.vx = 0;
      } else {
        if (delta > 0) {
          entity.y = ty - entity.h; entity.vy = 0; entity.onGround = true;
        } else if (delta < 0) {
          entity.y = ty + TILE; entity.vy = 0;
          // Hit a lucky block from underneath -> classic Mario "bump"
          if (tileType.get(tileKey(c, r)) === 'qblock') handleQBlockHit(c, r);
        }
      }
    }
  }
}

function respawnPlayer() {
  player.x = SPAWN.x; player.y = SPAWN.y;
  player.vx = 0; player.vy = 0;
}

// ---- Win logic ----------------------------------------------------------------
function checkChestCollision() {
  if (state.won || state.lost) return;
  const overlap = player.x < CHEST_X + CHEST_W && player.x + player.w > CHEST_X &&
                  player.y < CHEST_Y + CHEST_H && player.y + player.h > CHEST_Y;
  if (overlap) triggerWin();
}

function triggerWin() {
  state.won = true;
  state.chestBounceStart = performance.now();
  updateCandyPosition();
  candyEl.classList.add('show');
  setTimeout(() => showModal(modalEl), 700);
}

function triggerLoss() {
  state.lost = true;
  respawnPlayer();
  showModal(lossModalEl);
}

function showModal(modal) {
  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('visible'));
}

function resetGame() {
  player.x = SPAWN.x; player.y = SPAWN.y;
  player.vx = 0; player.vy = 0; player.onGround = false; player.facing = 1;
  camera.x = 0;
  state.won = false;
  state.lost = false;
  modalEl.classList.remove('visible');
  modalEl.classList.add('hidden');
  lossModalEl.classList.remove('visible');
  lossModalEl.classList.add('hidden');
  candyEl.classList.remove('show');

  // Fresh coin distribution + score every time the player replays
  generateQBlockCoins();
  coinPops = [];
  score = 0;
}
document.getElementById('play-again-btn').addEventListener('click', resetGame);
document.getElementById('try-again-btn').addEventListener('click', resetGame);

// ---- Candy DOM sync (percentage-based, scales with any canvas size) ----------
function updateCandyPosition() {
  const screenX = CHEST_X - camera.x + CHEST_W / 2;
  const screenY = CHEST_Y;
  candyEl.style.left = (screenX / GAME_W * 100) + '%';
  candyEl.style.top  = (screenY / GAME_H * 100) + '%';
}

// ---- Background (parallax) ----------------------------------------------------
let backgroundImg = null; // set if assets/background.png loads successfully

function drawBackground() {
  if (backgroundImg) {
    const w = backgroundImg.width;
    const offset = -((camera.x * 0.4) % w);
    for (let x = offset - w; x < GAME_W; x += w) {
      ctx.drawImage(backgroundImg, x, GAME_H - backgroundImg.height, w, backgroundImg.height);
    }
    return;
  }
  const grad = ctx.createLinearGradient(0, 0, 0, GAME_H);
  grad.addColorStop(0, '#5c94fc');
  grad.addColorStop(1, '#8fc7ff');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  drawParallax(drawCloudCluster, 0.15, 500);
  drawParallax(drawHillCluster, 0.35, 400);
  drawParallax(drawBushCluster, 0.55, 300);
}

function drawParallax(drawFn, speed, patternWidth) {
  const offset = -((camera.x * speed) % patternWidth);
  const copies = Math.ceil(GAME_W / patternWidth) + 2;
  for (let i = -1; i < copies; i++) drawFn(offset + i * patternWidth);
}

function drawCloudCluster(baseX) {
  ctx.fillStyle = '#ffffff';
  [[0, 60, 60, 20], [15, 50, 40, 20], [40, 65, 50, 18]].forEach(([dx, y, w, h]) => {
    ctx.fillRect(baseX + dx, y, w, h);
  });
}
function drawHillCluster(baseX) {
  ctx.fillStyle = '#3aa02f';
  ctx.beginPath(); ctx.arc(baseX + 60, GAME_H - 100, 70, Math.PI, 0); ctx.fill();
  ctx.beginPath(); ctx.arc(baseX + 200, GAME_H - 90, 55, Math.PI, 0); ctx.fill();
}
function drawBushCluster(baseX) {
  ctx.fillStyle = '#2f8a27';
  [[0, 0], [26, 4], [52, 0]].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.arc(baseX + dx + 18, GAME_H - 40 + dy, 20, Math.PI, 0);
    ctx.fill();
  });
}

// ---- Tile & chest rendering -----------------------------------------------
function drawBrickTile(x, y, base) {
  ctx.fillStyle = base;
  ctx.fillRect(x, y, TILE, TILE);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y + TILE / 2); ctx.lineTo(x + TILE, y + TILE / 2);
  ctx.moveTo(x + TILE / 2, y); ctx.lineTo(x + TILE / 2, y + TILE / 2);
  ctx.moveTo(x + TILE / 4, y + TILE / 2); ctx.lineTo(x + TILE / 4, y + TILE);
  ctx.moveTo(x + TILE * 3 / 4, y + TILE / 2); ctx.lineTo(x + TILE * 3 / 4, y + TILE);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
}

// Draws a lucky block — golden with "?" while it still has coins,
// dulled out (classic "used block" look) once emptied.
function drawQBlock(x, y, remaining) {
  if (remaining > 0) {
    ctx.fillStyle = '#f0b93d';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = '#8a5a1c';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
    ctx.fillStyle = '#fff8e7';
    ctx.font = 'bold ' + Math.floor(TILE * 0.55) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x + TILE / 2, y + TILE / 2 + 2);
  } else {
    ctx.fillStyle = '#8a5a3a';
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = '#5c3a22';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
  }
}

function drawTiles() {
  const firstCol = Math.max(0, Math.floor(camera.x / TILE) - 1);
  const lastCol  = Math.min(LEVEL.widthInTiles - 1, Math.ceil((camera.x + GAME_W) / TILE) + 1);

  for (let c = firstCol; c <= lastCol; c++) {
    for (let r = 0; r < WORLD_ROWS; r++) {
      const type = tileType.get(tileKey(c, r));
      if (!type) continue;
      const x = c * TILE - camera.x;
      const y = r * TILE;

      if (type === 'groundTop')      drawBrickTile(x, y, '#b45f34');
      else if (type === 'groundFill') drawBrickTile(x, y, '#8a4526');
      else if (type === 'platform')   drawBrickTile(x, y, '#b45f34');
      else if (type === 'qblock') {
        const key = tileKey(c, r);
        const remaining = qBlockCoins.get(key) ?? 0;
        const bumpStart = qBlockBumpTime.get(key);
        let offsetY = 0;
        if (bumpStart) {
          const elapsed = performance.now() - bumpStart;
          if (elapsed < 160) offsetY = -6 * Math.sin((elapsed / 160) * Math.PI);
        }
        drawQBlock(x, y + offsetY, remaining);
      }
    }
  }
}

function drawChest() {
  const img = state.won ? sprites.chestOpen : sprites.chestClosed;
  let scale = 1;
  if (state.won) {
    const elapsed = performance.now() - state.chestBounceStart;
    if (elapsed < 350) scale = 1 + 0.22 * Math.sin((elapsed / 350) * Math.PI);
  }
  const dw = CHEST_W * scale, dh = CHEST_H * scale;
  const dx = CHEST_X - camera.x - (dw - CHEST_W) / 2;
  const dy = CHEST_Y - (dh - CHEST_H);
  ctx.drawImage(img, dx, dy, dw, dh);
}

// ---- Coin pop animation (floats up + fades after a lucky-block hit) ----------
function drawCoinPops() {
  const now = performance.now();
  for (let i = coinPops.length - 1; i >= 0; i--) {
    const p = coinPops[i];
    const elapsed = now - p.start;
    if (elapsed > 500) { coinPops.splice(i, 1); continue; }
    const t = elapsed / 500;
    const riseY = p.y - t * 46;
    const size = 22;
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.drawImage(sprites.coin, p.x - camera.x - size / 2, riseY - size, size, size);
    ctx.restore();
  }
}

// ---- HUD: coin counter, fixed top-right, unaffected by camera scroll --------
function drawHUD() {
  const iconSize = 26;
  const boxX = GAME_W - 132, boxY = 8, boxW = 124, boxH = 34;
  ctx.fillStyle = 'rgba(20,20,26,0.55)';
  ctx.fillRect(boxX, boxY, boxW, boxH);

  const iconX = boxX + 8, iconY = boxY + 4;
  ctx.drawImage(sprites.coin, iconX, iconY, iconSize, iconSize);

  const text = 'x ' + score;
  const textX = iconX + iconSize + 10;
  const textY = boxY + boxH / 2 + 1;
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#14141a';
  ctx.fillText(text, textX + 2, textY + 2);
  ctx.fillStyle = '#fff8e7';
  ctx.fillText(text, textX, textY);
}

// ---- Player rendering --------------------------------------------------------
function getPlayerSprite() {
  if (!player.onGround) return sprites.playerJump;
  if (Math.abs(player.vx) > 0.3) {
    return Math.floor(performance.now() / 150) % 2 === 0 ? sprites.playerWalk1 : sprites.playerWalk2;
  }
  return sprites.playerIdle;
}

function drawPlayer() {
  const img = getPlayerSprite();
  const dw = 40, dh = 40;
  const dx = player.x - camera.x - (dw - player.w) / 2;
  const dy = player.y - (dh - player.h);
  ctx.save();
  if (player.facing === -1) {
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0, dw, dh);
  } else {
    ctx.drawImage(img, dx, dy, dw, dh);
  }
  ctx.restore();
}

// ---- Asset loading (real files first, generated pixel art as fallback) -------
function tryLoadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

let sprites = null;

async function loadAssets() {
  const generated = PixelArt.generateAll(4);
  const [pIdle, pWalk1, pWalk2, pJump, cClosed, cOpen, bg, coinImg] = await Promise.all([
    tryLoadImage('assets/character.png'),
    tryLoadImage('assets/character_walk1.png'),
    tryLoadImage('assets/character_walk2.png'),
    tryLoadImage('assets/character_jump.png'),
    tryLoadImage('assets/chest_closed.png'),
    tryLoadImage('assets/chest_open.png'),
    tryLoadImage('assets/background.png'),
    tryLoadImage('assets/coin.png'),
  ]);

  backgroundImg = bg;
  sprites = {
    playerIdle:  pIdle  || generated.playerIdle,
    playerWalk1: pWalk1 || generated.playerWalk1,
    playerWalk2: pWalk2 || generated.playerWalk2,
    playerJump:  pJump  || generated.playerJump,
    chestClosed: cClosed || generated.chestClosed,
    chestOpen:   cOpen   || generated.chestOpen,
    coin:        coinImg || generated.coin,
  };
}

// ---- Canvas setup (crisp on retina/high-DPI) -----------------------------------
function setupCanvasDPR() {
  const dpr = window.devicePixelRatio || 1;
  canvasEl.width = GAME_W * dpr;
  canvasEl.height = GAME_H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

// ---- Main loop ------------------------------------------------------------
function loop() {
  updatePlayer();
  updateCamera();

  ctx.clearRect(0, 0, GAME_W, GAME_H);
  drawBackground();
  drawTiles();
  drawChest();
  drawPlayer();
  drawCoinPops();
  drawHUD();

  if (state.won) updateCandyPosition();

  requestAnimationFrame(loop);
}

// ---- Init -------------------------------------------------------------------
async function init() {
  setupCanvasDPR();
  setupInput();
  generateQBlockCoins(); // random 1-3 coins per lucky block, fresh every load
  await loadAssets();
  requestAnimationFrame(loop);
}
init();