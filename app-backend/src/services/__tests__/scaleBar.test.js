import {
  SI727_SCALE_BAR,
  scaleBarLayout,
  scaleDenominatorOf,
  estimateTextWidthMm,
} from '../../../../app-shared/scaleBar.js';

const G = SI727_SCALE_BAR;
const majorsOf = (l) => l.verticals.filter((v) => v.major);
const minorsOf = (l) => l.verticals.filter((v) => !v.major);
const at = (l, m) => l.verticals.find((v) => v.metres === m);

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

describe('SI 727 graduations', () => {
  const l = scaleBarLayout(2000);

  test('ten graduations left of 0, spanning 20 m, so each is 2 m', () => {
    const left = l.verticals.filter((v) => v.metres <= 0);
    expect(left).toHaveLength(11);                       // 10 divisions + the 0 itself
    expect(left.map((v) => v.metres)).toEqual([
      -20, -18, -16, -14, -12, -10, -8, -6, -4, -2, 0,
    ]);
  });

  test('two graduations right of 0, at 20 m and 40 m', () => {
    expect(l.verticals.filter((v) => v.metres > 0).map((v) => v.metres)).toEqual([20, 40]);
  });

  test('the labelled majors are exactly -20, -10, 0, 20, 40', () => {
    expect(majorsOf(l).map((v) => v.metres)).toEqual([-20, -10, 0, 20, 40]);
    expect(l.labels.map((t) => t.text)).toEqual(['-20', '-10', '0', '20', '40']);
  });

  test('only the majors carry a label', () => {
    expect(minorsOf(l).every((v) => v.label === null)).toBe(true);
    expect(majorsOf(l).every((v) => v.label !== null)).toBe(true);
  });

  test('no alternating fill — every rule is drawn, none is a block', () => {
    // The primitive list is horizontals + verticals + text and nothing else, so
    // a renderer cannot invent a checkerboard from it.
    expect(Object.keys(l).sort()).toEqual([
      'caption', 'denominator', 'heightMm', 'horizontals', 'labels',
      'minorPitchMm', 'mmPerMetre', 'reserved', 'unitLabel', 'verticals',
      'warnings', 'widthMm', 'x0Mm', 'x1Mm',
    ]);
  });
});

describe('the two horizontal rules and the vertical bar height', () => {
  const l = scaleBarLayout(2000);

  test('two horizontals, one at the bottom and one in the middle', () => {
    expect(l.horizontals).toHaveLength(2);
    expect(l.horizontals[0].yMm).toBe(0);
    expect(l.horizontals[1].yMm).toBe(G.ruleGapMm);
  });

  test('both horizontals span the full bar, -20 m to +40 m', () => {
    for (const h of l.horizontals) {
      expect(h.x0Mm).toBe(l.x0Mm);
      expect(h.x1Mm).toBe(l.x1Mm);
    }
  });

  test('the vertical bars are twice the distance between the horizontals', () => {
    expect(G.barHeightMm).toBe(2 * G.ruleGapMm);
    for (const v of l.verticals) {
      expect(v.y0Mm).toBe(0);
      expect(v.y1Mm).toBe(G.barHeightMm);
    }
    // …and so they cross the middle rule and stand as proud of it as the
    // rules are apart.
    expect(G.barHeightMm - G.ruleGapMm).toBe(G.ruleGapMm);
  });
});

describe('legibility arithmetic — the weights, not the gap, are the decision', () => {
  test('no rule is thinner than 0.25mm', () => {
    expect(G.minorWeightMm).toBeGreaterThanOrEqual(0.25);
    expect(G.majorWeightMm).toBeGreaterThanOrEqual(G.minorWeightMm);
    expect(G.frameWeightMm).toBeGreaterThanOrEqual(G.majorWeightMm);
  });

  test('the gap clears the frame rule by 4x, so the two never tint together', () => {
    expect(G.ruleGapMm).toBeGreaterThanOrEqual(4 * G.frameWeightMm);
  });

  test('the weight tiers separate by enough to be told apart unaided', () => {
    expect(G.frameWeightMm / G.minorWeightMm).toBeGreaterThanOrEqual(1.8);
  });

  test('the verticals are tall enough to read as bars, not ticks', () => {
    expect(G.barHeightMm / G.minorWeightMm).toBeGreaterThanOrEqual(10);
  });
});

