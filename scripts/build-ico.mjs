// Build a multi-resolution Windows .ico from a single PNG source.
// Requires: NODE_ENV runtime only (no external deps; uses zlib for PNG deflate).
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

// ---------- PNG decoder (minimal, 8-bit RGBA only) ----------

function readPng(buf) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.subarray(0, 8).compare(sig) !== 0) {
    throw new Error('source is not a PNG');
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let idat = Buffer.alloc(0);
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data.readUInt8(8);
      const colorType = data.readUInt8(9);
      if (bitDepth !== 8 || colorType !== 6) {
        throw new Error(`unsupported PNG: bitDepth=${bitDepth} colorType=${colorType}`);
      }
    } else if (type === 'IDAT') {
      idat = Buffer.concat([idat, data]);
    } else if (type === 'IEND') {
      break;
    }
  }
  // Decompress via zlib (Node's built-in zlib supports raw deflate when wrapped).
  const raw = inflateSync(idat);

  // Each row: filter byte + width*4 RGBA bytes
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  let rawOff = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rawOff++];
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const byte = raw[rawOff++];
      let left = x >= 4 ? row[x - 4] : 0;
      let up = prev[x];
      let upLeft = x >= 4 ? prev[x - 4] : 0;
      let v;
      switch (filter) {
        case 0: v = byte; break;
        case 1: v = byte + left; break;
        case 2: v = byte + up; break;
        case 3: v = byte + ((left + up) >> 1); break;
        case 4: {
          const p = left + up - upLeft;
          const pa = Math.abs(p - left);
          const pb = Math.abs(p - up);
          const pc = Math.abs(p - upLeft);
          const pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
          v = byte + pred;
          break;
        }
        default:
          throw new Error(`unsupported PNG filter ${filter}`);
      }
      row[x] = v & 0xff;
    }
    row.copy(pixels, y * stride);
    prev = row;
  }
  return { width, height, pixels };
}

// ---------- PNG encoder (8-bit RGBA, no filtering for simplicity) ----------

function crc32(buf) {
  let c;
  const table = crc32.table || (crc32.table = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })());
  c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcIn = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcIn), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, pixels) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Add filter byte (None = 0) before each row.
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  const iend = Buffer.alloc(0);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', iend)]);
}

// ---------- Resize (bilinear) ----------

function resize(src, dstW, dstH) {
  const { width: sw, height: sh, pixels: sp } = src;
  const out = Buffer.alloc(dstW * dstH * 4);
  for (let y = 0; y < dstH; y++) {
    const sy = (y + 0.5) * (sh / dstH) - 0.5;
    const sy0 = Math.max(0, Math.floor(sy));
    const sy1 = Math.min(sh - 1, sy0 + 1);
    const fy = sy - sy0;
    for (let x = 0; x < dstW; x++) {
      const sx = (x + 0.5) * (sw / dstW) - 0.5;
      const sx0 = Math.max(0, Math.floor(sx));
      const sx1 = Math.min(sw - 1, sx0 + 1);
      const fx = sx - sx0;
      const i00 = (sy0 * sw + sx0) * 4;
      const i10 = (sy0 * sw + sx1) * 4;
      const i01 = (sy1 * sw + sx0) * 4;
      const i11 = (sy1 * sw + sx1) * 4;
      const o = (y * dstW + x) * 4;
      for (let c = 0; c < 4; c++) {
        const v00 = sp[i00 + c];
        const v10 = sp[i10 + c];
        const v01 = sp[i01 + c];
        const v11 = sp[i11 + c];
        const top = v00 + (v10 - v00) * fx;
        const bot = v01 + (v11 - v01) * fx;
        out[o + c] = Math.round(top + (bot - top) * fy) & 0xff;
      }
    }
  }
  return { width: dstW, height: dstH, pixels: out };
}

// ---------- Build .ico ----------

function buildIco(sizes, pngImages) {
  const n = pngImages.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = ico
  header.writeUInt16LE(n, 4);
  const dir = Buffer.alloc(16 * n);
  const imageData = [];
  let offset = 6 + 16 * n;
  for (let i = 0; i < n; i++) {
    const { width, height, data } = pngImages[i];
    const w = sizes[i];
    const entry = dir.subarray(i * 16, i * 16 + 16);
    entry[0] = w >= 256 ? 0 : w;
    entry[1] = w >= 256 ? 0 : w;
    entry[2] = 0;  // color count
    entry[3] = 0;  // reserved
    entry.writeUInt16LE(1, 4);  // color planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    imageData.push(data);
  }
  return Buffer.concat([header, dir, ...imageData]);
}

// ---------- Main ----------

const srcBuf = readFileSync(src);
const srcImg = await readPng(srcBuf);
console.log(`source: ${srcImg.width}x${srcImg.height}`);

// Windows .ico best practice: 16/24/32/48/64/128/256.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = [];
for (const s of sizes) {
  const resized = resize(srcImg, s, s);
  const png = encodePng(s, s, resized.pixels);
  images.push({ width: s, height: s, data: png });
}

const ico = buildIco(sizes, images);
writeFileSync(out, ico);
console.log(`wrote ${out} (${ico.length} bytes, sizes=${sizes.join(',')})`);
