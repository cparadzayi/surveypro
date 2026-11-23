import { defineStore } from 'pinia'
import { listLayerFeatures, getLayerGeoJSON, type Feature } from '../services/spatial'

export const useSpatialStore = defineStore('spatial', {
  state: () => ({
    currentLayerId: undefined as number|undefined,
    items: [] as Feature[],
    total: 0,
    page: 1,
    limit: 50,
    search: '',
    loading: false,
    geojson: null as any,
    /** Points given directly (a survey project's coordinate points) instead of a layer; searched and paged here. */
    staticFeatures: null as Feature[] | null
  }),
  actions: {
    setLayer(layerId?: number) {
      this.currentLayerId = layerId
      this.staticFeatures = null
      this.page = 1
    },
    /** Show these points instead of a layer's (null goes back to the layer). */
    setStaticFeatures(features: Feature[] | null) {
      this.staticFeatures = features
      if (features) this.currentLayerId = undefined
      this.page = 1
    },
    setSearch(q: string) {
      this.search = q
      this.page = 1
    },
    async fetch() {
      if (this.staticFeatures) {
        const t = this.search.trim().toLowerCase()
        const all = t
          ? this.staticFeatures.filter((f) => String(f.properties?.name ?? '').toLowerCase().includes(t))
          : this.staticFeatures
        this.total = all.length
        const pages = Math.max(1, Math.ceil(all.length / this.limit))
        if (this.page > pages) this.page = pages
        this.items = all.slice((this.page - 1) * this.limit, this.page * this.limit)
        this.geojson = { type: 'FeatureCollection', features: all }
        return
      }
      if (!this.currentLayerId) { this.items = []; this.total = 0; this.geojson = { type: 'FeatureCollection', features: [] }; return }
      this.loading = true
      try {
        const paged = await listLayerFeatures(this.currentLayerId, { page: this.page, limit: this.limit, search: this.search })
        this.items = paged.items
        this.total = paged.total
        this.page = paged.page
        this.limit = paged.limit
        this.geojson = await getLayerGeoJSON(this.currentLayerId, { search: this.search })
      } finally {
        this.loading = false
      }
    }
  }
})
