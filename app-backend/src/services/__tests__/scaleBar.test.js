import {
  SI727_SCALE_BAR,
  scaleBarLayout,
  scaleDenominatorOf,
  scaleBarFrame,
  estimateTextWidthMm,
} from '../../../../app-shared/scaleBar.js';

const G = SI727_SCALE_BAR;
const majorsOf = (l) => l.verticals.filter((v) => v.major);
const minorsOf = (l) => l.verticals.filter((v) => !v.major);
const texts = (l) => l.labels.map((t) => t.text);

describe('scaleDenominatorOf', () => {
  test('reads a denominator out of a scale label', () => {
    expect(scaleDenominatorOf({ label: '1:2000' })).toBe(2000);
    expect(scaleDenominatorOf({ label: '1 : 500' })).toBe(500);
    expect(scaleDenominatorOf('1:2500')).toBe(2500);
    expect(scaleDenominatorOf(1250)).toBe(1250);
  });

  test('falls back to 1000 rather than trusting a label it cannot read', () => {
    expect(scaleDenominatorOf(null)).toBe(1000);
    expect(scaleDenominatorOf({ label: 'to scale' })).toBe(1000);
    expect(scaleDenominatorOf(0)).toBe(1000);
  });
});

describe('the figures follow the scale (the Surveyor-General\'s comment)', () => {
  test('1:1250 reads 25 | 12,5 | 0 | 25 | 50', () => {
    expect(texts(scaleBarLayout(1250))).toEqual(['25', '12,5', '0', '25', '50']);
  });

  test('1:1500 reads 30 | 15 | 0 | 30 | 60, as in the SG\'s own template', () => {
    expect(texts(scaleBarLayout(1500))).toEqual(['30', '15', '0', '30', '60']);
  });

  test.each([
    [500, ['10', '5', '0', '10', '20']],
    [1000, ['20', '10', '0', '20', '40']],
    [2000, ['40', '20', '0', '40', '80']],
    [2500, ['50', '25', '0', '50', '100']],
  ])('1:%i', (d, expected) => {
    expect(texts(scaleBarLayout(d))).toEqual(expected);
  });

  test('labels are MAGNITUDES, never signed', () => {
    for (const d of [500, 1250, 2500]) {
      expect(scaleBarLayout(d).labels.some((t) => t.text.startsWith('-'))).toBe(false);
    }
  });

  test('a graduation\'s ground value is on it, signed, for anything matching back by position', () => {
    const l = scaleBarLayout(1250);
    expect(l.labels.map((t) => t.atMm)).toEqual([-25, -12.5, 0, 25, 50]);
  });
});

describe('the bar is a fixed object on the paper', () => {
  test('20 mm left of 0 in ten 2 mm steps, marks at 20 and 40 mm right', () => {
    const l = scaleBarLayout(1250);
    const left = l.verticals.filter((v) => v.xMm <= 0);
    expect(left).toHaveLength(11);
    expect(left.map((v) => v.xMm)).toEqual([-20, -18, -16, -14, -12, -10, -8, -6, -4, -2, 0]);
    expect(l.verticals.filter((v) => v.xMm > 0).map((v) => v.xMm)).toEqual([20, 40]);
  });

  test('the same 60 mm bar at every scale, so it never crowds or goes stubby', () => {
    for (const d of [250, 500, 1000, 1250, 2000, 2500, 5000, 10000]) {
      const l = scaleBarLayout(d);
      expect(l.widthMm).toBe(60);
      expect(l.x0Mm).toBe(-20);
      expect(l.x1Mm).toBe(40);
      expect(l.minorPitchMm).toBe(2);
    }
  });

  test('the old scale limit is gone: 1:2000 and 1:5000 are clean', () => {
    for (const d of [500, 1250, 2000, 2500, 5000]) expect(scaleBarLayout(d).warnings).toEqual([]);
  });

  test('only the left end, its midpoint, 0 and the two right marks are labelled', () => {
    const l = scaleBarLayout(1250);
    expect(majorsOf(l).map((v) => v.xMm)).toEqual([-20, -10, 0, 20, 40]);
    expect(minorsOf(l).every((v) => v.label === null)).toBe(true);
    expect(majorsOf(l).every((v) => v.label !== null)).toBe(true);
  });

  test('no alternating fill -- the primitive list is rules and text only', () => {
    expect(Object.keys(scaleBarLayout(1250)).sort()).toEqual([
      'caption', 'denominator', 'heightMm', 'horizontals', 'labels',
      'minorPitchMm', 'mmPerMetre', 'reserved', 'unitLabel', 'verticals',
      'warnings', 'widthMm', 'x0Mm', 'x1Mm',
    ]);
  });
});

describe('the two horizontal rules and the vertical bar height', () => {
  const l = scaleBarLayout(1250);

  test('two horizontals, one at the bottom and one in the middle, spanning the bar', () => {
    expect(l.horizontals).toHaveLength(2);
    expect(l.horizontals[0].yMm).toBe(0);
    expect(l.horizontals[1].yMm).toBe(G.ruleGapMm);
    for (const h of l.horizontals) { expect(h.x0Mm).toBe(l.x0Mm); expect(h.x1Mm).toBe(l.x1Mm); }
  });

  test('the labelled bars are twice the distance between the horizontals', () => {
    expect(G.barHeightMm).toBe(2 * G.ruleGapMm);
    for (const v of majorsOf(l)) { expect(v.y0Mm).toBe(0); expect(v.y1Mm).toBe(G.barHeightMm); }
  });

  test('the subdivisions stand at 60% and still cross the middle rule', () => {
    for (const v of minorsOf(l)) expect(v.y1Mm).toBeCloseTo(G.barHeightMm * 0.6, 6);
    expect(G.barHeightMm * G.minorHeightFactor).toBeGreaterThan(G.ruleGapMm);
  });
});

