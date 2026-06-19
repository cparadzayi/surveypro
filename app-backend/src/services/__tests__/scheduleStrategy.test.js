// app-backend/src/services/__tests__/scheduleStrategy.test.js
import { describe, test, expect } from '@jest/globals';
import { measureFigureWhitespace } from '../scheduleStrategy.js';
import { chooseScheduleStrategy } from '../scheduleStrategy.js';

describe('measureFigureWhitespace', () => {
  // contentArea is the usable drawing area in paper-mm: {x,y,w,h} with y UP.
  // figureBBox is the oriented figure bounding box in the same frame.
  const content = { x: 0, y: 0, w: 1000, h: 700 };

  test('figure centred horizontally → equal left and right strips', () => {
    const fig = { x: 350, y: 100, w: 300, h: 500 };
    const s = measureFigureWhitespace({ figureBBox: fig, contentArea: content });
    expect(s.left.w).toBeCloseTo(350, 5);
    expect(s.right.w).toBeCloseTo(350, 5);   // 1000 - (350+300)
    expect(s.left.h).toBeCloseTo(700, 5);    // side strips span full content height
    expect(s.right.x).toBeCloseTo(650, 5);
  });

  test('top and bottom strips are the height above/below the figure', () => {
    const fig = { x: 350, y: 100, w: 300, h: 500 };
    const s = measureFigureWhitespace({ figureBBox: fig, contentArea: content });
    expect(s.bottom.h).toBeCloseTo(100, 5);  // y 0..100
    expect(s.top.h).toBeCloseTo(100, 5);     // y 600..700
  });

  test('figure flush to the left edge → zero-width left strip, wide right strip', () => {
    const fig = { x: 0, y: 100, w: 300, h: 500 };
    const s = measureFigureWhitespace({ figureBBox: fig, contentArea: content });
    expect(s.left.w).toBeCloseTo(0, 5);
    expect(s.right.w).toBeCloseTo(700, 5);
  });

  test('reserved fixed-block bboxes shrink the overlapping strip', () => {
    const fig = { x: 350, y: 100, w: 300, h: 500 };
    // A title strip occupying the top 80mm of the RIGHT strip.
    const s = measureFigureWhitespace({
      figureBBox: fig, contentArea: content,
      fixedBlocks: [{ x: 650, y: 620, w: 350, h: 80 }],
    });
    expect(s.right.h).toBeCloseTo(620, 5); // 700 - 80 reserved at top
  });
});

describe('chooseScheduleStrategy', () => {
  const colW = 95;     // one schedule column-group width (mm)
  const rowH = 4;      // mm per row
  const headerH = 19;  // SCHEDULE_HEADER_HEIGHT_MM
  const tall = (w) => ({ x: 0, y: 0, w, h: 600 });   // tall side strip
  const flat = (h) => ({ x: 0, y: 0, w: 400, h });    // wide top/bottom strip

  test('both side strips usable → BALANCE, figure centred, two regions', () => {
    const d = chooseScheduleStrategy({
      strips: { left: tall(100), right: tall(100), top: flat(10), bottom: flat(10) },
      colW, rowH, headerH,
    });
    expect(d.mode).toBe('balance');
    expect(d.figureAlign).toBe('center');
    expect(d.regions).toHaveLength(2);
  });

  test('only one side strip usable → POOL on the wider side, figure pushed away', () => {
    const d = chooseScheduleStrategy({
      strips: { left: tall(30), right: tall(100), top: flat(10), bottom: flat(10) },
      colW, rowH, headerH,
    });
    expect(d.mode).toBe('pool');
    expect(d.regions).toHaveLength(1);
    expect(d.figureAlign).toBe('left'); // pool right ⇒ push figure left
  });

  test('no usable side strip but a tall top/bottom strip → FLAT', () => {
    const d = chooseScheduleStrategy({
      strips: { left: tall(10), right: tall(10), top: flat(120), bottom: flat(10) },
      colW, rowH, headerH,
    });
    expect(d.mode).toBe('flat');
  });

  test('nothing fits → ESCALATE', () => {
    const d = chooseScheduleStrategy({
      strips: { left: tall(10), right: tall(10), top: flat(10), bottom: flat(10) },
      colW, rowH, headerH,
    });
    expect(d.mode).toBe('escalate');
  });
});
