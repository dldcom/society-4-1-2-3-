import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const configs = {
  coast: {
    input: "public/assets/raw/generated/coast-buildings-4x4-source.png",
    outputDir: "public/assets/buildings/candidates/coast",
    validation: "public/assets/raw/generated/coast-buildings-4x4-validation.png",
    names: [
      "small-fishery",
      "seafood-storage",
      "fisher-rest",
      "sea-gift-packing",
      "coastal-workshop",
      "coastal-exchange-market",
      "main-hall",
      "small-pier",
      "net-drying-hut",
      "shellfish-workbench",
      "lighthouse-post",
      "salt-storage",
      "fishing-gear-shop",
      "seafood-market-stall",
      "boat-repair-shed",
      "wave-lookout",
    ],
  },
  mine: {
    input: "public/assets/raw/generated/mine-buildings-4x4-source.png",
    outputDir: "public/assets/buildings/candidates/mine",
    validation: "public/assets/raw/generated/mine-buildings-4x4-validation.png",
    names: [
      "small-mine",
      "mineral-storage",
      "miner-rest",
      "blacksmith-forge",
      "mining-workshop",
      "mining-exchange-hall",
      "main-office",
      "mine-cart-station",
      "stone-storage",
      "furnace-house",
      "tool-repair-shop",
      "tunnel-entrance",
      "mineral-appraisal",
      "safety-post",
      "coal-loading-shed",
      "rock-study-hut",
    ],
  },
  mountain: {
    input: "public/assets/raw/generated/mountain-buildings-4x4-source.png",
    outputDir: "public/assets/buildings/candidates/mountain",
    validation: "public/assets/raw/generated/mountain-buildings-4x4-validation.png",
    names: [
      "small-forest-path",
      "lumber-storage",
      "woodcutter-rest",
      "carpentry-workshop",
      "lumber-work-yard",
      "forest-exchange-hall",
      "main-hall",
      "log-stacking-shed",
      "mountain-cabin",
      "logging-watch-post",
      "timber-drying-shed",
      "forest-lookout-tower",
      "trail-signpost-hut",
      "herb-storage-hut",
      "wooden-bridge-workshop",
      "forest-market-stall",
    ],
  },
};

const settings = {
  columns: 4,
  rows: 4,
  frameW: 128,
  frameH: 128,
  maxDrawW: 116,
  maxDrawH: 116,
  padding: 8,
  cellInset: 10,
};

const regions = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(configs);

for (const region of regions) {
  const config = configs[region];
  if (!config) throw new Error(`Unknown region: ${region}`);
  await processRegion(region, config);
}

async function processRegion(region, config) {
  const source = sharp(config.input).ensureAlpha();
  const metadata = await source.metadata();
  const width = metadata.width;
  const height = metadata.height;
  if (!width || !height) throw new Error(`Invalid image: ${config.input}`);

  const raw = await source.raw().toBuffer();
  const transparent = removeGreenKey(raw, width, height);
  const cellW = Math.floor(width / settings.columns);
  const cellH = Math.floor(height / settings.rows);
  const componentsByCell = findGlobalComponents(transparent, width, height, cellW, cellH);

  await mkdir(config.outputDir, { recursive: true });

  const outputs = [];
  for (let index = 0; index < config.names.length; index++) {
    const col = index % settings.columns;
    const row = Math.floor(index / settings.columns);
    const cell = {
      left: col * cellW,
      top: row * cellH,
      width: cellW,
      height: cellH,
    };
    const bounds = boundsFromComponent(componentsByCell.get(index), cell, width, height);
    const rendered = await renderSprite(transparent, width, height, bounds);
    const outputPath = path.join(config.outputDir, `${String(index + 1).padStart(2, "0")}-${config.names[index]}.png`);
    await sharp(rendered, {
      raw: { width: settings.frameW, height: settings.frameH, channels: 4 },
    }).png().toFile(outputPath);
    outputs.push({ outputPath, index, warnings: getWarnings(bounds, cell, width, height) });
  }

  await saveValidation(config.validation, outputs);
  console.log(`processed ${region}: ${config.outputDir}`);
}

function removeGreenKey(buffer, width, height) {
  const output = Buffer.from(buffer);
  for (let i = 0; i < width * height; i++) {
    const offset = i * 4;
    const r = output[offset];
    const g = output[offset + 1];
    const b = output[offset + 2];
    const greenDominance = g - Math.max(r, b);
    const isKey = g >= 185 && r <= 105 && b <= 115 && greenDominance >= 70;
    if (isKey) {
      output[offset + 3] = 0;
      continue;
    }
    if (greenDominance > 18) {
      output[offset + 1] = Math.max(r, b);
    }
  }
  return output;
}

