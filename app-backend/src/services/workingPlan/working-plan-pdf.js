import PDFDocument from 'pdfkit';
import { aciRgb } from '../diagram/aci.js';

/**
 * The Working Plan as a PDF, drawn from the shapes the DXF is made of (dxf-r12.js records both), so the
 * two sheets carry the same drawing at the same place and size. Ground metres become paper millimetres
 * through the sheet's own origin and scale, exactly as the DXF's coordinates were derived.
 *
 * Colours: AutoCAD's index 7 is "white or black, whichever shows", which on paper is black. Yellow,
 * green and cyan are unreadable on white, so they print as their darker equivalents; the rest keep the
 * index's own colour.
 */

const PT = 72 / 25.4;
const PAPER_COLOURS = { 7: [0, 0, 0], 2: [150, 120, 0], 3: [0, 130, 0], 4: [0, 140, 160], 9: [140, 140, 140] };
const colourOf = (aci) => PAPER_COLOURS[aci] ?? aciRgb(aci) ?? [0, 0, 0];

// Arial's metric twin, so a line breaks where the DXF's arial.ttf line would.
const FONTS = { ARIAL: 'Helvetica', 'ARIAL-BOLD': 'Helvetica-Bold', SERIF: 'Times-Roman' };
const CAP_HEIGHT = { Helvetica: 0.718, 'Helvetica-Bold': 0.718, 'Times-Roman': 0.662 };

/** @returns {Promise<Buffer>} */
export function workingPlanPdf({ doc: dxf, originE, originN, scale, sheet }) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      size: [sheet.width * PT, sheet.height * PT], margin: 0, autoFirstPage: true,
      info: { Title: 'Working Plan', Creator: 'SurveyPro' },
    });
    const chunks = [];
    pdf.on('data', (c) => chunks.push(c));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);

    const k = (1000 / scale) * PT;                       // ground metre -> pdf point
    const layers = new Map(dxf.layers.map((l) => [l.name, l]));
    const linetypes = new Map(dxf.linetypes.map((l) => [l.name, l.pattern]));
    const blocks = new Map(dxf.blocks.map((b) => [b.name, b.ops]));

    // The point of a shape, given in ground units, after the insert it sits in (if any).
    const place = (x, y, ctx) => {
      const c = Math.cos(ctx.rot), s = Math.sin(ctx.rot);
      const gx = ctx.dx + ctx.scale * (x * c - y * s);
      const gy = ctx.dy + ctx.scale * (x * s + y * c);
      return [(gx - originE) * k, (originN - gy) * k];
    };

    const style = (layerName, ctx, linetype) => {
      const layer = layers.get(ctx.layer ?? layerName) ?? layers.get('0');
      const lt = linetype ?? layer?.linetype ?? 'CONTINUOUS';
      const colour = colourOf(layer?.color ?? 7);
      pdf.strokeColor(colour).fillColor(colour);
      pdf.lineWidth(Math.max(((layer?.lineweight ?? 18) / 100) * PT, 0.1));
      const pattern = linetypes.get(lt);
      if (pattern && pattern.length >= 3) pdf.dash(pattern[1] * k, { space: -pattern[2] * k });
      else pdf.undash();
    };

    const draw = (ops, ctx) => {
      for (const op of ops) {
        // Layer 0 inside a block takes the layer of the INSERT.
        const layerName = op.layer === '0' && ctx.layer ? ctx.layer : op.layer;
        const c = { ...ctx, layer: layerName };
        switch (op.t) {
          case 'line': {
            style(layerName, c, op.linetype);
            const [x1, y1] = place(...op.a, c), [x2, y2] = place(...op.b, c);
            pdf.moveTo(x1, y1).lineTo(x2, y2).stroke();
            break;
          }
          case 'polyline': {
            if (op.points.length < 2) break;
            style(layerName, c, op.linetype);
            const pts = op.points.map(([x, y]) => place(x, y, c));
            pdf.moveTo(...pts[0]);
            for (const p of pts.slice(1)) pdf.lineTo(...p);
            if (op.closed) pdf.closePath();
            pdf.stroke();
            break;
          }
          case 'circle': {
            style(layerName, c, 'CONTINUOUS');
            const [cx, cy] = place(...op.c, c);
            pdf.circle(cx, cy, op.r * ctx.scale * k).stroke();
            break;
          }
          case 'solid': {
            style(layerName, c, 'CONTINUOUS');
            pdf.undash();
            const pts = op.pts.map(([x, y]) => place(x, y, c));
            pdf.moveTo(...pts[0]);
            for (const p of pts.slice(1)) pdf.lineTo(...p);
            // A hairline in the fill's colour closes the seams between the fan of solids.
            pdf.lineWidth(0.15).fillAndStroke();
            break;
          }
          case 'text': {
            const font = FONTS[op.style] ?? 'Helvetica';
            const size = (op.height * ctx.scale * k) / (CAP_HEIGHT[font] ?? 0.718);
            style(layerName, c, 'CONTINUOUS');
            pdf.undash().font(font).fontSize(size);
            const w = pdf.widthOfString(op.str) * op.widthFactor;
            const dx = op.align === 'center' ? -w / 2 : op.align === 'right' ? -w : 0;
            const [px, py] = place(...op.at, c);
            const ascent = (pdf._font.ascender / 1000) * size;
            pdf.save();
            pdf.translate(px, py).rotate(-(op.rotation + (ctx.rot * 180) / Math.PI));
            pdf.transform(op.widthFactor, 0, 0, 1, dx, -ascent);
            pdf.text(op.str, 0, 0, { lineBreak: false });
            pdf.restore();
            break;
          }
          case 'insert': {
            const inner = blocks.get(op.block);
            if (!inner) break;
            const [gx, gy] = [ctx.dx + ctx.scale * (op.at[0] * Math.cos(ctx.rot) - op.at[1] * Math.sin(ctx.rot)),
              ctx.dy + ctx.scale * (op.at[0] * Math.sin(ctx.rot) + op.at[1] * Math.cos(ctx.rot))];
            draw(inner, {
              dx: gx, dy: gy, scale: ctx.scale * op.scale,
              rot: ctx.rot + (op.rotation * Math.PI) / 180, layer: layerName,
            });
            break;
          }
          default: break;
        }
      }
    };

    draw(dxf.ops, { dx: 0, dy: 0, scale: 1, rot: 0, layer: null });
    pdf.end();
  });
}
