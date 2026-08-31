import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { decodeRgbPng } from './brand-assets-check.mjs';
import { transparentWordmark } from './brand-wordmark.mjs';

const source = await readFile(new URL('../brand/emmiwood/source/ewb-approved-source-sheet.png', import.meta.url));
assert.equal(createHash('sha256').update(source).digest('hex'), '572e92bf6a2e40ddd24494b35c157ad80b9bf80adb5eca51f8d662bafe2e3931');
const { png } = transparentWordmark(decodeRgbPng(source));
await writeFile(new URL('../client/public/emmiwood/brand/ewb-wordmark-transparent.png', import.meta.url), png);
console.log('Generated transparent wordmark from the approved source sheet; no glyphs redrawn.');
