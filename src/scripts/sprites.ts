/**
 * Hand-drawn pixel sprites. `X` is a filled pixel; everything else is empty.
 * Shared by the /play runner and the command palette's "rex" easter egg.
 */

export type Sprite = readonly string[];

const REX_TOP = [
  '..........XXXXXXX.',
  '.........XXXXXXXXX',
  '.........XX.XXXXXX',
  '.........XXXXXXXXX',
  '.........XXXXXXXXX',
  '.........XXXXX....',
  '.........XXXXXXX..',
  'X.......XXXXX.....',
  'X......XXXXXX.....',
  'XX....XXXXXXXXX...',
  'XXX..XXXXXXXX.X...',
  'XXXXXXXXXXXXX.....',
  '.XXXXXXXXXXXX.....',
  '..XXXXXXXXXX......',
  '...XXXXXXXXX......',
];

export const REX_STAND: Sprite = [...REX_TOP, '....XX..XX........', '....X....X........', '....XX...XX.......'];
export const REX_RUN_A: Sprite = [...REX_TOP, '....XX..XX........', '....X....XX.......', '....XX............'];
export const REX_RUN_B: Sprite = [...REX_TOP, '....XX..XX........', '.....X...X........', '.........XX.......'];
export const REX_DEAD: Sprite = REX_STAND.map((row, y) => (y === 2 ? '.........X.X.XXXXX' : y === 3 ? '.........XX.XXXXXX' : row));

export const REX_DUCK_A: Sprite = [
  '.................XXXXXX.',
  'X...............XX.XXXXX',
  'XX.....XXXXXXXXXXXXXXXXX',
  'XXXXXXXXXXXXXXXXXXXXX...',
  '.XXXXXXXXXXXXXXXXXXXXXX.',
  '..XXXXXXXXXXXXXXXX......',
  '...XXXXXXXXXXXX.X.......',
  '....XX...XX.............',
  '....X.....XX............',
];

export const REX_DUCK_B: Sprite = [...REX_DUCK_A.slice(0, 7), '....XX...XX.............', '.....XX..X..............'];

export const CACTUS_SMALL: Sprite = [
  '..XXX..',
  '..XXX..',
  'X.XXX..',
  'X.XXX.X',
  'X.XXX.X',
  'XXXXX.X',
  '.XXXXXX',
  '..XXX..',
  '..XXX..',
  '..XXX..',
  '..XXX..',
  '..XXX..',
  '..XXX..',
];

export const CACTUS_LARGE: Sprite = [
  '...XXX...',
  '..XXXXX..',
  '..XXXXX..',
  'X.XXXXX..',
  'XXXXXXX..',
  'XXXXXXX.X',
  'XXXXXXX.X',
  '.XXXXXX.X',
  '..XXXXXXX',
  '..XXXXXX.',
  '..XXXXX..',
  '..XXXXX..',
  '..XXXXX..',
  '..XXXXX..',
  '..XXXXX..',
  '..XXXXX..',
  '..XXXXX..',
];

export const BIRD_UP: Sprite = [
  '.....XX.........',
  '.....XXX........',
  '.....XXXX.......',
  '..XX.XXXXX......',
  '.XXXXXXXXXXXXXX.',
  'XXXXXXXXXXXXX...',
  '......XXXXXXXXX.',
  '................',
  '................',
];

export const BIRD_DOWN: Sprite = [
  '................',
  '................',
  '..XX............',
  '.XXXXXXXXXXXXXX.',
  'XXXXXXXXXXXXX...',
  '.....XXXXXXXXXX.',
  '.....XXXX.......',
  '.....XXX........',
  '.....XX.........',
];

export const spriteWidth = (s: Sprite) => s[0].length;
export const spriteHeight = (s: Sprite) => s.length;

/**
 * Draws a sprite with its top-left at (x, y), one filled run per row. Runs overlap
 * the next row slightly so no hairline seams show at fractional canvas scales.
 */
export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, px: number) {
  for (let r = 0; r < s.length; r++) {
    const row = s[r];
    let c = 0;
    while (c < row.length) {
      if (row[c] !== 'X') {
        c++;
        continue;
      }
      const from = c;
      while (c < row.length && row[c] === 'X') c++;
      ctx.fillRect(x + from * px, y + r * px, (c - from) * px, r === s.length - 1 ? px : px + 0.5);
    }
  }
}
