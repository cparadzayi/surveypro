import type jsPDF from 'jspdf';

/**
 * Small vector icons for the letterhead's contact line, drawn with jsPDF's own shapes.
 *
 * They replace emoji (📞 📧 📍 🌐) written as text. The PDF's built-in Helvetica has no such glyphs, so
 * jsPDF printed them as the garbage "Ø=ÜÞ" and, once a string held a character outside Latin-1, spaced
 * the rest of that line's letters out ("c p a r a d z a y i"). Shapes need no font, so they print the
 * same everywhere.
 */

export type ContactIcon = 'phone' | 'email' | 'address' | 'website';

/** Side of the square an icon is drawn in, mm. About the cap height of the 9 pt contact text, a touch more. */
export const ICON_SIZE_MM = 3.2;
/** Gap between an icon and its text, mm. */
export const ICON_GAP_MM = 1.6;
const ICON_COLOUR: [number, number, number] = [0, 128, 0]; // the firm name's green
const STROKE_MM = 0.25;

/**
 * Draws `icon` in the square whose left edge is `x` and whose bottom sits just below `baselineY` (the
 * baseline of the text beside it), so it reads level with that text.
 */
export function drawContactIcon(pdf: jsPDF, icon: ContactIcon, x: number, baselineY: number): void {
  const s = ICON_SIZE_MM;
  const top = baselineY + 0.5 - s; // the square's top edge
  const cx = x + s / 2, cy = top + s / 2;
  pdf.saveGraphicsState();
  pdf.setDrawColor(...ICON_COLOUR);
  pdf.setFillColor(...ICON_COLOUR);
  pdf.setLineWidth(STROKE_MM);

  if (icon === 'phone') {
    // A handset, upright: the body, its screen and the button.
    const w = s * 0.62, h = s;
    pdf.roundedRect(cx - w / 2, top, w, h, 0.5, 0.5, 'S');
    pdf.line(cx - w / 2 + 0.35, top + 0.55, cx + w / 2 - 0.35, top + 0.55);
    pdf.circle(cx, top + h - 0.55, 0.2, 'F');
  } else if (icon === 'email') {
    // An envelope: the rectangle and the flap's two strokes meeting at the middle.
    const h = s * 0.7, y0 = cy - h / 2;
    pdf.rect(x, y0, s, h, 'S');
    pdf.line(x, y0, cx, y0 + h * 0.58);
    pdf.line(x + s, y0, cx, y0 + h * 0.58);
  } else if (icon === 'address') {
    // A map pin: a round head with a hole, narrowing to the point at the bottom.
    const r = s * 0.34, hy = top + r + 0.1;
    pdf.circle(cx, hy, r, 'S');
    pdf.line(cx - r * 0.88, hy + r * 0.5, cx, top + s);
    pdf.line(cx + r * 0.88, hy + r * 0.5, cx, top + s);
    pdf.circle(cx, hy, r * 0.32, 'F');
  } else {
    // A globe: the outline, the equator and a meridian.
    const r = s / 2;
    pdf.circle(cx, cy, r, 'S');
    pdf.line(cx - r, cy, cx + r, cy);
    pdf.ellipse(cx, cy, r * 0.42, r, 'S');
  }
  pdf.restoreGraphicsState();
}

/** Width an icon with its text takes on the line, mm. Call with the font already set. */
export function contactItemWidth(pdf: jsPDF, text: string): number {
  return ICON_SIZE_MM + ICON_GAP_MM + pdf.getTextWidth(text);
}

/** An icon followed by its text, the icon's left edge at `x`. Call with the text font and colour already set. */
export function drawContactItem(pdf: jsPDF, icon: ContactIcon, text: string, x: number, baselineY: number): void {
  drawContactIcon(pdf, icon, x, baselineY);
  pdf.text(text, x + ICON_SIZE_MM + ICON_GAP_MM, baselineY);
}
