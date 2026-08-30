import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
export const runtimeAssets = Object.freeze({
  'ewb-horizontal-header.webp': [1000, 336],
  'ewb-app-icon-192.png': [192, 192],
  'ewb-app-icon-512.png': [512, 512],
  'ewb-maskable-512.png': [512, 512],
  'ewb-apple-touch-icon-180.png': [180, 180],
  'ewb-favicon-16.png': [16, 16],
  'ewb-favicon-32.png': [32, 32],
  'ewb-favicon-48.png': [48, 48],
  'ewb-social-og-1200x630.png': [1200, 630],
  'favicon.ico': [[16, 16], [32, 32], [48, 48]],
  'manifest.webmanifest': null,
});
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');

export function dimensions(bytes) {
  if (bytes.subarray(0, 8).equals(pngSignature)) return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') {
    const kind = bytes.toString('ascii', 12, 16);
    if (kind === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
    if (kind === 'VP8X') return [1 + bytes.readUIntLE(24, 3), 1 + bytes.readUIntLE(27, 3)];
    if (kind === 'VP8L') {
      const bits = bytes.readUInt32LE(21);
      return [1 + (bits & 0x3fff), 1 + ((bits >>> 14) & 0x3fff)];
    }
  }
  if (bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1) {
    return Array.from({ length: bytes.readUInt16LE(4) }, (_, index) => {
      const offset = 6 + index * 16;
      const length = bytes.readUInt32LE(offset + 8);
      assert.ok(length > 0 && bytes.readUInt32LE(offset + 12) + length <= bytes.length, 'ICO image data exists');
      return [bytes[offset] || 256, bytes[offset + 1] || 256];
    });
  }
  throw new Error('Unrecognized brand image format');
}

// Decode only the lossless RGB PNG masters for exact pixel provenance, with no
// image library dependency. Runtime image headers are checked separately.
export function decodeRgbPng(bytes) {
  assert.ok(bytes.subarray(0, 8).equals(pngSignature), 'PNG signature');
  assert.equal(bytes[24], 8, 'source uses 8-bit channels');
  assert.equal(bytes[25], 2, 'source uses RGB pixels');
  assert.equal(bytes[28], 0, 'source is non-interlaced');
  const [width, height] = dimensions(bytes);
  const data = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') data.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const rows = inflateSync(Buffer.concat(data));
  const stride = width * 3;
  assert.equal(rows.length, height * (stride + 1), 'PNG scanline lengths');
  const pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const filter = rows[y * (stride + 1)];
    assert.ok(filter <= 4, 'known PNG filter');
    for (let x = 0; x < stride; x++) {
      const left = x >= 3 ? pixels[y * stride + x - 3] : 0;
      const up = y ? pixels[(y - 1) * stride + x] : 0;
      const corner = y && x >= 3 ? pixels[(y - 1) * stride + x - 3] : 0;
      const prediction = left + up - corner;
      const a = Math.abs(prediction - left), b = Math.abs(prediction - up), c = Math.abs(prediction - corner);
      const paeth = a <= b && a <= c ? left : b <= c ? up : corner;
      const delta = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
      pixels[y * stride + x] = rows[y * (stride + 1) + x + 1] + delta;
    }
  }
  return { width, height, pixels };
}

export function assertExactCrop(source, crop, x, y) {
  assert.ok(x >= 0 && y >= 0 && x + crop.width <= source.width && y + crop.height <= source.height, 'crop bounds');
  for (let row = 0; row < crop.height; row++) {
    const start = ((y + row) * source.width + x) * 3;
    assert.ok(source.pixels.subarray(start, start + crop.width * 3).equals(crop.pixels.subarray(row * crop.width * 3, (row + 1) * crop.width * 3)), `approved-source pixel mismatch at crop row ${row}`);
  }
}

export async function checkBrandAssets(staticRoot = join(root, 'client/public')) {
  const sourceBytes = await readFile(join(root, 'brand/emmiwood/source/ewb-approved-source-sheet.png'));
  assert.equal(digest(sourceBytes), '572e92bf6a2e40ddd24494b35c157ad80b9bf80adb5eca51f8d662bafe2e3931', 'approved source SHA-256');
  const source = decodeRgbPng(sourceBytes);
  assert.deepEqual([source.width, source.height], [1536, 1024]);
  for (const [name, size, x, y] of [
    ['ewb-app-icon-source-crop-390.png', [390, 390], 568, 550],
    ['ewb-horizontal-master.png', [1250, 420], 150, 120],
  ]) {
    const crop = decodeRgbPng(await readFile(join(root, 'brand/emmiwood/masters', name)));
    assert.deepEqual([crop.width, crop.height], size, name);
    assertExactCrop(source, crop, x, y);
  }
  const directory = join(staticRoot, 'emmiwood/brand');
  assert.deepEqual((await readdir(directory)).sort(), Object.keys(runtimeAssets).sort(), 'public brand folder contains exactly runtime assets, no masters or campaign exports');
  const receipts = [];
  for (const [name, size] of Object.entries(runtimeAssets)) {
    const bytes = await readFile(join(directory, name));
    if (size) assert.deepEqual(dimensions(bytes), size, `${name} dimensions`);
    const expected = await readFile(join(root, 'client/public/emmiwood/brand', name));
    assert.equal(digest(bytes), digest(expected), `${name} exact-artifact bytes`);
    receipts.push({ name, dimensions: size, sha256: digest(bytes) });
  }
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'Emmiwood Barbers');
  assert.equal(manifest.start_url, '/emmiwood/');
  assert.equal(manifest.scope, '/emmiwood/');
  assert.deepEqual(manifest.icons.map(({ src, sizes, purpose }) => [src, sizes, purpose]), [
    ['/emmiwood/brand/ewb-app-icon-192.png', '192x192', 'any'],
    ['/emmiwood/brand/ewb-app-icon-512.png', '512x512', 'any'],
    ['/emmiwood/brand/ewb-maskable-512.png', '512x512', 'maskable'],
  ]);
  const publicNames = await readdir(join(staticRoot, 'emmiwood'));
  for (const obsolete of ['mark.svg', 'og-emmiwood.png', 'source', 'masters', 'exports', 'rejected']) assert.ok(!publicNames.includes(obsolete), `obsolete/non-runtime public asset ${obsolete}`);
  const forbiddenNames = new Set([
    'ewb-approved-source-sheet.png', 'ewb-horizontal-master.png',
    'ewb-app-icon-source-crop-390.png', 'ewb-app-icon-master-1536.png',
    'ewb-generated-app-icon-master-1536.png', 'ewb-app-icon-1024.png',
    'ewb-social-avatar-1080.png', 'ewb-monogram-round-512.png', 'ewb-banner-1600x500.webp',
  ]);
  for (const entry of await readdir(staticRoot, { recursive: true, withFileTypes: true })) {
    assert.ok(!forbiddenNames.has(entry.name), `non-runtime brand material was published: ${entry.name}`);
  }
  return { approvedSourceSha256: digest(sourceBytes), exactSourceCrops: 2, staticRoot, assets: receipts };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await checkBrandAssets(process.argv[2] ? resolve(process.argv[2]) : undefined), null, 2));
}
