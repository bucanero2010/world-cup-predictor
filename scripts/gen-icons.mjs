// Generate PWA icons as PNGs with no external deps (zlib + manual PNG encoding).
// Pitch-green background with a cream circle (a stylized ball) in the center.
import zlib from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BG = [31, 107, 59]; // --pitch
const FG = [251, 248, 241]; // --chalk

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function makePng(size) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.30;
  const r2 = r * r;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const inside = dx * dx + dy * dy <= r2;
      const [rr, gg, bb] = inside ? FG : BG;
      raw[o++] = rr;
      raw[o++] = gg;
      raw[o++] = bb;
      raw[o++] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(new URL("../public/", import.meta.url), { recursive: true });
for (const size of [192, 512]) {
  const png = makePng(size);
  const path = new URL(`../public/icon-${size}.png`, import.meta.url);
  writeFileSync(path, png);
  console.log(`wrote public/icon-${size}.png (${png.length} bytes)`);
}
