// Build macOS menu bar template icons (black-on-transparent PNG) for SoftDesk tray.
// Generates build/trayTemplate.png (22x22 @1x) and build/trayTemplate@2x.png (44x44 @2x).
// Template images are marked setTemplateImage(true) at runtime so macOS renders them
// white on dark menu bars and black on light menu bars automatically.
//
// Pure Node, no external deps: minimal PNG encoder (zlib for DEFLATE) + signed-distance-field
// software rasterizer for the D/play/desk glyph.

import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

function crc32(buf) {
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- Geometry helpers ---

// Distance from point (px,py) to the closest point on line segment (ax,ay)-(bx,by).
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Signed distance to a D-shape path (closed) made of: left vertical line + top horizontal +
// right semicircle arc + bottom horizontal. Sign: negative inside, positive outside.
// The D is the OUTLINE path; we fill at |dist| <= halfStroke for the outline stroke.
function dShapeDistance(px, py, x0, y0, x1, y1) {
  // D:
  //   left edge: (x0,y0) -> (x0,y1)
  //   top:       (x0,y0) -> (cx-r, y0)  where cx=x1, radius r = (y1-y0)/2
  //   arc:       semicircle centered at (cx, cy) going from angle -PI/2 (top) to PI/2 (bottom)
  //   bottom:    (cx-r, y1) -> (x0, y1)
  const cy = (y0 + y1) / 2;
  const r = (y1 - y0) / 2;
  const cx = x1;
  const arcRightX = cx; // arc's rightmost point is x1
  // Distance to the left segment
  const dLeft = distToSegment(px, py, x0, y0, x0, y1);
  // Distance to top/bottom segments
  const dTop = distToSegment(px, py, x0, y0, cx - r, y0);
  const dBot = distToSegment(px, py, x0, y1, cx - r, y1);
  // Distance to the right semicircle arc: the arc is centered (cx,cy) radius r,
  // covering right half (px >= cx). The distance to the arc is |hypot(dx,dy) - r| when px >= cx,
  // but clamp to endpoints (top and bottom) when px < cx.
  const dx = px - cx, dy = py - cy;
  let dArc;
  if (px >= cx - 0.5) {
    dArc = Math.abs(Math.hypot(dx, dy) - r);
  } else {
    // closest points are the top and bottom endpoints of the arc
    dArc = Math.min(distToSegment(px, py, cx, cy - r, cx, cy - r),
                    distToSegment(px, py, cx, cy + r, cx, cy + r));
  }
  // Outside/inside: use winding/polar for the closed shape (not critical for stroke rendering,
  // since we're stroking; we use min distance to the outline path).
  const dOutline = Math.min(dLeft, dTop, dBot, dArc);
  // Signed inside-test for the fill region (needed for the triangle overlap to punch through? No,
  // the triangle is a separate filled element; we keep stroke-only for the D).
  return dOutline;
}

// Returns true if (px,py) is inside a filled triangle.
function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

// Returns true if (px,py) is inside a filled axis-aligned rounded rectangle.
function pointInRoundedRect(px, py, x0, y0, x1, y1, rr) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  if (px >= x0 + rr && px <= x1 - rr) return true;
  if (py >= y0 + rr && py <= y1 - rr) return true;
  const ccx = px < x0 + rr ? x0 + rr : x1 - rr;
  const ccy = py < y0 + rr ? y0 + rr : y1 - rr;
  const ddx = px - ccx, ddy = py - ccy;
  return ddx * ddx + ddy * ddy <= rr * rr;
}

function render(size) {
  const buf = Buffer.alloc(size * size * 4);
  const scale = size / 44;
  const D = { x0: 9, y0: 10, x1: 28, y1: 34 };
  const strokeW = 3.4;
  const halfW = strokeW / 2;
  const play = { ax: 15, ay: 16.5, bx: 23.5, by: 22, cx: 15, cy: 27.5 };
  const bar = { x0: 8, y0: 36, x1: 28, y1: 38.2, rr: 1.1 };

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const vx = (x + 0.5) / scale;
      const vy = (y + 0.5) / scale;
      let coverage = 0;

      // D outline: distance-field stroke
      const dD = dShapeDistance(vx, vy, D.x0, D.y0, D.x1, D.y1);
      if (dD <= halfW) coverage = 1;

      // Play triangle (filled)
      if (pointInTriangle(vx, vy, play.ax, play.ay, play.bx, play.by, play.cx, play.cy)) coverage = 1;

      // Bottom desk bar (filled)
      if (pointInRoundedRect(vx, vy, bar.x0, bar.y0, bar.x1, bar.y1, bar.rr)) coverage = 1;

      // Anti-aliased edge: sample 2x2 subgrid
      if (dD > halfW - 0.6 && dD < halfW + 0.6) {
        let hits = 0, total = 0;
        for (let sy = 0; sy < 3; sy++) {
          for (let sx = 0; sx < 3; sx++) {
            const svx = vx - 0.5 / scale + (sx + 0.5) / (3 * scale);
            const svy = vy - 0.5 / scale + (sy + 0.5) / (3 * scale);
            total++;
            const dd = dShapeDistance(svx, svy, D.x0, D.y0, D.x1, D.y1);
            const inPlay = pointInTriangle(svx, svy, play.ax, play.ay, play.bx, play.by, play.cx, play.cy);
            const inBar = pointInRoundedRect(svx, svy, bar.x0, bar.y0, bar.x1, bar.y1, bar.rr);
            if (dd <= halfW || inPlay || inBar) hits++;
          }
        }
        coverage = hits / total;
      }

      const idx = (y * size + x) * 4;
      const a = Math.round(coverage * 255);
      buf[idx] = 0;
      buf[idx + 1] = 0;
      buf[idx + 2] = 0;
      buf[idx + 3] = a;
    }
  }
  return buf;
}

function writeIcon(fileName, size) {
  const pixels = render(size);
  const png = encodePNG(size, size, pixels);
  const outPath = join(PROJECT_ROOT, 'build', fileName);
  writeFileSync(outPath, png);
  let filled = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) filled++;
  console.log(`wrote ${outPath}  ${size}x${size}  ${png.length} bytes  filled=${filled}/${size*size}`);
}

writeIcon('trayTemplate.png', 22);
writeIcon('trayTemplate@2x.png', 44);