function findGlobalComponents(buffer, width, height, cellW, cellH) {
  const left = settings.cellInset;
  const top = settings.cellInset;
  const right = width - settings.cellInset;
  const bottom = height - settings.cellInset;
  const scanW = Math.max(1, right - left);
  const visited = new Uint8Array(scanW * Math.max(1, bottom - top));
  const componentsByCell = new Map();

  for (let y = top; y < bottom; y++) {
    for (let x = left; x < right; x++) {
      const local = (y - top) * scanW + (x - left);
      if (visited[local]) continue;
      visited[local] = 1;
      if (buffer[(y * width + x) * 4 + 3] <= 18) continue;

      const component = floodFill(buffer, width, left, top, right, bottom, scanW, visited, x, y);
      if (component.area < 120) continue;
      const centerX = (component.minX + component.maxX) / 2;
      const centerY = (component.minY + component.maxY) / 2;
      const col = Math.max(0, Math.min(settings.columns - 1, Math.floor(centerX / cellW)));
      const row = Math.max(0, Math.min(settings.rows - 1, Math.floor(centerY / cellH)));
      const cellIndex = row * settings.columns + col;
      const current = componentsByCell.get(cellIndex);
      if (!current || component.area > current.area) componentsByCell.set(cellIndex, component);
    }
  }

  return componentsByCell;
}

function boundsFromComponent(component, cell, width, height) {
  if (!component) {
    return { left: cell.left, top: cell.top, width: cell.width, height: cell.height };
  }

  const minX = component.minX;
  const minY = component.minY;
  const maxX = component.maxX;
  const maxY = component.maxY;
  return {
    left: Math.max(0, minX - settings.padding),
    top: Math.max(0, minY - settings.padding),
    width: Math.min(width, maxX + settings.padding + 1) - Math.max(0, minX - settings.padding),
    height: Math.min(height, maxY + settings.padding + 1) - Math.max(0, minY - settings.padding),
  };
}

function getWarnings(bounds, cell, width, height) {
  const warnings = [];
  const margin = 4;
  const spillMargin = 18;
  if (bounds.left <= margin || bounds.top <= margin || bounds.left + bounds.width >= width - margin || bounds.top + bounds.height >= height - margin) {
    warnings.push("image-edge");
  }
  if (bounds.left < cell.left - spillMargin || bounds.top < cell.top - spillMargin || bounds.left + bounds.width > cell.left + cell.width + spillMargin || bounds.top + bounds.height > cell.top + cell.height + spillMargin) {
    warnings.push("cell-spill");
  }
  return warnings;
}

function floodFill(buffer, imageW, left, top, right, bottom, scanW, visited, startX, startY) {
  const queue = [[startX, startY]];
  const component = {
    minX: startX,
    minY: startY,
    maxX: startX,
    maxY: startY,
    area: 0,
  };

  while (queue.length > 0) {
    const [x, y] = queue.pop();
    component.area++;
    component.minX = Math.min(component.minX, x);
    component.minY = Math.min(component.minY, y);
    component.maxX = Math.max(component.maxX, x);
    component.maxY = Math.max(component.maxY, y);

    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < left || nx >= right || ny < top || ny >= bottom) continue;
      const local = (ny - top) * scanW + (nx - left);
      if (visited[local]) continue;
      visited[local] = 1;
      if (buffer[(ny * imageW + nx) * 4 + 3] <= 18) continue;
      queue.push([nx, ny]);
    }
  }

  return component;
}

async function renderSprite(buffer, width, height, bounds) {
  const crop = await sharp(buffer, {
    raw: { width, height, channels: 4 },
  })
    .extract(bounds)
    .resize({
      width: settings.maxDrawW,
      height: settings.maxDrawH,
      fit: "inside",
      withoutEnlargement: false,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const spriteW = crop.info.width;
  const spriteH = crop.info.height;
  const left = Math.floor((settings.frameW - spriteW) / 2);
  const top = Math.floor((settings.frameH - spriteH) / 2);

  return sharp({
    create: {
      width: settings.frameW,
      height: settings.frameH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      {
        input: crop.data,
        raw: { width: spriteW, height: spriteH, channels: 4 },
        left,
        top,
      },
    ])
    .raw()
    .toBuffer();
}

async function saveValidation(validationPath, outputs) {
  const cellW = settings.frameW;
  const cellH = settings.frameH;
  const composites = [];
  for (const { outputPath, index, warnings } of outputs) {
    const col = index % settings.columns;
    const row = Math.floor(index / settings.columns);
    const labelColor = warnings.length > 0 ? "red" : "white";
    composites.push({
      input: outputPath,
      left: col * cellW,
      top: row * cellH,
    });
    composites.push({
      input: Buffer.from(`<svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
        ${warnings.length > 0 ? '<rect x="3" y="3" width="122" height="122" fill="none" stroke="red" stroke-width="6"/>' : ""}
        <text x="6" y="20" font-family="Arial" font-size="18" font-weight="700" fill="${labelColor}" stroke="black" stroke-width="3" paint-order="stroke">${index + 1}</text>
        ${warnings.length > 0 ? `<text x="6" y="42" font-family="Arial" font-size="12" font-weight="700" fill="red" stroke="black" stroke-width="2" paint-order="stroke">WARN</text>` : ""}
      </svg>`),
      left: col * cellW,
      top: row * cellH,
    });
  }

  await sharp({
    create: {
      width: settings.columns * cellW,
      height: settings.rows * cellH,
      channels: 4,
      background: { r: 0, g: 255, b: 0, alpha: 1 },
    },
  })
    .composite(composites)
    .png()
    .toFile(validationPath);
}
