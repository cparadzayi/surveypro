/**
 * dxf-r12.js — minimal, dependency-free DXF writer (AC1009 / R12).
 *
 * R12 is deliberate: it is the most widely readable DXF flavour (AutoCAD,
 * BricsCAD, Civil 3D, QGIS, ArcGIS, Model Maker, Land Development) and it can
 * be emitted safely by hand, with no handle/ownership bookkeeping.
 *
 * Everything is written in model space in ground units (metres).
 */

const f = (n) => (Math.round(n * 1e6) / 1e6).toFixed(6);

export class DxfDocument {
  constructor({ ltscale = 1.0, insunits = 6 } = {}) {
    this.ltscale = ltscale;
    this.insunits = insunits;         // 6 = metres
    this.linetypes = [
      { name: 'CONTINUOUS', descr: 'Solid line', pattern: null },
    ];
    this.layers = [];
    this.styles = [];
    this.blocks = [];
    this.entities = [];
  }

  addLinetype(name, descr, pattern) {
    // pattern: [totalLength, dash, -gap, dash, -gap, ...] in drawing units
    this.linetypes.push({ name, descr, pattern });
    return this;
  }

  addLayer(name, color, linetype = 'CONTINUOUS', lineweight = 18) {
    this.layers.push({ name, color, linetype, lineweight });
    return this;
  }

  addStyle(name, font) {
    this.styles.push({ name, font });
    return this;
  }

  addBlock(name, build) {
    const b = { name, entities: [] };
    const proxy = new EntitySink(b.entities);
    build(proxy);
    this.blocks.push(b);
    return this;
  }

  get sink() {
    return new EntitySink(this.entities);
  }

  toString() {
    const o = [];
    const g = (code, value) => o.push(String(code), String(value));

    // ---------------------------------------------------------------- HEADER
    g(0, 'SECTION'); g(2, 'HEADER');
    g(9, '$ACADVER'); g(1, 'AC1009');
    // Declare the code page, and the route encodes the file to match. Without
    // it a non-ASCII character (the m² in the area statement) is written as
    // multi-byte UTF-8 and AutoCAD renders it as mÂ². R12 has no UTF-8.
    g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1252');
    g(9, '$INSUNITS'); g(70, this.insunits);
    g(9, '$MEASUREMENT'); g(70, 1);
    g(9, '$LTSCALE'); g(40, f(this.ltscale));
    g(9, '$CELTSCALE'); g(40, f(1));
    // 1 = draw nothing. Each beacon block carries a POINT at its centre so CAD
    // can snap to it, but the conventional sign IS the marker -- drawing an X
    // through every symbol as well just clutters the sheet.
    g(9, '$PDMODE'); g(70, 1);          // point style: nothing displayed
    g(9, '$PDSIZE'); g(40, f(0));
    g(0, 'ENDSEC');

    // ---------------------------------------------------------------- TABLES
    g(0, 'SECTION'); g(2, 'TABLES');

    g(0, 'TABLE'); g(2, 'LTYPE'); g(70, this.linetypes.length);
    for (const lt of this.linetypes) {
      g(0, 'LTYPE'); g(2, lt.name); g(70, 0); g(3, lt.descr);
      g(72, 65);
      if (!lt.pattern) { g(73, 0); g(40, f(0)); }
      else {
        const [total, ...dashes] = lt.pattern;
        g(73, dashes.length); g(40, f(total));
        for (const d of dashes) g(49, f(d));
      }
    }
    g(0, 'ENDTAB');

    g(0, 'TABLE'); g(2, 'LAYER'); g(70, this.layers.length);
    for (const l of this.layers) {
      g(0, 'LAYER'); g(2, l.name); g(70, 0); g(62, l.color); g(6, l.linetype);
      // Group 370 (lineweight) does not exist in R12 -- it arrived with AutoCAD
      // 2000 (AC1015). Emitting it in a file whose $ACADVER says AC1009 makes
      // AutoCAD reject the whole drawing, while lenient parsers (ezdxf) accept it
      // silently. That is how it survived: every automated check passed and only
      // AutoCAD refused to open the sheet. In R12 weight is carried by layer
      // colour via the plot configuration, so there is nothing to write here.
      // l.lineweight stays on the layer definition for a later-version target.
    }
    g(0, 'ENDTAB');

    g(0, 'TABLE'); g(2, 'STYLE'); g(70, this.styles.length);
    for (const s of this.styles) {
      g(0, 'STYLE'); g(2, s.name); g(70, 0);
      g(40, f(0)); g(41, f(1)); g(50, f(0)); g(71, 0); g(42, f(2.5));
      g(3, s.font); g(4, '');
    }
    g(0, 'ENDTAB');
    g(0, 'ENDSEC');

    // ---------------------------------------------------------------- BLOCKS
    g(0, 'SECTION'); g(2, 'BLOCKS');
    for (const b of this.blocks) {
      g(0, 'BLOCK'); g(8, '0'); g(2, b.name); g(70, 0);
      g(10, f(0)); g(20, f(0)); g(30, f(0)); g(3, b.name); g(1, '');
      for (const e of b.entities) o.push(...e);
      g(0, 'ENDBLK'); g(8, '0');
    }
    g(0, 'ENDSEC');

    // -------------------------------------------------------------- ENTITIES
    g(0, 'SECTION'); g(2, 'ENTITIES');
    for (const e of this.entities) o.push(...e);
    g(0, 'ENDSEC');
    g(0, 'EOF');

    return o.join('\n') + '\n';
  }
}

