/**
 * Genera los íconos PWA necesarios a partir del logo de Hausdame.
 * Uso: npx tsx scripts/generate-pwa-icons.ts
 *
 * Fuente (mobile/PWA): public/icons/hausdame_fondoblanco.png (150x150 cuadrado)
 * Destino: public/icons/
 *
 * Para bump de caché, incrementar VERSION y ejecutar este script.
 * Luego actualizar las referencias en manifest.json y app/layout.tsx.
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const VERSION = 'v2';

const SOURCE_IMAGE = path.join(process.cwd(), 'public', 'icons', 'hausdame_fondoblanco.png');
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'icons');

interface IconSpec {
  filename: string;
  size: number;
}

const ICONS: IconSpec[] = [
  { filename: `icon-192-${VERSION}.png`, size: 192 },
  { filename: `icon-512-${VERSION}.png`, size: 512 },
  { filename: `apple-touch-icon-${VERSION}.png`, size: 180 },
];

async function generateStandardIcon(src: string, size: number, output: string) {
  await sharp(src)
    .resize(size, size, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .png()
    .toFile(output);
}

async function generateMaskableIcon(src: string, size: number, output: string) {
  // Maskable: logo en el 60% central (safe zone estándar)
  const logoSize = Math.round(size * 0.6);
  const padding = Math.round((size - logoSize) / 2);

  await sharp(src)
    .resize(logoSize, logoSize, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .resize(size, size)
    .png()
    .toFile(output);
}

async function main() {
  if (!fs.existsSync(SOURCE_IMAGE)) {
    console.error(`Error: No se encontró la imagen fuente en ${SOURCE_IMAGE}`);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  for (const icon of ICONS) {
    const outputPath = path.join(OUTPUT_DIR, icon.filename);
    await generateStandardIcon(SOURCE_IMAGE, icon.size, outputPath);
    console.log(`✓ ${icon.filename} (${icon.size}x${icon.size})`);
  }

  const maskablePath = path.join(OUTPUT_DIR, `maskable-512-${VERSION}.png`);
  await generateMaskableIcon(SOURCE_IMAGE, 512, maskablePath);
  console.log(`✓ maskable-512-${VERSION}.png (512x512, maskable)`);

  console.log(`\nÍconos ${VERSION} generados en public/icons/`);
  console.log('Recuerda actualizar manifest.json y app/layout.tsx con los nuevos nombres.');
}

main().catch((err) => {
  console.error('Error generando íconos:', err);
  process.exit(1);
});