describe('ground to paper', () => {
  test('a 1:2000 plan puts the 2 m graduations 1mm apart and the bar 30mm long', () => {
    const l = scaleBarLayout(2000);
    expect(l.mmPerMetre).toBe(0.5);
    expect(l.minorPitchMm).toBe(1);
    expect(at(l, -10).xMm).toBe(-5);
    expect(l.x0Mm).toBe(-10);
    expect(l.x1Mm).toBe(20);
    expect(l.widthMm).toBe(30);
  });

  test('the same bar is 60mm long at 1:1000 and 12mm at 1:5000', () => {
    expect(scaleBarLayout(1000).widthMm).toBe(60);
    expect(scaleBarLayout(5000).widthMm).toBe(12);
  });

  test('print geometry is a physical object — it does NOT scale with the plan', () => {
    for (const d of [500, 1000, 2000, 2500]) {
      const l = scaleBarLayout(d);
      expect(l.heightMm).toBe(G.barHeightMm);
      expect(l.horizontals[1].yMm).toBe(G.ruleGapMm);
      expect(at(l, 0).xMm).toBe(0);           // 0 is always at the origin
    }
  });
});

describe('scale limits are reported, not silently drawn badly', () => {
  test('the SI 727 working scales are clean', () => {
    for (const d of [500, 1000, 1250, 2000, 2500]) {
      expect(scaleBarLayout(d).warnings).toEqual([]);
    }
  });

  test('past ~1:2500 the 2 m graduations stop separating', () => {
    // 1:5000 puts them 0.4mm apart with 0.25mm rules — a grey band, not a comb.
    const l = scaleBarLayout(5000);
    expect(l.minorPitchMm).toBe(0.4);
    expect(l.warnings.join(' ')).toMatch(/graduations are 0\.40mm apart/);
    expect(l.warnings.join(' ')).toMatch(/do not thin the rules/);
  });

  test('and the bar goes stubby long before that', () => {
    expect(scaleBarLayout(10000).warnings.join(' ')).toMatch(/too stubby/);
  });
});

describe('labels and the reserved slot', () => {
  const l = scaleBarLayout(2000);

  test('labels sit above the tallest vertical bar, not on the bar', () => {
    for (const t of l.labels) expect(t.yMm).toBeGreaterThan(G.barHeightMm);
    expect(l.labels.every((t) => t.heightMm === G.labelHeightMm)).toBe(true);
  });

  test('labels are centred on their rule', () => {
    expect(l.labels.map((t) => t.xMm)).toEqual(majorsOf(l).map((v) => v.xMm));
    expect(l.labels.every((t) => t.align === 'center')).toBe(true);
  });

  test('the unit label clears the right end of the bar', () => {
    expect(l.unitLabel.text).toBe('Metres');
    expect(l.unitLabel.xMm).toBe(l.x1Mm + G.unitGapMm);
    expect(l.unitLabel.xMm).toBeGreaterThan(l.x1Mm);
  });

  test('the caption names the scale, centred under the bar', () => {
    expect(l.caption.text).toBe('Scale 1 : 2000');
    expect(l.caption.xMm).toBe((l.x0Mm + l.x1Mm) / 2);
    expect(l.caption.yMm).toBeLessThan(0);
  });

  test('the reserved slot wraps bar + labels + caption + unit label', () => {
    const r = l.reserved;
    expect(r.widthMm).toBeGreaterThan(l.widthMm);            // room for "Metres"
    expect(r.heightMm).toBe(
      G.labelHeightMm + G.labelGapMm + G.barHeightMm + G.captionGapMm + G.captionHeightMm
    );
    expect(r.xMm).toBe(l.x0Mm);
    expect(r.yMm).toBe(-(G.captionGapMm + G.captionHeightMm));
    // and the slot actually contains the bar
    expect(r.yMm).toBeLessThan(0);
    expect(r.yMm + r.heightMm).toBeGreaterThan(G.barHeightMm);
    expect(r.xMm + r.widthMm).toBeGreaterThan(l.x1Mm);
  });
});

test('estimateTextWidthMm grows with length and with type size', () => {
  expect(estimateTextWidthMm('Metres', 2)).toBeGreaterThan(estimateTextWidthMm('0', 2));
  expect(estimateTextWidthMm('Metres', 3)).toBeGreaterThan(estimateTextWidthMm('Metres', 2));
});
