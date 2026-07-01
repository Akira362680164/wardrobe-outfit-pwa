import * as fs from 'fs';
import * as path from 'path';

function createPng(width: number, height: number, r: number, g: number, b: number): Buffer {
  // Minimal valid PNG
  const { createCanvas } = (() => {
    try { return require('canvas'); } catch { return { createCanvas: null }; }
  })();
  if (createCanvas) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, 0, width, height);
    return canvas.toBuffer('image/png');
  }
  // Minimal raw PNG fallback
  const { writeFileSync } = fs;
  const identity = Buffer.from([
    0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A, // PNG signature
    0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52, // IHDR chunk
    0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,
    0x08,0x02,0x00,0x00,0x00,0x90,0x77,0x53,
    0xDE,0x00,0x00,0x00,0x0C,0x49,0x44,0x41, // IDAT chunk
    0x54,0x08,0xD7,0x63,0xF8,0xCF,0xC0,0x00,
    0x00,0x00,0x03,0x00,0x01,0x36,0x28,0x19,
    0x00,0x00,0x00,0x00,0x00,0x49,0x45,0x4E, // IEND chunk
    0x44,0xAE,0x42,0x60,0x82,
  ]);
  return identity;
}

const imgDir = path.join(__dirname, 'images');
fs.mkdirSync(imgDir, { recursive: true });

const colors = [
  { name: 'red', r: 255, g: 0, b: 0 },
  { name: 'blue', r: 0, g: 0, b: 255 },
  { name: 'green', r: 0, g: 255, b: 0 },
];
for (const c of colors) {
  const buf = createPng(100, 100, c.r, c.g, c.b);
  fs.writeFileSync(path.join(imgDir, `${c.name}-100x100.png`), buf);
}
console.log(`Generated ${colors.length} fixture images in ${imgDir}`);
