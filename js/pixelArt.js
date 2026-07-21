// ---------------------------------------------------------------------------
// Procedurally generated pixel-art sprites (player, chest, coin).
// game.js tries to load real PNGs from /assets first (character.png,
// chest_closed.png, chest_open.png, coin.png, background.png) and falls
// back to these generated sprites automatically if none are found.
// ---------------------------------------------------------------------------
(function (global) {

  const PALETTE = {
    '.': null,        // transparent
    'O': '#14141a',   // outline
    'H': '#ec4899',   // hair (pink)
    'S': '#ffd3a6',   // skin
    'E': '#14141a',   // eye
    'P': '#9d3fd6',   // outfit purple
    'Q': '#6c26a0',   // outfit purple shadow
    'K': '#241033',   // boots
    'W': '#8a5a35',   // chest wood
    'V': '#6b4326',   // chest wood shadow
    'G': '#f0b93d',   // chest gold trim / coin gold
    'L': '#f7d060',   // chest lock / coin gold
    'A': '#2a1608',   // chest cavity (dark inside)
    'T': '#2dd4bf',   // gem teal
    'N': '#4ade80',   // gem green
    'R': '#f472b6',   // gem pink
    'C': '#f7d060',   // chest interior coins
    'Y': '#fff2b0',   // coin bright shine
    'D': '#a9770e',   // coin dark edge
  };

  // 16x16 player grids -------------------------------------------------------
  const PLAYER_IDLE = [
    "...OOOOOOOOOO...",
    "...OHHHHHHHHO...",
    "...OHHHHHHHHO...",
    "OHHOHHHHHHHHOHHO",
    "OHHOHHSSSSHHOHHO",
    "OHHOHSESSESHOHHO",
    "OHHOHSSSSSSHOHHO",
    ".OOOOOOOOOOOOOO.",
    ".....OOOOOO.....",
    "....OPPPPPPO....",
    "...OSOPPPPOSO...",
    "....OPPQQPPO....",
    "....OPPPPPPO....",
    ".....OKK.KKO....",
    ".....OKK.KKO....",
    ".....OOO.OOO....",
  ];
  // Rows are auto-normalized to a fixed width in buildSprite(), so small
  // authoring-length mismatches between rows never break rendering.

  const PLAYER_WALK1 = PLAYER_IDLE.slice(0, 13).concat([
    "....OKK..KKO....",
    "....OKK..KKO....",
    "....OOO..OOO....",
  ]);

  const PLAYER_WALK2 = PLAYER_IDLE.slice(0, 13).concat([
    "...OKK....KKO...",
    "...OKK....KKO...",
    "...OOO....OOO...",
  ]);

  const PLAYER_JUMP = PLAYER_IDLE.slice(0, 13).concat([
    "......OKKO......",
    "......OKKO......",
    ".......OO.......",
  ]);

  // 16x10 chest grids ---------------------------------------------------------
  const CHEST_CLOSED = [
    "..OOOOOOOOOOOO..",
    ".OGGGGGGGGGGGGO.",
    ".OWWWWWWWWWWWWO.",
    ".OWWWWWVVWWWWWO.",
    ".OWWWWWOLOWWWWO.",
    ".OWWWWWWWWWWWWO.",
    ".OWWWWWVVWWWWWO.",
    ".OWWWWWWWWWWWWO.",
    ".OGGGGGGGGGGGGO.",
    "..OOOOOOOOOOOO..",
  ];

  const CHEST_OPEN = [
    "OO...CTNRC...OO.",
    ".OAAAAAAAAAAAAO.",
    ".OACCATAANARCAO.",
    ".OWWCWWCWWCWWWO.",
    ".OWWWWWWWWWWWWO.",
    ".OWWWWWVVWWWWWO.",
    ".OWWWWWWWWWWWWO.",
    ".OWWWWWWWWWWWWO.",
    ".OGGGGGGGGGGGGO.",
    "..OOOOOOOOOOOO..",
  ];

  // 8x8 coin grid — used for both the HUD icon and the "coin pop" animation
  const COIN = [
    "..DDDD..",
    ".DGGGGD.",
    "DGGYYGGD",
    "DGYYYYGD",
    "DGYYYYGD",
    "DGGYYGGD",
    ".DGGGGD.",
    "..DDDD..",
  ];

  // Normalizes a row to exactly `width` chars (pads/trims defensively) -------
  function normalizeRow(row, width) {
    if (row.length === width) return row;
    if (row.length > width) return row.slice(0, width);
    return row + '.'.repeat(width - row.length);
  }

  function buildSprite(grid, scale) {
    const rows = grid.length;
    const cols = Math.max(...grid.map(r => r.length));
    const canvas = document.createElement('canvas');
    canvas.width = cols * scale;
    canvas.height = rows * scale;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    for (let r = 0; r < rows; r++) {
      const row = normalizeRow(grid[r], cols);
      for (let c = 0; c < cols; c++) {
        const color = PALETTE[row[c]];
        if (!color) continue; // transparent pixel
        ctx.fillStyle = color;
        ctx.fillRect(c * scale, r * scale, scale, scale);
      }
    }
    return canvas;
  }

  function generateAll(scale) {
    scale = scale || 4;
    return {
      playerIdle:  buildSprite(PLAYER_IDLE,  scale),
      playerWalk1: buildSprite(PLAYER_WALK1, scale),
      playerWalk2: buildSprite(PLAYER_WALK2, scale),
      playerJump:  buildSprite(PLAYER_JUMP,  scale),
      chestClosed: buildSprite(CHEST_CLOSED, scale),
      chestOpen:   buildSprite(CHEST_OPEN,   scale),
      coin:        buildSprite(COIN,         scale),
    };
  }

  global.PixelArt = { generateAll, buildSprite, PALETTE };

})(window);