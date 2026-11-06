import { describe, it, expect } from 'vitest';
import { trimBounds, padBounds, fitWithin, dataUrlBytes } from '../logoPrepare';

/** An RGBA image of one colour, with `paint` called for each pixel that should differ. */
function image(width: number, height: number, fill: [number, number, number, number], paint?: (set: (x: number, y: number, c: [number, number, number, number]) => void) => void) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set(fill, i * 4);
  paint?.((x, y, c) => data.set(c, (y * width + x) * 4));
  return data;
}

describe('trimBounds', () => {
  it('finds the box round artwork on a white background', () => {
    const data = image(20, 10, [255, 255, 255, 255], (set) => { for (let y = 3; y <= 6; y++) for (let x = 5; x <= 12; x++) set(x, y, [200, 30, 30, 255]); });
    expect(trimBounds(data, 20, 10)).toEqual({ x: 5, y: 3, width: 8, height: 4 });
  });

  it('treats transparent pixels as background whatever their colour', () => {
    const data = image(10, 10, [10, 20, 30, 0], (set) => set(4, 4, [0, 0, 0, 255]));
    expect(trimBounds(data, 10, 10)).toEqual({ x: 4, y: 4, width: 1, height: 1 });
  });

  it('keeps faint artwork: near-white counts as background only from the threshold up', () => {
    const data = image(10, 10, [255, 255, 255, 255], (set) => set(2, 2, [244, 244, 244, 255]));
    expect(trimBounds(data, 10, 10)).toEqual({ x: 2, y: 2, width: 1, height: 1 });
    const faint = image(10, 10, [255, 255, 255, 255], (set) => set(2, 2, [246, 246, 246, 255]));
    expect(trimBounds(faint, 10, 10)).toBeNull();
  });

  it('is null for an image that is all background', () => {
    expect(trimBounds(image(8, 8, [255, 255, 255, 255]), 8, 8)).toBeNull();
    expect(trimBounds(image(8, 8, [0, 0, 0, 0]), 8, 8)).toBeNull();
  });

  it('is not fooled by a single coloured pixel at each corner: the box spans them', () => {
    const data = image(30, 20, [255, 255, 255, 255], (set) => { set(0, 0, [0, 0, 0, 255]); set(29, 19, [0, 0, 0, 255]); });
    expect(trimBounds(data, 30, 20)).toEqual({ x: 0, y: 0, width: 30, height: 20 });
  });
});

describe('padBounds and fitWithin', () => {
  it('pads a box but never past the image', () => {
    expect(padBounds({ x: 1, y: 1, width: 5, height: 5 }, 3, 10, 10)).toEqual({ x: 0, y: 0, width: 9, height: 9 });
    expect(padBounds({ x: 4, y: 4, width: 2, height: 2 }, 2, 20, 20)).toEqual({ x: 2, y: 2, width: 6, height: 6 });
  });

  it('shrinks to the longer side and keeps the shape, and never enlarges', () => {
    expect(fitWithin(1600, 800, 800)).toEqual({ width: 800, height: 400 });
    expect(fitWithin(400, 900, 800)).toEqual({ width: 356, height: 800 });
    expect(fitWithin(300, 200, 800)).toEqual({ width: 300, height: 200 });
  });
});

describe('dataUrlBytes', () => {
  it('counts the decoded bytes of the payload, allowing for padding', () => {
    const bytes = Buffer.from('hello world'); // 11 bytes -> base64 with one pad
    expect(dataUrlBytes(`data:image/png;base64,${bytes.toString('base64')}`)).toBe(11);
    expect(dataUrlBytes(`data:image/png;base64,${Buffer.from('abc').toString('base64')}`)).toBe(3);
  });
});
