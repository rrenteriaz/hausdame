/**
 * Genera los íconos PWA necesarios a partir del logo de Hausdame.
 * Uso: npx tsx scripts/generate-pwa-icons.ts
 *
 * Fuente: public/icons/HausdameHorizontal_sinfondo.png (logo horizontal sin fondo)
 * Destino: public/icons/
 */

import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const SOURCE_IMAGE = path.join(process.cwd(), 'public', 'icons', 'HausdameHorizontal_sinfondo.png');
const SOURCE_MASKABLE = path.join(process.cwd(), 'public', 'icons', 'HausdameHorizontal_sinfondo.png');
const OUTPUT_DIR = path.join(process.cwd(), 'public', 'icons');

interface IconSpec {
  filename: string;
  size: number;
  maskable?: boolean;
}

const ICONS: IconSpec[] = [
  { filename: 'icon-192.png', size: 192 },
  { filename: 'icon-512.png', size: 512 },
  { filename: 'apple-touch-icon.png', size: 180 },
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
  // Para maskable icons: el logo debe ocupar el 60% central (safe zone = 80%)
  // Dejamos un 20% de padding en cada lado (total 40% padding)
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

  if (!fs.existsSync(SOURCE_MASKABLE)) {
    console.error(`Error: No se encontró la imagen fuente maskable en ${SOURCE_MASKABLE}`);
    process.exit(1);
  }

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Carpeta creada: ${OUTPUT_DIR}`);
  }

  for (const icon of ICONS) {
    const outputPath = path.join(OUTPUT_DIR, icon.filename);
    await generateStandardIcon(SOURCE_IMAGE, icon.size, outputPath);
    console.log(`✓ ${icon.filename} (${icon.size}x${icon.size})`);
  }

  // Maskable icon (usa hausdame_Sin fondo para que el fondo blanco sea el del ícono, no el logo)
  const maskablePath = path.join(OUTPUT_DIR, 'maskable-512.png');
  await generateMaskableIcon(SOURCE_MASKABLE, 512, maskablePath);
  console.log('✓ maskable-512.png (512x512, maskable)');

  console.log('\nTodos los íconos PWA generados en public/icons/');
  console.log('Para reemplazarlos con el arte final, sobreescribe los archivos en public/icons/');
}

main().catch((err) => {
  console.error('Error generando íconos:', err);
  process.exit(1);
});
