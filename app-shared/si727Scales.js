/**
 * SI 727 Reg 32(2) prescribed scales — single source of truth.
 *
 * Base scales 1:1000 … 1:7500, plus each multiplied or divided by an integral
 * power of ten. Lives in app-shared/ (rather than app-backend/src/utils/) so
 * the shared plan-sheeting resolver can reach it; si727Constants.js re-exports
 * it under the same name, so every existing importer is unaffected.
 */

export const SI727_PRESCRIBED_SCALES = [
  // Detailed scales (÷10)
  { value: 100, label: '1:100', category: 'detailed', power: -1 },
  { value: 125, label: '1:125', category: 'detailed', power: -1 },
  { value: 150, label: '1:150', category: 'detailed', power: -1 },
  { value: 200, label: '1:200', category: 'detailed', power: -1 },
  { value: 250, label: '1:250', category: 'detailed', power: -1 },
  { value: 300, label: '1:300', category: 'detailed', power: -1 },
  { value: 400, label: '1:400', category: 'detailed', power: -1 },
  { value: 500, label: '1:500', category: 'detailed', power: -1 },
  { value: 600, label: '1:600', category: 'detailed', power: -1 },
  { value: 750, label: '1:750', category: 'detailed', power: -1 },

  // Base scales (×1)
  { value: 1000, label: '1:1000', category: 'base', power: 0 },
  { value: 1250, label: '1:1250', category: 'base', power: 0 },
  { value: 1500, label: '1:1500', category: 'base', power: 0 },
  { value: 2000, label: '1:2000', category: 'base', power: 0 },
  { value: 2500, label: '1:2500', category: 'base', power: 0 },
  { value: 3000, label: '1:3000', category: 'base', power: 0 },
  { value: 4000, label: '1:4000', category: 'base', power: 0 },
  { value: 5000, label: '1:5000', category: 'base', power: 0 },
  { value: 6000, label: '1:6000', category: 'base', power: 0 },
  { value: 7500, label: '1:7500', category: 'base', power: 0 },

  // Regional scales (×10)
  { value: 10000, label: '1:10000', category: 'regional', power: 1 },
  { value: 12500, label: '1:12500', category: 'regional', power: 1 },
  { value: 15000, label: '1:15000', category: 'regional', power: 1 },
  { value: 20000, label: '1:20000', category: 'regional', power: 1 },
  { value: 25000, label: '1:25000', category: 'regional', power: 1 },
  { value: 30000, label: '1:30000', category: 'regional', power: 1 },
  { value: 40000, label: '1:40000', category: 'regional', power: 1 },
  { value: 50000, label: '1:50000', category: 'regional', power: 1 },
  { value: 60000, label: '1:60000', category: 'regional', power: 1 },
  { value: 75000, label: '1:75000', category: 'regional', power: 1 },
];

/** Denominators only, ascending. */
export const SI727_SCALE_LADDER = SI727_PRESCRIBED_SCALES
  .map((s) => s.value)
  .sort((a, b) => a - b);
