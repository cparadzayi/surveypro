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
  });

  test('labels are MAGNITUDES, so left of 0 reads 20, 10 — not -20, -10', () => {
    // A bar scale is not a signed axis. The minus sign is a claim about the
    // sheet's coordinate frame that the bar is not making, and it reads as a
    // negative length to anyone measuring off the paper. What marks the left of
    // 0 is the subdivision density, not the sign of the text.
    expect(l.labels.map((t) => t.text)).toEqual(['20', '10', '0', '20', '40']);
    expect(l.labels.some((t) => t.text.startsWith('-'))).toBe(false);
  });

  test('two graduations 20 m apart both print "20", and x is what tells them apart', () => {
    // The duplicate is the point: a label is no longer a unique key, so anything
    // matching a label back to its graduation has to match on x, not on text.
    const twenties = l.labels.filter((t) => t.text === '20');
    expect(twenties).toHaveLength(2);
    expect(twenties[0].xMm).toBeLessThan(twenties[1].xMm);
    expect(twenties[0].atMm).toBe(-20);
    expect(twenties[1].atMm).toBe(20);
    expect(majorsOf(l).filter((v) => v.label === '20').map((v) => v.metres))
      .toEqual([-20, 20]);
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

  test('the labelled bars are twice the distance between the horizontals', () => {
    expect(G.barHeightMm).toBe(2 * G.ruleGapMm);
    for (const v of majorsOf(l)) {
      expect(v.y0Mm).toBe(0);
      expect(v.y1Mm).toBe(G.barHeightMm);
    }
    // …and so they cross the middle rule and stand as proud of it as the
    // rules are apart.
    expect(G.barHeightMm - G.ruleGapMm).toBe(G.ruleGapMm);
  });

  test('the unlabelled graduations stand at 60% of the labelled ones', () => {
    expect(G.minorHeightFactor).toBe(0.6);
    for (const v of minorsOf(l)) {
      expect(v.y0Mm).toBe(0);
      expect(v.y1Mm).toBeCloseTo(G.barHeightMm * 0.6, 6);
    }
    // They are subdivision, not a second tier of label — so they never reach the
    // height the labels clear.
    expect(G.barHeightMm * G.minorHeightFactor).toBeLessThan(G.barHeightMm);
  });

  test('the short graduations still cross the middle rule', () => {
    // 60% of 5mm is 3mm against a 2.5mm gap, so both horizontals read as
    // continuous across the whole bar instead of being chopped by the minors.
    const shortTop = G.barHeightMm * G.minorHeightFactor;
    expect(shortTop).toBeGreaterThan(G.ruleGapMm);
  });
});

describe('legibility arithmetic — the weights, not the gap, are the decision', () => {
  test('no rule is thinner than 0.2mm', () => {
    expect(G.minorWeightMm).toBeGreaterThanOrEqual(0.2);
    expect(G.majorWeightMm).toBeGreaterThanOrEqual(G.minorWeightMm);
    expect(G.frameWeightMm).toBeGreaterThanOrEqual(G.majorWeightMm);
  });

  test('the gap clears the frame rule by 4x, so the two never tint together', () => {
    expect(G.ruleGapMm).toBeGreaterThanOrEqual(4 * G.frameWeightMm);
  });

  test('the weight tiers separate by enough to be told apart unaided', () => {
    expect(G.frameWeightMm / G.minorWeightMm).toBeGreaterThanOrEqual(1.8);
    expect(G.majorWeightMm / G.minorWeightMm).toBeGreaterThanOrEqual(1.3);
  });

  test('the verticals are tall enough to read as bars, not ticks', () => {
    expect(G.barHeightMm / G.minorWeightMm).toBeGreaterThanOrEqual(10);
    // The short minors carry a weaker case, so they get their own floor.
    expect(G.barHeightMm * G.minorHeightFactor / G.minorWeightMm)
      .toBeGreaterThanOrEqual(10);
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

  test('the clean range reaches ~1:3000, one step further than at 0.25mm rules', () => {
    // The floor is ~3x the minor rule's own width, so thinning 0.25 -> 0.2mm
    // drops the pitch floor 0.75 -> 0.6mm and buys back a scale step. It is the
    // only thing thinning buys here; the remedy past the limit is still a shorter
    // bar span, never a thinner rule.
    expect(scaleBarLayout(3000).warnings).toEqual([]);
    expect(scaleBarLayout(3000).minorPitchMm).toBeCloseTo(0.667, 3);
  });

  test('past that the 2 m graduations stop separating', () => {
    // 1:5000 puts them 0.4mm apart with 0.2mm rules — a grey band, not a comb.
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
