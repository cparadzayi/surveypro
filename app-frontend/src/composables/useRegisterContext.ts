/**
 * The register's parcels as a layer on the surveyor's MapLibre map: farms, approved stands, the council's surveyed stands, each drawn so a surveyor
 * can tell how far to trust it. Under the survey's own points and parcels (it is added before them), off by default, remembered per project.
 *
 * The outlines arrive in the survey belt (westing X, southing Y) and are placed with the SAME transformation the survey's own parcels use
 * (capeLoToWGS84), so a council-surveyed stand lines up with the surveyor's own work; indicative outlines are drawn dotted and labelled "indicative"
 * because they can be tens of metres out.
 */
import { computed, ref, watch, type Ref } from 'vue';
import { capeLoToWGS84 } from '../utils/coordinateTransform';
import { countByQuality, describeFeature, loadContext, type ContextFeature, type LoadedContext, type Quality, type RegisterContext } from '../services/registerContext';

const SOURCE = 'register-context';
const LAYERS = { fill: 'register-context-fill', approved: 'register-context-approved', council: 'register-context-council', indicative: 'register-context-indicative' } as const;
export const QUALITY_COLOUR: Record<Quality, string> = { approved: '#15803d', council_survey: '#1d4ed8', indicative: '#c2410c' };

type Coord = [number, number];
const toWgs = (zone: number) => ([w, s]: Coord): Coord => {
  const p = capeLoToWGS84({ id: '', y: w, x: s }, zone);
  return [p.lng, p.lat];
};
const mapRing = (ring: Coord[], f: (c: Coord) => Coord) => ring.map(f);

/** A feature with its Lo outline turned into WGS 84 for the map. Anything that is not a (multi)polygon is dropped. */
export function toMapFeature(f: ContextFeature, zone: number) {
  const t = toWgs(zone);
  const g = f.geometry;
  let geometry: any;
  if (g?.type === 'Polygon') geometry = { type: 'Polygon', coordinates: g.coordinates.map((r: Coord[]) => mapRing(r, t)) };
  else if (g?.type === 'MultiPolygon') geometry = { type: 'MultiPolygon', coordinates: g.coordinates.map((p: Coord[][]) => p.map((r) => mapRing(r, t))) };
  else return null;
  return { type: 'Feature' as const, properties: { ...f.properties, summary: describeFeature(f.properties) }, geometry };
}

export function toFeatureCollection(ctx: RegisterContext) {
  const features = ctx.features.map((f) => toMapFeature(f, ctx.lo_zone)).filter(Boolean);
  return { type: 'FeatureCollection' as const, features };
}

/**
 * `getMap` returns the live map (it may not exist yet); `projectId` is the survey project; `opts.Popup` is maplibregl's Popup (for the hover text).
 * Call `attach()` once the map's style has been parsed: the layers are added then (empty), under whatever the view adds after, and filled when the
 * context arrives.
 */
export function useRegisterContext(getMap: () => any, projectId: Ref<number | null>, opts: { Popup?: new (o: object) => any } = {}) {
  const enabled = ref(false);
  const loading = ref(false);
  const error = ref('');
  const loaded = ref<LoadedContext | null>(null);
  const attached = ref(false);

  const counts = computed(() => countByQuality(loaded.value?.context.features ?? []));
  const asOf = computed(() => loaded.value?.context.as_of ?? null);
  const storageKey = () => `register-context:${projectId.value}`;

  function remember(on: boolean) { try { localStorage.setItem(storageKey(), on ? '1' : '0'); } catch { /* private mode: it just is not remembered */ } }
  function remembered(): boolean { try { return localStorage.getItem(storageKey()) === '1'; } catch { return false; } }

  function paint() {
    const map = getMap();
    if (!map || !attached.value || !map.getSource(SOURCE)) return;
    const data = loaded.value && enabled.value ? toFeatureCollection(loaded.value.context) : { type: 'FeatureCollection', features: [] };
    (map.getSource(SOURCE) as any).setData(data);
    for (const id of Object.values(LAYERS)) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', enabled.value ? 'visible' : 'none');
  }

  /** Add the source and layers (once). Safe to call again. */
  function attach() {
    const map = getMap();
    if (!map || attached.value) return;
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    const colour = ['match', ['get', 'quality'], 'approved', QUALITY_COLOUR.approved, 'council_survey', QUALITY_COLOUR.council_survey, QUALITY_COLOUR.indicative];
    const hidden = { visibility: 'none' };
    map.addLayer({ id: LAYERS.fill, type: 'fill', source: SOURCE, layout: hidden, paint: { 'fill-color': colour, 'fill-opacity': ['match', ['get', 'quality'], 'indicative', 0.05, 0.12] } });
    // three outlines, because a dash pattern cannot follow the data: solid = approved, dashed = the council's survey, dotted = indicative
    map.addLayer({ id: LAYERS.approved, type: 'line', source: SOURCE, filter: ['==', ['get', 'quality'], 'approved'], layout: hidden, paint: { 'line-color': QUALITY_COLOUR.approved, 'line-width': 1.6 } });
    map.addLayer({ id: LAYERS.council, type: 'line', source: SOURCE, filter: ['==', ['get', 'quality'], 'council_survey'], layout: hidden, paint: { 'line-color': QUALITY_COLOUR.council_survey, 'line-width': 1.6, 'line-dasharray': [3, 2] } });
    map.addLayer({ id: LAYERS.indicative, type: 'line', source: SOURCE, filter: ['==', ['get', 'quality'], 'indicative'], layout: hidden, paint: { 'line-color': QUALITY_COLOUR.indicative, 'line-width': 1.4, 'line-dasharray': [0.6, 2] } });
    attached.value = true;
    if (opts.Popup) {
      const popup = new opts.Popup({ closeButton: false, closeOnClick: false, maxWidth: '260px' });
      map.on('mousemove', LAYERS.fill, (e: any) => { const p = e.features?.[0]?.properties; if (p) { map.getCanvas().style.cursor = 'help'; popup.setLngLat(e.lngLat).setText(p.summary).addTo(map); } });
      map.on('mouseleave', LAYERS.fill, () => { map.getCanvas().style.cursor = ''; popup.remove(); });
    }
    if (remembered()) { enabled.value = true; void refresh(false); }
    paint();
  }

  async function refresh(force = true) {
    if (projectId.value == null) return;
    loading.value = true; error.value = '';
    try { loaded.value = await loadContext(projectId.value, { refresh: force }); }
    catch (e: any) {
      loaded.value = null;
      error.value = e?.response?.data?.message || (e?.response ? 'The register could not be shown for this project.' : 'The register could not be reached, and there is no copy on this device yet.');
    } finally { loading.value = false; }
    paint();
  }

  async function toggle() {
    enabled.value = !enabled.value;
    remember(enabled.value);
    if (enabled.value && !loaded.value) await refresh(false);
    paint();
  }

  watch(enabled, paint);
  return { enabled, loading, error, loaded, counts, asOf, attached, attach, refresh, toggle };
}
