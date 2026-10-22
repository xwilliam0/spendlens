// Renders the extension icon (a donut chart on a rounded square) to PNGs
// at 16/32/48/128px using only Node built-ins.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      // 4x4 supersampling for smooth edges.
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const p = pixel((x + (sx + 0.5) / 4) / size, (y + (sy + 0.5) / 4) / size);
        r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3]; a += p[3];
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = a ? r / a : 0; raw[o + 1] = a ? g / a : 0; raw[o + 2] = a ? b / a : 0; raw[o + 3] = (a / 16) * 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const BG = hex('#1d4f91');
const SLICES = [[0.42, hex('#ffffff')], [0.26, hex('#86b6ef')], [0.18, hex('#eda100')], [0.14, hex('#eb6834')]];

function pixel(u, v) {
  // Rounded square background.
  const rad = 0.22, dx = Math.max(Math.abs(u - 0.5) - (0.5 - rad), 0), dy = Math.max(Math.abs(v - 0.5) - (0.5 - rad), 0);
  if (dx * dx + dy * dy > rad * rad) return [0, 0, 0, 0];
  const x = u - 0.5, y = v - 0.5, d = Math.hypot(x, y);
  if (d < 0.33 && d > 0.17) {
    let ang = Math.atan2(x, -y) / (Math.PI * 2);
    if (ang < 0) ang += 1;
    let acc = 0;
    for (const [share, color] of SLICES) {
      acc += share;
      // Thin gap between slices.
      if (ang < acc) return Math.abs(ang - acc) * 2 * Math.PI * d < 0.012 ? [...BG, 1] : [...color, 1];
    }
  }
  return [...BG, 1];
}

mkdirSync('icons', { recursive: true });
for (const s of [16, 32, 48, 128]) writeFileSync(`icons/icon${s}.png`, png(s, pixel));
console.log('icons written');
