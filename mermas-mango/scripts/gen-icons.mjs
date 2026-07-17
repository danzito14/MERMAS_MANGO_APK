// Genera los iconos de la app (PWA + logo dentro de la app) desde assets/logo.png.
// Requisito: guarda tu logo cuadrado en mermas-mango/assets/logo.png (ideal 1024x1024).
// Uso: npm run icons
import sharp from 'sharp';
import { access, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'assets', 'logo.png');
const outDir = join(root, 'public', 'icons');
const GREEN = '#0f5c2b';

async function main() {
  try { await access(src); }
  catch { console.error('Falta el archivo assets/logo.png. Guarda ahi tu logo (cuadrado, ideal 1024x1024) y vuelve a correr: npm run icons'); process.exit(1); }

  await mkdir(outDir, { recursive: true });

  const sizes = [72, 96, 128, 144, 152, 192, 256, 384, 512];
  for (const s of sizes) {
    await sharp(src).resize(s, s, { fit: 'cover' }).png().toFile(join(outDir, `icon-${s}.png`));
    console.log(`icon-${s}.png`);
  }
  await sharp(src).resize(48, 48, { fit: 'cover' }).png().toFile(join(outDir, 'favicon-48.png'));

  // Maskable: rellena las esquinas (transparentes) con verde para que funcione con cualquier mascara.
  for (const s of [192, 512]) {
    const inner = await sharp(src).resize(s, s, { fit: 'cover' }).png().toBuffer();
    await sharp({ create: { width: s, height: s, channels: 4, background: GREEN } })
      .composite([{ input: inner }])
      .png()
      .toFile(join(outDir, `maskable-${s}.png`));
    console.log(`maskable-${s}.png`);
  }

  // Apple touch icon (sin transparencia, fondo verde por si el logo la tuviera).
  await sharp({ create: { width: 180, height: 180, channels: 4, background: GREEN } })
    .composite([{ input: await sharp(src).resize(180, 180, { fit: 'cover' }).png().toBuffer() }])
    .png()
    .toFile(join(outDir, 'apple-touch-icon.png'));
  console.log('apple-touch-icon.png');

  console.log('\nListo. Iconos regenerados en public/icons/.');
  console.log('Para el icono de la app en Android tambien: npx capacitor-assets generate --android');
}

main().catch((e) => { console.error(e); process.exit(1); });
