import { defineStore } from 'pinia'
import type { SurveyPoint } from '../utils/calculations-part1'

export const useSurveyLookupStore = defineStore('surveyLookup', {
  state: () => ({
    fieldBookPageLookup: {} as Record<string, string>,
  }),
  actions: {
    setFieldBookPageLookup(lookup: Record<string, string>) {
      this.fieldBookPageLookup = lookup
    },
    clearLookup() {
      this.fieldBookPageLookup = {}
    },
  },
})
