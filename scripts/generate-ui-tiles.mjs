import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const size = 256;

const paperSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <filter id="paperNoise" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035 0.042" numOctaves="5" seed="41" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="
        0.38 0 0 0 0.61
        0 0.32 0 0 0.51
        0 0 0.12 0 0.23
        0 0 0 0.34 0"/>
    </filter>
    <filter id="fibers" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.09 0.018" numOctaves="3" seed="18" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="
        0.25 0 0 0 0.50
        0 0.21 0 0 0.40
        0 0 0.07 0 0.16
        0 0 0 0.16 0"/>
    </filter>
  </defs>
  <rect width="256" height="256" fill="#f5dda0"/>
  <rect width="256" height="256" filter="url(#paperNoise)" opacity="0.72"/>
  <rect width="256" height="256" filter="url(#fibers)" opacity="0.42"/>
  <rect width="256" height="256" fill="#fff1bf" opacity="0.28"/>
</svg>`;

const plankYs = Array.from({ length: 9 }, (_, index) => index * 32);
const plankLines = plankYs
  .map((y) => `
    <rect x="0" y="${y}" width="256" height="2" fill="#4f2a10" opacity="0.58"/>
    <rect x="0" y="${y + 2}" width="256" height="2" fill="#d18a35" opacity="0.34"/>
  `)
  .join("");

const woodSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <filter id="woodGrain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.055 0.018" numOctaves="5" seed="77" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="
        0.48 0 0 0 0.32
        0 0.23 0 0 0.15
        0 0 0.08 0 0.04
        0 0 0 0.46 0"/>
    </filter>
    <filter id="fineGrain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.14 0.028" numOctaves="3" seed="12" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="
        0.22 0 0 0 0.24
        0 0.12 0 0 0.11
        0 0 0.05 0 0.04
        0 0 0 0.24 0"/>
    </filter>
  </defs>
  <rect width="256" height="256" fill="#a96522"/>
  <rect width="256" height="256" filter="url(#woodGrain)" opacity="0.86"/>
  <rect width="256" height="256" filter="url(#fineGrain)" opacity="0.52"/>
  <g opacity="0.72">${plankLines}</g>
  <path d="M0 17 C42 11 70 23 112 16 S202 12 256 19" fill="none" stroke="#6e3815" stroke-width="1.5" opacity="0.45"/>
  <path d="M0 83 C36 91 74 74 116 83 S205 93 256 82" fill="none" stroke="#e1993b" stroke-width="1.3" opacity="0.32"/>
  <path d="M0 147 C44 137 81 154 126 146 S209 139 256 148" fill="none" stroke="#6e3815" stroke-width="1.4" opacity="0.42"/>
  <path d="M0 211 C48 222 82 204 125 212 S211 219 256 210" fill="none" stroke="#e1993b" stroke-width="1.2" opacity="0.3"/>
</svg>`;

async function writeTile(svg, sourcePath, outputPath) {
  await writeFile(sourcePath, svg);
  await sharp(Buffer.from(svg))
    .resize(size, size, { fit: "fill" })
    .webp({ quality: 96, nearLossless: true })
    .toFile(outputPath);
  console.log(`generated ${sourcePath}`);
  console.log(`generated ${outputPath}`);
}

await writeTile(paperSvg, "public/assets/ui/paper-tile-source.svg", "public/assets/ui/paper-tile.webp");
await writeTile(woodSvg, "public/assets/ui/wood-tile-source.svg", "public/assets/ui/wood-tile.webp");
