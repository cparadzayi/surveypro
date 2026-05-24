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
    geojson: null as any
  }),
  actions: {
    setLayer(layerId?: number) {
      this.currentLayerId = layerId
      this.page = 1
    },
    setSearch(q: string) {
      this.search = q
      this.page = 1
    },
    async fetch() {
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
