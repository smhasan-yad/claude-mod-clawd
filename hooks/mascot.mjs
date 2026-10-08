// Clawd, as the Claude desktop app draws it: its own pixel sprites and frame
// timings (clawd-sprites.mjs), played as CSS inside an SVG so the compositor
// runs them. One mood at a time:
//   idle   stands, now and then looks around
//   think  the thought bubble
//   read   looks around
//   type   turns to a laptop and types (Claude editing or writing files)
//   shell  types at the desktop computer (Claude running commands)
// Every mood shares one box (see BOX_W), so the toolbar row keeps its size. `phase` (seconds into the mood) is a negative animation
// delay: a redraw continues the animation where it was.

import { SPRITES } from "./clawd-sprites.mjs";

/** False when the sprite file is the public stub: callers then draw the block crab. */
export const HAS_SPRITES = Object.keys(SPRITES).length > 0;

// 16 rows at 1.4375 = 23 px: the height of the usage rings and the buttons,
// within one row of the desktop band, which lays out in whole text rows (a
// taller mascot takes a second row and leaves its spare space below).
const SCALE = 1.4375; // sprite pixel -> CSS px
const FPS = 12;

// [sprite, intro frames, loop frames, loop fps]; frames from the app's own table.
const range = (a, b, step = 1) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);
const hold = (f, secs) => Array(Math.round(secs * FPS)).fill(f);
const MOODS = {
  idle: ["LookingAround", [], [...hold(0, 7), ...range(4, 30)]],
  think: ["Thinking", [], range(2, 36)],
  read: ["LookingAround", [], range(4, 30)],
  type: ["Laptop", range(2, 16), range(17, 33)],
  shell: ["Desktop", range(2, 14), range(15, 75, 2), FPS / 2],
};

/** The mood for Clawd's activity line. */
export function moodOf(activity, working) {
  if (!working) return "idle";
  const a = String(activity ?? "");
  if (/^(Editing|Writing|Updating)/.test(a)) return "type";
  if (/^(Reading|Searching|Looking)/.test(a)) return "read";
  if (!a || a === "Thinking…" || /^(Using|Starting)/.test(a)) return "think";
  return "shell"; // a shell command's own description, or "Running …"
}

const decoded = new Map();
function frames(name) {
  if (decoded.has(name)) return decoded.get(name);
  const t = SPRITES[name];
  const px = Uint8Array.from([...t.base].map((c) => (c === "." ? 255 : parseInt(c, 36))));
  const list = [px.slice()];
  for (const d of t.deltas.split("(")) {
    if (d) {
      for (const p of d.split(",")) {
        const k = p.length - 1;
        px[parseInt(p.slice(0, k), 36)] = p[k] === "." ? 255 : parseInt(p[k], 36);
      }
    }
    list.push(px.slice());
  }
  const out = { name, t, list, paths: new Map(), grids: new Map() };
  decoded.set(name, out);
  return out;
}

// Every mood shares one box: the crab's 16 rows, so its middle is the
// middle of the toolbar row, and a fixed width
// with the crab at the left, so it never moves when a laptop or computer
// appears at its right. What reaches above the head (Thinking's bubble) is
// drawn beside the head instead; anything else outside the box is clipped.
const BODY = 16;
const BOX_W = 36;
const BOX_H = BODY;

// One frame in box coordinates (feet line at BOX_H): a palette index per
// pixel, 255 for clear. Shared by the desktop SVG and the terminal cells.
function frameGrid(s, i) {
  if (s.grids.has(i)) return s.grids.get(i);
  const { w, h, a0 } = s.t;
  const feet = a0[1] + a0[3];
  const top = feet - BODY; // the crab's first row
  const f = s.list[i];
  const grid = new Uint8Array(BOX_W * BOX_H).fill(255);
  let bx0 = w, by0 = h;
  // Thinking's bubble: its blue pixels (palette 3) and what lies inside their
  // span above the head; a raised claw up there is clipped, not moved.
  const BUBBLE = 3;
  let bx1 = -1;
  if (s.name === "Thinking") {
    for (let k = 0; k < f.length; k += 1) {
      if (f[k] !== BUBBLE) continue;
      const x = k % w, y = (k / w) | 0;
      if (y < top) { bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); }
    }
  }
  for (let k = 0; k < f.length; k += 1) {
    if (f[k] === 255) continue;
    let x = k % w, y = (k / w) | 0;
    if (y < top) {
      if (x < bx0 || x > bx1 || (f[k] !== BUBBLE && f[k] !== 0)) continue;
      x = 25 + (x - bx0);
      y = y - by0;
    } else {
      x -= a0[0];
      y = y - top;
    }
    if (x >= 0 && x < BOX_W && y >= 0 && y < BOX_H) grid[y * BOX_W + x] = f[k];
  }
  s.grids.set(i, grid);
  return grid;
}

