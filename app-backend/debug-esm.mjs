import { pathToFileURL } from 'url';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

try {
  const authPlugin = await import('./plugins/auth.mjs');
  console.log('Auth plugin loaded successfully');
} catch (err) {
  console.error('Auth plugin error:', err);
}

try {
  const healthPlugin = await import('./plugins/health.mjs');
  console.log('Health plugin loaded successfully');
} catch (err) {
  console.error('Health plugin error:', err);
}

try {
  const spatialPlugin = await import('./plugins/spatial.mjs');
  console.log('Spatial plugin loaded successfully');
} catch (err) {
  console.error('Spatial plugin error:', err);
}