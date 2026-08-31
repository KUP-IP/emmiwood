import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertExactCrop, checkBrandAssets, decodeRgbPng, dimensions } from './brand-assets-check.mjs';
import { transparentWordmark, wordmarkCrop } from './brand-wordmark.mjs';

test('brand inventory verifies runtime dimensions, source hash, and both approved-source crops', async () => {
  const receipt = await checkBrandAssets();
  assert.equal(receipt.exactSourceCrops, 2);
  assert.equal(receipt.assets.length, 12);
  assert.ok(receipt.assets.every((asset) => /^[a-f0-9]{64}$/.test(asset.sha256)));
});

test('hero wordmark preserves source glyph cores and removes the sheet background with alpha', async () => {
  const source = decodeRgbPng(await readFile(new URL('../brand/emmiwood/source/ewb-approved-source-sheet.png', import.meta.url)));
  const result = transparentWordmark(source);
  let clear = 0, opaque = 0, soft = 0;
  for (let row = 0; row < result.height; row++) {
    for (let col = 0; col < result.width; col++) {
      const offset = (row * result.width + col) * 4;
      const alpha = result.pixels[offset + 3];
      if (!alpha) clear++;
      else if (alpha < 255) soft++;
      else {
        opaque++;
        const input = ((row + wordmarkCrop.y) * source.width + col + wordmarkCrop.x) * 3;
        assert.ok(result.pixels.subarray(offset, offset + 3).equals(source.pixels.subarray(input, input + 3)), 'opaque lettering must retain exact source RGB');
      }
    }
  }
  assert.ok(clear > result.width * result.height * .65, 'background is actually transparent');
  assert.ok(opaque > 5000, 'approved wordmark remains present');
  assert.ok(soft > 0, 'anti-aliased edges remain soft');
  assert.ok(result.png.equals(await readFile(new URL('../client/public/emmiwood/brand/ewb-wordmark-transparent.png', import.meta.url))));
});

test('pixel provenance rejects altered letterforms, crop offsets, and out-of-bounds crops', async () => {
  const source = decodeRgbPng(await readFile(new URL('../brand/emmiwood/source/ewb-approved-source-sheet.png', import.meta.url)));
  const crop = decodeRgbPng(await readFile(new URL('../brand/emmiwood/masters/ewb-app-icon-source-crop-390.png', import.meta.url)));
  assert.doesNotThrow(() => assertExactCrop(source, crop, 568, 550));
  assert.throws(() => assertExactCrop(source, crop, 569, 550), /pixel mismatch/);
  assert.throws(() => assertExactCrop(source, crop, 1400, 550), /crop bounds/);
  crop.pixels[200 * crop.width * 3 + 200 * 3] ^= 1;
  assert.throws(() => assertExactCrop(source, crop, 568, 550), /pixel mismatch/);
});

test('dimension reader rejects unknown formats and incomplete ICO payloads', () => {
  assert.throws(() => dimensions(Buffer.alloc(30)), /Unrecognized/);
  const brokenIco = Buffer.alloc(22);
  brokenIco.writeUInt16LE(1, 2);
  brokenIco.writeUInt16LE(1, 4);
  brokenIco[6] = brokenIco[7] = 16;
  brokenIco.writeUInt32LE(999, 14);
  assert.throws(() => dimensions(brokenIco), /ICO image data exists/);
});
