// Build a multi-resolution Windows .ico from a single PNG source using traditional
// BMP (BITMAPINFOHEADER) encoded entries. This is the most compatible format and
// is required by rcedit / electron-builder when embedding icons into a Windows
// .exe resource section. PNG-in-ICO entries (Vista+) are not used here because
// rcedit / Windows shell may silently ignore them, leaving the default Electron
// atom icon in the exe.
//
// Usage: node scripts/build-ico.mjs [src.png] [out.ico]
// Defaults: build/icon.png -> build/icon.ico

import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
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

// ---------- ICO BMP entry builder ----------
// ICO format:
//   ICONDIR(6) + ICONDIRENTRY(16 each) + [image data...]
// Each image is a DIB: BITMAPINFOHEADER(40) + pixel data.
// Pixel data = XOR mask (BGRA rows, bottom-up, each row padded to 4 bytes boundary)
//             + AND mask (1-bit, bottom-up, each row padded to 4 bytes).
// For 32-bit ARGB images, the AND mask can be all-zero (alpha channel handles transparency).

function padTo4(n) {
  return (n + 3) & ~3;
}

function buildBmpEntry(rgba, w, h) {
  // rgba: top-to-bottom RGBA; we need bottom-to-top BGRA for BMP.
  const xorRowStride = padTo4(w * 4);
  const andRowBytes = padTo4(Math.ceil(w / 8));
  const xorSize = xorRowStride * h;
  const andSize = andRowBytes * h;
  const headerSize = 40;
  const bmp = Buffer.alloc(headerSize + xorSize + andSize);

  // BITMAPINFOHEADER
  bmp.writeUInt32LE(headerSize, 0);   // biSize
  bmp.writeInt32LE(w, 4);             // biWidth
  // biHeight = 2 * h (XOR + AND), positive = bottom-up
  bmp.writeInt32LE(h * 2, 8);
  bmp.writeUInt16LE(1, 12);           // biPlanes
  bmp.writeUInt16LE(32, 14);          // biBitCount
  bmp.writeUInt32LE(0, 16);           // biCompression (BI_RGB)
  bmp.writeUInt32LE(xorSize + andSize, 20); // biSizeImage
  bmp.writeInt32LE(0, 24);            // biXPelsPerMeter
  bmp.writeInt32LE(0, 28);            // biYPelsPerMeter
  bmp.writeUInt32LE(0, 32);           // biClrUsed
  bmp.writeUInt32LE(0, 36);           // biClrImportant

  // XOR mask: bottom-up, BGRA
  for (let y = 0; y < h; y++) {
    const srcY = h - 1 - y; // bottom-up
    for (let x = 0; x < w; x++) {
      const si = (srcY * w + x) * 4;
      const di = headerSize + y * xorRowStride + x * 4;
      bmp[di + 0] = rgba[si + 2]; // B
      bmp[di + 1] = rgba[si + 1]; // G
      bmp[di + 2] = rgba[si + 0]; // R
      bmp[di + 3] = rgba[si + 3]; // A
    }
    // Rest of the row (padding) is already 0
  }

  // AND mask: bottom-up, 1-bit (0 = opaque, 1 = transparent)
  // Since we have alpha channel in XOR mask, set all 0 (opaque) so Windows
  // relies on the 32-bit alpha instead of the legacy mask.
  // The rest is already zero-filled from Buffer.alloc.

  return bmp;
}

// ---------- Main ----------

const srcBuf = readFileSync(src);
const srcImg = readPNG(srcBuf);
console.log(`source: ${srcImg.width}x${srcImg.height}`);

// Standard Windows icon sizes (avoid 256 in BMP mode since 256px BMP would exceed
// 256KB and rcedit sometimes rejects it; 256 support via PNG-in-ICO is a Vista+
// feature, but 128px BMP is enough for high-DPI shell display on Win10/11).
// For best compatibility with Windows 7+ taskbar and desktop shortcut overlay,
// the critical sizes are 16, 32, 48.
const sizes = [16, 24, 32, 48, 64, 128];
const entries = [];
for (const s of sizes) {
  const rgba = resize(srcImg, s, s);
  const bmp = buildBmpEntry(rgba, s, s);
  entries.push({ size: s, data: bmp });
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
  e[2] = 0; // color count
  e[3] = 0; // reserved
  e.writeUInt16LE(1, 4);  // planes
  e.writeUInt16LE(32, 6); // bit count
  e.writeUInt32LE(data.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += data.length;
  imageDatas.push(data);
}

const ico = Buffer.concat([header, dir, ...imageDatas]);
writeFileSync(out, ico);
console.log(`wrote ${out} (${ico.length} bytes, sizes=${sizes.join(',')}, format=BMP-encoded)`);
