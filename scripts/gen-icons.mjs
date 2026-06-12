// Generate PWA icons as PNGs with no external deps (zlib + manual PNG encoding).
// Pitch-green tile with a stylized soccer ball: a cream pentagon in the center and
// five spokes radiating to the rim — matching the in-app SVG logo.
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

// --- tiny vector helpers operating on a pixel test (point-in-shape) ---
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

// distance from point P to segment AB, squared
function segDist2(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return dist2(px, py, ax, ay);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return dist2(px, py, bx, by);
  const t = c1 / c2;
  return dist2(px, py, ax + t * vx, ay + t * vy);
}

// point in convex polygon (vertices clockwise or ccw)
function inPoly(px, py, pts) {
  let sign = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
    const s = Math.sign(cross);
    if (s !== 0) {
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

function makePng(size) {
  const cx = size / 2, cy = size / 2;
  const ballR = size * 0.40;        // ball radius
  const pentR = size * 0.17;        // central pentagon radius
  const rimInner = size * 0.30;     // where spokes start (pentagon vertices region)
  const spokeW2 = (size * 0.022) ** 2; // half-width^2 of spokes

  // 5 pentagon vertices (pointing up)
  const verts = [];
  for (let i = 0; i < 5; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    verts.push([cx + pentR * Math.cos(ang), cy + pentR * Math.sin(ang)]);
  }
  // spoke endpoints out toward the rim
  const rim = [];
  for (let i = 0; i < 5; i++) {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    rim.push([cx + ballR * 0.92 * Math.cos(ang), cy + ballR * 0.92 * Math.sin(ang)]);
  }

  const ballR2 = ballR * ballR;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0; // filter
    for (let x = 0; x < size; x++) {
      let isFg = false;
      const inBall = dist2(x, y, cx, cy) <= ballR2;
      if (inBall) {
        if (inPoly(x, y, verts)) isFg = true;
        else {
          for (let i = 0; i < 5; i++) {
            if (segDist2(x, y, verts[i][0], verts[i][1], rim[i][0], rim[i][1]) <= spokeW2) {
              isFg = true; break;
            }
          }
        }
      }
      // ball body is green; mark (pentagon+spokes) is cream; outside ball is green tile
      const [r, g, b] = isFg ? FG : BG;
      raw[o++] = r; raw[o++] = g; raw[o++] = b; raw[o++] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
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
  writeFileSync(new URL(`../public/icon-${size}.png`, import.meta.url), png);
  console.log(`wrote public/icon-${size}.png (${png.length} bytes)`);
}
