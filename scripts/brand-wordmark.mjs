import { deflateSync } from 'node:zlib';

// Immutable coordinates in the approved 1536x1024 sheet: wordmark only,
// excluding the monogram and vertical divider. No font substitution or redraw.
export const wordmarkCrop = Object.freeze({ x: 696, y: 256, width: 704, height: 216 });

function chunk(type, data) {
  const content = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const result = Buffer.alloc(data.length + 12);
  result.writeUInt32BE(data.length, 0);
  content.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

export function transparentWordmark(source) {
  const { x, y, width, height } = wordmarkCrop;
  if (source.width !== 1536 || source.height !== 1024) throw new Error('Unexpected brand source dimensions');
  const pixels = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const input = ((y + row) * source.width + x + col) * 3;
      const output = (row * width + col) * 4;
      const rgb = source.pixels.subarray(input, input + 3);
      // Strip only the near-black sheet matte. Bright glyph cores keep their
      // exact RGB; soft edge pixels are unmatted to avoid a black fringe.
      const alpha = Math.max(0, Math.min(1, (Math.max(...rgb) - 16) / 80));
      for (let channel = 0; channel < 3; channel++) {
        pixels[output + channel] = alpha ? Math.round(Math.max(0, Math.min(255, (rgb[channel] - 8 * (1 - alpha)) / alpha))) : 0;
      }
      pixels[output + 3] = Math.round(alpha * 255);
    }
  }
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let row = 0; row < height; row++) pixels.copy(rows, row * (width * 4 + 1) + 1, row * width * 4, (row + 1) * width * 4);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6; // 8-bit RGBA; transparent pixels are stored, not CSS-simulated.
  const png = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
  return { width, height, pixels, png };
}