class EntitySink {
  constructor(target) { this.t = target; }

  _push(tags) { this.t.push(tags.map(String)); }

  line([x1, y1], [x2, y2], { layer = '0', linetype } = {}) {
    const t = [0, 'LINE', 8, layer];
    if (linetype) t.push(6, linetype);
    t.push(10, f(x1), 20, f(y1), 30, f(0), 11, f(x2), 21, f(y2), 31, f(0));
    this._push(t);
    return this;
  }

  polyline(points, { layer = '0', closed = false, linetype } = {}) {
    const t = [0, 'POLYLINE', 8, layer];
    if (linetype) t.push(6, linetype);
    t.push(66, 1, 70, closed ? 1 : 0,
      10, f(0), 20, f(0), 30, f(0));
    this._push(t);
    for (const [x, y] of points) {
      this._push([0, 'VERTEX', 8, layer, 10, f(x), 20, f(y), 30, f(0)]);
    }
    this._push([0, 'SEQEND', 8, layer]);
    return this;
  }

  circle([x, y], r, { layer = '0' } = {}) {
    this._push([0, 'CIRCLE', 8, layer, 10, f(x), 20, f(y), 30, f(0), 40, f(r)]);
    return this;
  }

  point([x, y], { layer = '0' } = {}) {
    this._push([0, 'POINT', 8, layer, 10, f(x), 20, f(y), 30, f(0)]);
    return this;
  }

  /** Filled triangle / quad (R12 SOLID takes 4 corners in Z order). */
  solid(pts, { layer = '0' } = {}) {
    const p = pts.length === 3 ? [pts[0], pts[1], pts[2], pts[2]] : pts;
    // SOLID corner order is 1,2,4,3 - not a simple ring
    const [a, b, c, d] = [p[0], p[1], p[3], p[2]];
    this._push([0, 'SOLID', 8, layer,
      10, f(a[0]), 20, f(a[1]), 30, f(0),
      11, f(b[0]), 21, f(b[1]), 31, f(0),
      12, f(c[0]), 22, f(c[1]), 32, f(0),
      13, f(d[0]), 23, f(d[1]), 33, f(0)]);
    return this;
  }

  /**
   * @param align 'left' | 'center' | 'right'
   * @param rotation degrees, counter-clockwise
   * @param widthFactor horizontal scaling (letter tracking)
   */
  text(str, [x, y], height, {
    layer = '0', style = 'STANDARD', rotation = 0,
    align = 'left', widthFactor = 1,
  } = {}) {
    const hcode = { left: 0, center: 1, right: 2 }[align];
    const t = [0, 'TEXT', 8, layer, 7, style,
      10, f(x), 20, f(y), 30, f(0),
      40, f(height), 1, str,
      50, f(rotation), 41, f(widthFactor), 72, hcode];
    // when not left-aligned the second point carries the alignment position
    if (hcode !== 0) t.push(11, f(x), 21, f(y), 31, f(0));
    this._push(t);
    return this;
  }

  insert(blockName, [x, y], { layer = '0', rotation = 0, scale = 1 } = {}) {
    this._push([0, 'INSERT', 8, layer, 2, blockName,
      10, f(x), 20, f(y), 30, f(0),
      41, f(scale), 42, f(scale), 43, f(scale), 50, f(rotation)]);
    return this;
  }
}
