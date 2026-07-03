// Build a multi-resolution Windows .ico from a single PNG source.
// - Sizes ≤ 128 are encoded as classic BITMAPINFOHEADER BMP entries (Win9x/XP+ compatible).
// - Size 256 is encoded as a PNG blob (Vista+ ICO format); rcedit and NSIS both require at
//   least one 256x256 frame to pass validation. BMP cannot legally carry 256px frames because
//   the ICONDIRENTRY width/height fields are uint8 (max 255, so 256 is written as 0) and
//   rcedit rejects plain-BMP 256 entries that exceed certain size heuristics.
//
// Usage: node scripts/build-ico.mjs [src.png] [out.ico]
// Defaults: build/icon.png -> build/icon.ico

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

const src = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(projectRoot, 'build', 'icon.png');
const out = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(projectRoot, 'build', 'icon.ico');

// ---------- Minimal PNG decoder (8-bit RGBA only, all filters supported) ----------

function readPNG(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.subarray(0, 8).compare(sig) !== 0) throw new Error('source is not a PNG');
  let pos = 8, width = 0, height = 0, idat = Buffer.alloc(0);
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bd = data.readUInt8(8), ct = data.readUInt8(9);
      if (bd !== 8 || ct !== 6) throw new Error(`unsupported PNG: bitDepth=${bd} colorType=${ct}`);
    } else if (type === 'IDAT') {
      idat = Buffer.concat([idat, data]);
    } else if (type === 'IEND') break;
  }
  const raw = inflateSync(idat);
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride), off = 0;
  for (let y = 0; y < height; y++) {
    const f = raw[off++];
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const b = raw[off++];
      const L = x >= 4 ? row[x - 4] : 0;
      const U = prev[x];
      const UL = x >= 4 ? prev[x - 4] : 0;
      let v;
      switch (f) {
        case 0: v = b; break;
        case 1: v = b + L; break;
        case 2: v = b + U; break;
        case 3: v = b + ((L + U) >> 1); break;
        case 4: {
          const p = L + U - UL;
          const pa = Math.abs(p - L), pb = Math.abs(p - U), pc = Math.abs(p - UL);
          v = b + (pa <= pb && pa <= pc ? L : pb <= pc ? U : UL);
          break;
        }
        default: throw new Error(`unsupported PNG filter ${f}`);
      }
      row[x] = v & 0xff;
    }
    row.copy(pixels, y * stride);
    prev = row;
  }
  return { width, height, pixels };
}

// ---------- Minimal PNG encoder (8-bit RGBA, filter=0 None for simplicity) ----------

function crc32(buf) {
  const t = crc32.t || (crc32.t = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })());
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(w, h, rgba) {
  // rgba is top-to-bottom RGBA; we write with filter byte None (0) per row.
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Bilinear resize ----------

function resize(src, w, h) {
  const { width: sw, height: sh, pixels: sp } = src;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = (y + 0.5) * (sh / h) - 0.5;
    const sy0 = Math.max(0, Math.floor(sy)), sy1 = Math.min(sh - 1, sy0 + 1);
    const fy = sy - sy0;
    for (let x = 0; x < w; x++) {
      const sx = (x + 0.5) * (sw / w) - 0.5;
      const sx0 = Math.max(0, Math.floor(sx)), sx1 = Math.min(sw - 1, sx0 + 1);
      const fx = sx - sx0;
      const i00 = (sy0 * sw + sx0) * 4, i10 = (sy0 * sw + sx1) * 4;
      const i01 = (sy1 * sw + sx0) * 4, i11 = (sy1 * sw + sx1) * 4;
      const o = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const t = sp[i00 + c] + (sp[i10 + c] - sp[i00 + c]) * fx;
        const b = sp[i01 + c] + (sp[i11 + c] - sp[i01 + c]) * fx;
        out[o + c] = (t + (b - t) * fy) & 0xff;
      }
    }
  }
  return out;
}

// ---------- ICO BMP entry builder (for sizes ≤128) ----------

function padTo4(n) { return (n + 3) & ~3; }

function buildBmpEntry(rgba, w, h) {
  const xorRowStride = padTo4(w * 4);
  const andRowBytes = padTo4(Math.ceil(w / 8));
  const xorSize = xorRowStride * h;
  const andSize = andRowBytes * h;
  const headerSize = 40;
  const bmp = Buffer.alloc(headerSize + xorSize + andSize);

  bmp.writeUInt32LE(headerSize, 0);
  bmp.writeInt32LE(w, 4);
  bmp.writeInt32LE(h * 2, 8);       // XOR + AND planes, bottom-up
  bmp.writeUInt16LE(1, 12);
  bmp.writeUInt16LE(32, 14);
  bmp.writeUInt32LE(0, 16);         // BI_RGB
  bmp.writeUInt32LE(xorSize + andSize, 20);
  bmp.writeInt32LE(0, 24);
  bmp.writeInt32LE(0, 28);
  bmp.writeUInt32LE(0, 32);
  bmp.writeUInt32LE(0, 36);

  // XOR mask: bottom-up BGRA
  for (let y = 0; y < h; y++) {
    const srcY = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const si = (srcY * w + x) * 4;
      const di = headerSize + y * xorRowStride + x * 4;
      bmp[di + 0] = rgba[si + 2]; // B
      bmp[di + 1] = rgba[si + 1]; // G
      bmp[di + 2] = rgba[si + 0]; // R
      bmp[di + 3] = rgba[si + 3]; // A
    }
  }
  // AND mask all zero (let per-pixel alpha decide transparency). Buffer.alloc zero-fills.
  return bmp;
}

// ---------- Main ----------

const srcBuf = readFileSync(src);
const srcImg = readPNG(srcBuf);
console.log(`source: ${srcImg.width}x${srcImg.height}`);

// Sizes: small BMP-encoded frames for XP/7 compatibility, plus one 256x256 PNG frame
// which rcedit / NSIS / Windows Vista+ shell require. Electron-builder's NSIS target
// verifies that the .ico contains at least a 256x256 frame; skipping it fails the build
// with "image ... must be at least 256x256".
const bmpSizes = [16, 24, 32, 48, 64, 128];
const pngSizes = [256];
const entries = [];

for (const s of bmpSizes) {
  const rgba = resize(srcImg, s, s);
  entries.push({ size: s, data: buildBmpEntry(rgba, s, s) });
}
for (const s of pngSizes) {
  const rgba = resize(srcImg, s, s);
  entries.push({ size: s, data: encodePNG(s, s, rgba) });
}

const n = entries.length;
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2); // type=ico
header.writeUInt16LE(n, 4);

const dir = Buffer.alloc(16 * n);
const imageDatas = [];
let offset = 6 + 16 * n;
for (let i = 0; i < n; i++) {
  const { size, data } = entries[i];
  const e = dir.subarray(i * 16, i * 16 + 16);
  e[0] = size >= 256 ? 0 : size;
  e[1] = size >= 256 ? 0 : size;
  e[2] = 0;
  e[3] = 0;
  e.writeUInt16LE(1, 4);
  // For PNG-encoded Vista entries, bitCount is 32 (spec still sets this for ARGB PNGs).
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  imageDatas.push(data);
}

const ico = Buffer.concat([header, dir, ...imageDatas]);
writeFileSync(out, ico);
console.log(`wrote ${out} (${ico.length} bytes, BMP=${bmpSizes.join(',')}, PNG=${pngSizes.join(',')})`);
