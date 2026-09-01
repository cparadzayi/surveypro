import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const PT_PER_MM = 72 / 25.4;

/**
 * Measure the scale a PDF was actually DRAWN at, from the emitted file.
 *
 * The plan labels its corner coordinate crosses with exact ground values
 * ("Y = +50000"), so the distance in points between two labels of known ground
 * value IS the drawn scale. This measures the output; it does not model the
 * page. Nothing here may consult figureBounds, the resolver, or the reported
 * scale — that is precisely the mistake this helper exists to prevent.
 *
 * Y labels vary along the page x axis (easting = -y in this projection) and X
 * labels along the page y axis, so each axis is measured independently and the
 * two must agree for the result to be trusted.
 *
 * @param {Buffer} pdfBuffer
 * @returns {Promise<{mmPerMetre:number, denominator:number,
 *                    ptPerMetreY:number, ptPerMetreX:number,
 *                    axisAgreement:number}>}
 */
export async function measureDrawnScale(pdfBuffer) {
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(pdfBuffer),
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  const page = await doc.getPage(1);
  const items = (await page.getTextContent()).items
    .filter((i) => i.str && i.str.trim())
    .map((i) => ({ text: i.str.trim(), x: i.transform[4], y: i.transform[5] }));

  // Widest pair wins: the longer the baseline, the less label-offset rounding
  // matters. Labels of equal ground value sit at equal positions, so any pair
  // with a non-zero ground separation is valid.
  const ptPerMetre = (pattern, positionOf) => {
    const points = [];
    for (const item of items) {
      const m = item.text.match(pattern);
      if (m) points.push({ ground: Number(m[1]), pos: positionOf(item) });
    }
    let best = null;
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dg = Math.abs(points[i].ground - points[j].ground);
        if (dg === 0) continue;
        if (!best || dg > best.dg) {
          best = { dg, dp: Math.abs(points[i].pos - points[j].pos) };
        }
      }
    }
    return best ? best.dp / best.dg : null;
  };

  const ptPerMetreY = ptPerMetre(/^Y\s*=\s*\+?(-?\d+)/, (it) => it.x);
  const ptPerMetreX = ptPerMetre(/^X\s*=\s*\+?(-?\d+)/, (it) => it.y);

  if (!ptPerMetreY || !ptPerMetreX) {
    throw new Error(
      `measureDrawnScale: need two distinct Y and two distinct X coordinate ` +
      `labels; found ptPerMetreY=${ptPerMetreY} ptPerMetreX=${ptPerMetreX}`,
    );
  }

  const mean = (ptPerMetreY + ptPerMetreX) / 2;
  const axisAgreement = Math.abs(ptPerMetreY - ptPerMetreX) / mean;
  const mmPerMetre = mean / PT_PER_MM;

  return {
    mmPerMetre,
    denominator: 1000 / mmPerMetre,
    ptPerMetreY,
    ptPerMetreX,
    axisAgreement,
  };
}
