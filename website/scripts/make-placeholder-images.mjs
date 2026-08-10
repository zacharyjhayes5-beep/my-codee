/**
 * Generates the brand-colored placeholder photos in src/assets/.
 * TODO(owner): replace those files with real photography (a headshot and a
 * shot of the office / Grand Rapids) and delete this script.
 *
 * Run with: node scripts/make-placeholder-images.mjs
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';

const OUT = new URL('../src/assets/', import.meta.url);
await mkdir(OUT, { recursive: true });

const svg = (w, h, label) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1B5E4B"/>
      <stop offset="55%" stop-color="#12263F"/>
      <stop offset="100%" stop-color="#0d1b2c"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
  <g fill="none" stroke="#C98A16" stroke-opacity="0.35" stroke-width="2">
    <circle cx="${w * 0.78}" cy="${h * 0.28}" r="${Math.min(w, h) * 0.22}"/>
    <circle cx="${w * 0.2}" cy="${h * 0.78}" r="${Math.min(w, h) * 0.3}"/>
  </g>
  <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle"
        font-family="Georgia, serif" font-size="${Math.round(Math.min(w, h) * 0.07)}"
        fill="#FAF8F4" fill-opacity="0.85">${label}</text>
</svg>`;

const jobs = [
  { file: 'portrait.jpg', w: 1200, h: 1500, label: 'Photo placeholder' },
  { file: 'office.jpg', w: 1800, h: 1200, label: 'Photo placeholder' },
];

for (const { file, w, h, label } of jobs) {
  await sharp(Buffer.from(svg(w, h, label)))
    .jpeg({ quality: 72, mozjpeg: true })
    .toFile(new URL(file, OUT).pathname);
  console.log('wrote', file);
}