describe('legibility arithmetic -- the weights, not the gap, are the decision', () => {
  test('no rule is thinner than 0.2mm and the tiers separate', () => {
    expect(G.minorWeightMm).toBeGreaterThanOrEqual(0.2);
    expect(G.majorWeightMm).toBeGreaterThanOrEqual(G.minorWeightMm);
    expect(G.frameWeightMm).toBeGreaterThanOrEqual(G.majorWeightMm);
    expect(G.frameWeightMm / G.minorWeightMm).toBeGreaterThanOrEqual(1.8);
  });

  test('the gap clears the frame rule by 4x, so the two never tint together', () => {
    expect(G.ruleGapMm).toBeGreaterThanOrEqual(4 * G.frameWeightMm);
  });

  test('graduation labels match the statement area text (9pt)', () => {
    expect(G.labelHeightMm * 72 / 25.4).toBeCloseTo(9, 2);
    for (const t of scaleBarLayout(1250).labels) expect(t.heightMm).toBe(G.labelHeightMm);
    expect(scaleBarLayout(1250).unitLabel.heightMm).toBe(G.labelHeightMm);
  });
});

describe('a scale whose figures are too long to fit is reported, not drawn badly', () => {
  test('1:1125 -> "11,25" does not fit between 10 mm labels', () => {
    expect(scaleBarLayout(1125).warnings.join(' ')).toMatch(/will touch/);
  });
});

describe('labels and the reserved slot', () => {
  const l = scaleBarLayout(1250);

  test('labels sit above the tallest bar, centred on their rule', () => {
    for (const t of l.labels) expect(t.yMm).toBeGreaterThan(G.barHeightMm);
    expect(l.labels.map((t) => t.xMm)).toEqual(majorsOf(l).map((v) => v.xMm));
    expect(l.labels.every((t) => t.align === 'center')).toBe(true);
  });

  test('the unit label clears the right end of the bar', () => {
    expect(l.unitLabel.text).toBe('Metres');
    expect(l.unitLabel.xMm).toBe(l.x1Mm + G.unitGapMm);
  });

  test('the caption names the scale, centred under the bar', () => {
    expect(l.caption.text).toBe('Scale 1 : 1250');
    expect(l.caption.xMm).toBe((l.x0Mm + l.x1Mm) / 2);
    expect(l.caption.yMm).toBeLessThan(0);
  });

  test('the reserved slot wraps bar + labels + caption + unit label', () => {
    const r = l.reserved;
    expect(r.widthMm).toBeGreaterThan(l.widthMm);
    expect(r.heightMm).toBe(G.labelHeightMm + G.labelGapMm + G.barHeightMm + G.captionGapMm + G.captionHeightMm);
    expect(r.xMm).toBe(l.x0Mm);
  });
});

test('estimateTextWidthMm grows with length and with type size', () => {
  expect(estimateTextWidthMm('Metres', 2)).toBeGreaterThan(estimateTextWidthMm('0', 2));
  expect(estimateTextWidthMm('Metres', 3)).toBeGreaterThan(estimateTextWidthMm('Metres', 2));
});

// The planner reserves a slot and keeps it clear of the figure; the bar must be
// drawn INSIDE that slot.
describe('scaleBarFrame draws the bar inside the slot it was given', () => {
  const PT = 72 / 25.4;
  const slotFor = (L) => ({ x: 1000, y: 1960, width: L.reserved.widthMm * PT, height: L.reserved.heightMm * PT });

  const extentOf = (denominator) => {
    const L = scaleBarLayout(denominator);
    const slot = slotFor(L);
    const F = scaleBarFrame(L, slot);
    const ys = [], xs = [];
    for (const h of L.horizontals) { ys.push(F.Y(h.yMm)); xs.push(F.X(h.x0Mm), F.X(h.x1Mm)); }
    for (const v of L.verticals) { ys.push(F.Y(v.y0Mm), F.Y(v.y1Mm)); xs.push(F.X(v.xMm)); }
    for (const t of [...L.labels, L.caption, L.unitLabel]) {
      const top = F.textTop(t.yMm, t.heightMm);
      ys.push(top, top + t.heightMm * PT);
    }
    xs.push(F.X(L.unitLabel.xMm) + (L.unitLabel.widthMm ?? 0) * PT);
    return { slot, minY: Math.min(...ys), maxY: Math.max(...ys), minX: Math.min(...xs), maxX: Math.max(...xs) };
  };

  test.each([500, 750, 1000, 1250, 2000])('1:%i: nothing is drawn outside the slot', (d) => {
    const e = extentOf(d);
    expect(e.minY).toBeGreaterThanOrEqual(e.slot.y - 0.01);
    expect(e.maxY).toBeLessThanOrEqual(e.slot.y + e.slot.height + 0.01);
    expect(e.minX).toBeGreaterThanOrEqual(e.slot.x - 0.01);
    expect(e.maxX).toBeLessThanOrEqual(e.slot.x + e.slot.width + 0.5);
  });
});