// One frame as a path per colour, a run of same-coloured pixels per segment.
function framePaths(s, i) {
  if (s.paths.has(i)) return s.paths.get(i);
  const { palette } = s.t;
  const grid = frameGrid(s, i);
  const byColor = new Map();
  for (let y = 0; y < BOX_H; y += 1) {
    let x = 0;
    while (x < BOX_W) {
      const c = grid[y * BOX_W + x];
      let n = 1;
      while (x + n < BOX_W && grid[y * BOX_W + x + n] === c) n += 1;
      if (c !== 255) byColor.set(c, (byColor.get(c) ?? "") + `M${x} ${y}h${n}v1h-${n}z`);
      x += n;
    }
  }
  const g = [...byColor].map(([c, d]) => `<path fill="${palette[c]}" d="${d}"/>`).join("");
  s.paths.set(i, g);
  return g;
}

export function mascotSvg(mood, phase = 0) {
  const [name, intro, loop, fps = FPS] = MOODS[mood] ?? MOODS.idle;
  const s = frames(name);
  const vw = BOX_W;
  const vh = BOX_H;
  const introDt = 1 / FPS;
  const dt = 1 / fps;
  const introT = intro.length * introDt;
  const loopT = loop.length * dt;
  const used = [...new Set([...intro, ...loop])];
  const defs = used.map((i) => `<g id="f${i}">${framePaths(s, i)}</g>`).join("");
  const ph = Math.max(0, phase);
  const css = [];
  const uses = [];
  // Intro frames: each shown once, in its slot.
  intro.forEach((f, k) => {
    css.push(`.i${k}{animation:on ${introDt}s steps(1) 1 ${(k * introDt - ph).toFixed(3)}s}`);
    uses.push(`<use class="i${k}" href="#f${f}"/>`);
  });
  // Loop frames: each shown for its slot of every loop.
  const share = (100 / loop.length).toFixed(4);
  css.push(`@keyframes lp{0%{opacity:1}${share}%{opacity:0}100%{opacity:0}}`);
  loop.forEach((f, k) => {
    css.push(`.l${k}{animation:lp ${loopT.toFixed(3)}s steps(1,end) infinite ${(introT + k * dt - ph).toFixed(3)}s}`);
    uses.push(`<use class="l${k}" href="#f${f}"/>`);
  });
  const style = `<style>use{opacity:0}@keyframes on{0%,100%{opacity:1}}${css.join("")}@media (prefers-reduced-motion: reduce){use{animation:none!important}.l0{opacity:1}}</style>`;
  const width = Math.round(vw * SCALE);
  const height = Math.round(vh * SCALE);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${vw} ${vh}" shape-rendering="crispEdges">${style}<defs>${defs}</defs>${uses.join("")}</svg>`;
  return { svg, width, height };
}

// ---- Terminal ---------------------------------------------------------------
// The same frames as text cells, for a Raster, in any truecolor terminal
// (Windows Terminal included; pictures need kitty or Ghostty). Each cell is
// a quarter-block glyph (▘▝▖▗▀▄▌▐▚▞▛▜▙▟█) in two colours, so 2x2 pixels a
// cell; a terminal cell is twice as tall as wide, so a pixel stands for 2x4
// of the sprite's and Clawd keeps its shape in TERM_COLS x TERM_ROWS cells.
// Eyes and other dark details win in any pixel they touch: shrunk away, the
// crab would have no face.
export const TERM_COLS = 9; // 36 sprite px / (2 per cell * 2)
export const TERM_ROWS = 2; // 16 sprite px / (2 per cell * 4)
const SX = BOX_W / (TERM_COLS * 2); // sprite px per pixel, across
const SY = BOX_H / (TERM_ROWS * 2); // and down
const DEFAULT = 0x01000000; // the terminal's own background

const rgb = (hex) => parseInt(String(hex).slice(1), 16);
const lum = (hex) => { const v = rgb(hex); return 0.2126 * (v >> 16) + 0.7152 * ((v >> 8) & 255) + 0.0722 * (v & 255); };

/** The frame index a mood shows `phase` seconds in (intro once, then the loop). */
export function frameAt(mood, phase) {
  const [, intro, loop, fps = FPS] = MOODS[mood] ?? MOODS.idle;
  const introT = intro.length / FPS;
  const t = Math.max(0, phase);
  if (t < introT) return intro[Math.floor(t * FPS)];
  return loop[Math.floor((t - introT) * fps) % loop.length];
}

