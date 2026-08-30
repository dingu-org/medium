import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const iconsDir = path.join(root, 'public', 'icons');
const source = path.join(iconsDir, 'source.png');
const regularSizes = [192, 256, 384, 512];
const maskableSizes = [192, 512];

await mkdir(iconsDir, { recursive: true });

for (const size of regularSizes) {
  await sharp(source)
    .resize(size, size, { fit: 'contain' })
    .png()
    .toFile(path.join(iconsDir, `icon-${size}.png`));
}

for (const size of maskableSizes) {
  const inner = Math.round(size * 0.72);
  const icon = await sharp(source)
    .resize(inner, inner, { fit: 'contain' })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: '#ffffff',
    },
  })
    .composite([{ input: icon, gravity: 'center' }])
    .png()
    .toFile(path.join(iconsDir, `maskable-${size}.png`));
}

await sharp(source)
  .flatten({ background: '#fafafa' })
  .resize(180, 180, { fit: 'contain' })
  .png()
  .toFile(path.join(root, 'public', 'apple-touch-icon.png'));