/** One frame shrunk to (TERM_COLS*2) x (TERM_ROWS*2) pixels of 0xRRGGBB, -1 clear. */
function smallFrame(s, i) {
  const key = `t${i}`;
  if (s.grids.has(key)) return s.grids.get(key);
  const grid = frameGrid(s, i);
  const { palette } = s.t;
  const W = TERM_COLS * 2, H = TERM_ROWS * 2;
  const out = new Int32Array(W * H).fill(-1);
  for (let py = 0; py < H; py += 1) {
    for (let px = 0; px < W; px += 1) {
      const count = new Map();
      let clear = 0;
      for (let y = Math.floor(py * SY); y < Math.floor((py + 1) * SY); y += 1) {
        for (let x = Math.floor(px * SX); x < Math.floor((px + 1) * SX); x += 1) {
          const c = grid[y * BOX_W + x];
          if (c === 255) clear += 1; else count.set(c, (count.get(c) ?? 0) + 1);
        }
      }
      const total = clear + [...count.values()].reduce((a, b) => a + b, 0);
      if (count.size === 0 || clear > total * 0.6) continue;
      const dark = [...count.keys()].filter((c) => lum(palette[c]) < 60);
      const best = dark.length ? dark[0] : [...count].sort((a, b) => b[1] - a[1])[0][0];
      out[py * W + px] = rgb(palette[best]);
    }
  }
  s.grids.set(key, out);
  return out;
}

// Quarter-block glyph by which of top-left, top-right, bottom-left,
// bottom-right take the foreground (bit 8, 4, 2, 1).
const QUAD = [0x20, 0x2597, 0x2596, 0x2584, 0x259D, 0x2590, 0x259E, 0x259F, 0x2598, 0x259A, 0x258C, 0x2599, 0x2580, 0x259C, 0x259B, 0x2588];

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function base64(bytes) {
  if (typeof bytes.toBase64 === "function") return bytes.toBase64();
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < bytes.length ? B64[n & 63] : "=");
  }
  return out;
}

/** Raster cells (base64) for a mood at `phase` seconds, plus their size. */
export function mascotCells(mood, phase = 0) {
  const [name] = MOODS[mood] ?? MOODS.idle;
  const s = frames(name);
  const px = smallFrame(s, frameAt(mood, phase));
  const W = TERM_COLS * 2;
  const words = new Uint32Array(TERM_COLS * TERM_ROWS * 3);
  let n = 0;
  for (let row = 0; row < TERM_ROWS; row += 1) {
    for (let col = 0; col < TERM_COLS; col += 1) {
      const q = [px[row * 2 * W + col * 2], px[row * 2 * W + col * 2 + 1], px[(row * 2 + 1) * W + col * 2], px[(row * 2 + 1) * W + col * 2 + 1]];
      // Two colours a cell: the darkest detail or the commonest as the glyph,
      // the next as its background (clear where there is none).
      const tally = new Map();
      for (const c of q) if (c >= 0) tally.set(c, (tally.get(c) ?? 0) + 1);
      const ranked = [...tally].sort((a, b) => b[1] - a[1]).map(([c]) => c);
      const darkest = ranked.find((c) => lum(`#${c.toString(16).padStart(6, "0")}`) < 60);
      const fg = darkest ?? ranked[0];
      const bg = ranked.find((c) => c !== fg);
      if (fg === undefined) {
        words.set([0x20, DEFAULT, DEFAULT], n);
      } else {
        const mask = q.reduce((m, c, k) => m | ((c === fg ? 1 : 0) << (3 - k)), 0);
        words.set([QUAD[mask], fg, bg ?? DEFAULT], n);
      }
      n += 3;
    }
  }
  return { cells: base64(new Uint8Array(words.buffer)), columns: TERM_COLS, rows: TERM_ROWS };
}

/** Terminal fallback where a Raster cannot be drawn: the block mascot. */
export function mascotText(mood, frame) {
  const f = frame % 2;
  if (mood === "type") return f ? "▐▛█▜▌⌨" : "▝▜█▛▘⌨";
  if (mood === "shell") return f ? "▐▛█▜▌▣" : "▝▜█▛▘▣";
  if (mood === "read") return f ? "▐▛█▜▌·" : "·▐▛█▜▌";
  if (mood === "think") return f ? "▐▛█▜▌∙" : "▐▛█▜▌°";
  return "▐▛█▜▌ ";
}
