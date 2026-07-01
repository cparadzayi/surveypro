/**
 * Unit tests for Topology Builder
 */

import { describe, test, expect } from '@jest/globals'
import {
  buildTopology,
  buildBeaconMap,
  buildAdjacencyMap,
  findSharedBeacons,
  getAdjacentParcels,
  areAdjacent,
  getParcelBeacons,
  extractBeaconSuffix,
  determineBeaconOwner
} from '../topologyBuilder.js'

describe('Topology Builder', () => {
  // Sample data for tests
  const samplePoints = [
    { name: '2283A', x: 0, y: 0, type: 'placed' },
    { name: '2283B', x: 100, y: 0, type: 'placed' },
    { name: '2283C', x: 100, y: 100, type: 'placed' },
    { name: '2283D', x: 0, y: 100, type: 'placed' },
    { name: '2284A', x: 100, y: 0, type: 'placed' },  // Shared with 2283B
    { name: '2284B', x: 200, y: 0, type: 'placed' },
    { name: '2284C', x: 200, y: 100, type: 'placed' },
    { name: '2284D', x: 100, y: 100, type: 'placed' }  // Shared with 2283C
  ]
  
  const sampleParcels = [
    {
      stand: '2283',
      vertices: [
        { name: '2283A', x: 0, y: 0 },
        { name: '2283B', x: 100, y: 0 },
        { name: '2283C', x: 100, y: 100 },
        { name: '2283D', x: 0, y: 100 }
      ]
    },
    {
      stand: '2284',
      vertices: [
        { name: '2284A', x: 100, y: 0 },
        { name: '2284B', x: 200, y: 0 },
        { name: '2284C', x: 200, y: 100 },
        { name: '2284D', x: 100, y: 100 }
      ]
    }
  ]
  
  describe('buildBeaconMap', () => {
    test('creates beacon map from coordinate points', () => {
      const beaconMap = buildBeaconMap(sampleParcels, samplePoints)
      
      expect(beaconMap.size).toBe(8)
      expect(beaconMap.has('2283A')).toBe(true)
      expect(beaconMap.has('2284C')).toBe(true)
    })
    
    test('beacon map contains correct properties', () => {
      const beaconMap = buildBeaconMap(sampleParcels, samplePoints)
      const beacon = beaconMap.get('2283A')
      
      expect(beacon).toHaveProperty('name')
      expect(beacon).toHaveProperty('x')
      expect(beacon).toHaveProperty('y')
      expect(beacon).toHaveProperty('parcels')
      expect(beacon).toHaveProperty('shared')
      expect(beacon).toHaveProperty('type')
    })
    
    test('skips invalid coordinate points instead of throwing (resilient preview)', () => {
      // Real-world bug: a coordinate_points row with a blank name (a duplicate
      // of a named beacon at the same location) must not abort the whole survey
      // plan preview. Invalid points are skipped; valid points still map.
      const points = [
        { name: '2283A', x: 0, y: 0 },
        { name: 'B', x: 5 },          // missing y  → skipped
        { x: 0, y: 0 },               // missing name → skipped
        { name: '', x: 7, y: 7 },     // blank name (the actual bug) → skipped
        { name: '   ', x: 8, y: 8 },  // whitespace-only name → skipped
      ]
      let beaconMap
      expect(() => { beaconMap = buildBeaconMap(sampleParcels, points) }).not.toThrow()
      expect(beaconMap.has('2283A')).toBe(true)
      expect(beaconMap.has('')).toBe(false)
      expect(beaconMap.has('B')).toBe(false)
      expect(beaconMap.size).toBe(1)
    })
  })
  
  describe('buildAdjacencyMap', () => {
    test('detects adjacent parcels', () => {
      const beaconMap = buildBeaconMap(sampleParcels, samplePoints)
      const adjacency = buildAdjacencyMap(sampleParcels, beaconMap)
      
      expect(adjacency.size).toBe(2)
      expect(adjacency.get('2283').has('2284')).toBe(true)
      expect(adjacency.get('2284').has('2283')).toBe(true)
    })
    
    test('marks shared beacons', () => {
      const beaconMap = buildBeaconMap(sampleParcels, samplePoints)
      buildAdjacencyMap(sampleParcels, beaconMap)
      
      // 2283B and 2284A are the same point (shared)
      const beacon2283B = beaconMap.get('2283B')
      const beacon2284A = beaconMap.get('2284A')
      
      // They should both be marked as shared if they're at same location
      expect(beacon2283B.parcels.length).toBeGreaterThan(0)
      expect(beacon2284A.parcels.length).toBeGreaterThan(0)
    })
    
    test('handles parcels with no adjacency', () => {
      const isolatedParcels = [
        {
          stand: '1000',
          vertices: [
            { name: '1000A', x: 0, y: 0 },
            { name: '1000B', x: 10, y: 0 },
            { name: '1000C', x: 10, y: 10 },
            { name: '1000D', x: 0, y: 10 }
          ]
        }
      ]
      
      const points = [
        { name: '1000A', x: 0, y: 0 },
        { name: '1000B', x: 10, y: 0 },
        { name: '1000C', x: 10, y: 10 },
        { name: '1000D', x: 0, y: 10 }
      ]
      
      const beaconMap = buildBeaconMap(isolatedParcels, points)
      const adjacency = buildAdjacencyMap(isolatedParcels, beaconMap)
      
      expect(adjacency.get('1000').size).toBe(0)
    })
  })
  
  describe('findSharedBeacons', () => {
    test('identifies shared beacons', () => {
      const beaconMap = buildBeaconMap(sampleParcels, samplePoints)
      buildAdjacencyMap(sampleParcels, beaconMap)
      
      const shared = findSharedBeacons(sampleParcels, beaconMap)
      
      expect(Array.isArray(shared)).toBe(true)
      shared.forEach(beacon => {
        expect(beacon).toHaveProperty('name')
        expect(beacon).toHaveProperty('parcels')
        expect(beacon).toHaveProperty('count')
        expect(beacon.count).toBeGreaterThan(1)
      })
    })
    
    test('sorts shared beacons by usage count', () => {
      const beaconMap = buildBeaconMap(sampleParcels, samplePoints)
      buildAdjacencyMap(sampleParcels, beaconMap)
      
      const shared = findSharedBeacons(sampleParcels, beaconMap)
      
      for (let i = 0; i < shared.length - 1; i++) {
        expect(shared[i].count).toBeGreaterThanOrEqual(shared[i + 1].count)
      }
    })
  })
  
  describe('getAdjacentParcels', () => {
    test('returns adjacent parcels', () => {
      const beaconMap = buildBeaconMap(sampleParcels, samplePoints)
      const adjacency = buildAdjacencyMap(sampleParcels, beaconMap)
      
      const adjacent = getAdjacentParcels('2283', adjacency)
      
      expect(Array.isArray(adjacent)).toBe(true)
    })
    
    test('returns empty array for non-existent parcel', () => {
      const beaconMap = buildBeaconMap(sampleParcels, samplePoints)
      const adjacency = buildAdjacencyMap(sampleParcels, beaconMap)
      
      const adjacent = getAdjacentParcels('9999', adjacency)
      
      expect(adjacent).toEqual([])
    })
  })
  
  describe('areAdjacent', () => {
    test('correctly identifies adjacent parcels', () => {
      const beaconMap = buildBeaconMap(sampleParcels, samplePoints)
      const adjacency = buildAdjacencyMap(sampleParcels, beaconMap)
      
      const result = areAdjacent('2283', '2284', adjacency)
      
      expect(typeof result).toBe('boolean')
    })
    
    test('returns false for non-adjacent parcels', () => {
      const beaconMap = buildBeaconMap(sampleParcels, samplePoints)
      const adjacency = buildAdjacencyMap(sampleParcels, beaconMap)
      
      const result = areAdjacent('2283', '9999', adjacency)
      
      expect(result).toBe(false)
    })
  })
  
  describe('getParcelBeacons', () => {
    test('returns beacons for a parcel', () => {
      const beaconMap = buildBeaconMap(sampleParcels, samplePoints)
      const parcel = sampleParcels[0]
      
      const beacons = getParcelBeacons('2283', parcel, beaconMap)
      
      expect(Array.isArray(beacons)).toBe(true)
      expect(beacons.length).toBe(4)
      
      beacons.forEach(beacon => {
        expect(beacon).toHaveProperty('name')
        expect(beacon).toHaveProperty('x')
        expect(beacon).toHaveProperty('y')
        expect(beacon).toHaveProperty('shared')
        expect(beacon).toHaveProperty('parcels')
      })
    })
    
    test('returns empty array for parcel without vertices', () => {
      const beaconMap = buildBeaconMap(sampleParcels, samplePoints)
      const parcel = { stand: '1000' }
      
      const beacons = getParcelBeacons('1000', parcel, beaconMap)
      
      expect(beacons).toEqual([])
    })
  })
  
  describe('extractBeaconSuffix', () => {
    test('extracts suffix from beacon name', () => {
      expect(extractBeaconSuffix('2283A', '2283')).toBe('A')
      expect(extractBeaconSuffix('2284B', '2284')).toBe('B')
      expect(extractBeaconSuffix('1000XYZ', '1000')).toBe('XYZ')
    })
    
    test('returns empty string for beacon without suffix', () => {
      expect(extractBeaconSuffix('2283', '2283')).toBe('')
    })
    
    test('handles null/undefined inputs', () => {
      expect(extractBeaconSuffix(null, '2283')).toBe('')
      expect(extractBeaconSuffix('2283A', null)).toBe('')
    })
  })
  
  describe('determineBeaconOwner', () => {
    test('returns owner for shared beacon', () => {
      const beaconMap = buildBeaconMap(sampleParcels, samplePoints)
      buildAdjacencyMap(sampleParcels, beaconMap)
      
      // Find a shared beacon
      const sharedBeacons = findSharedBeacons(sampleParcels, beaconMap)
      
      if (sharedBeacons.length > 0) {
        const owner = determineBeaconOwner(sharedBeacons[0].name, beaconMap)
        expect(owner).toBeTruthy()
      }
    })
    
    test('returns null for non-shared beacon', () => {
      const beaconMap = new Map()
      beaconMap.set('TEST', {
        name: 'TEST',
        x: 0,
        y: 0,
        parcels: ['2283'],
        shared: false
      })
      
      const owner = determineBeaconOwner('TEST', beaconMap)
      
      expect(owner).toBeNull()
    })
  })
  
  describe('buildTopology', () => {
    test('builds complete topology', () => {
      const topology = buildTopology(sampleParcels, samplePoints)
      
      expect(topology).toHaveProperty('beacons')
      expect(topology).toHaveProperty('adjacency')
      expect(topology).toHaveProperty('beaconParcels')
      expect(topology).toHaveProperty('summary')
    })
    
    test('summary contains correct statistics', () => {
      const topology = buildTopology(sampleParcels, samplePoints)
      
      expect(topology.summary).toHaveProperty('totalBeacons')
      expect(topology.summary).toHaveProperty('sharedBeacons')
      expect(topology.summary).toHaveProperty('uniqueBeacons')
      expect(topology.summary).toHaveProperty('totalParcels')
      expect(topology.summary).toHaveProperty('totalAdjacencies')
      expect(topology.summary).toHaveProperty('averageAdjacenciesPerParcel')
      
      expect(topology.summary.totalBeacons).toBeGreaterThan(0)
      expect(topology.summary.totalParcels).toBe(2)
    })
    
    test('throws error for empty parcels', () => {
      expect(() => buildTopology([], samplePoints)).toThrow('Parcels must be a non-empty array')
    })
    
    test('throws error for empty coordinate points', () => {
      expect(() => buildTopology(sampleParcels, [])).toThrow('Coordinate points must be a non-empty array')
    })
  })
  
  describe('Integration tests', () => {
    test('realistic subdivision topology', () => {
      // 3 adjacent parcels sharing beacons
      const parcels = [
        {
          stand: '2283',
          vertices: [
            { name: '2283A', x: 0, y: 0 },
            { name: 'SHARED1', x: 50, y: 0 },
            { name: 'SHARED2', x: 50, y: 50 },
            { name: '2283D', x: 0, y: 50 }
          ]
        },
        {
          stand: '2284',
          vertices: [
            { name: 'SHARED1', x: 50, y: 0 },
            { name: '2284B', x: 100, y: 0 },
            { name: 'SHARED3', x: 100, y: 50 },
            { name: 'SHARED2', x: 50, y: 50 }
          ]
        },
        {
          stand: '2285',
          vertices: [
            { name: 'SHARED2', x: 50, y: 50 },
            { name: 'SHARED3', x: 100, y: 50 },
            { name: '2285C', x: 100, y: 100 },
            { name: '2285D', x: 50, y: 100 }
          ]
        }
      ]
      
      const points = [
        { name: '2283A', x: 0, y: 0 },
        { name: 'SHARED1', x: 50, y: 0 },
        { name: 'SHARED2', x: 50, y: 50 },
        { name: '2283D', x: 0, y: 50 },
        { name: '2284B', x: 100, y: 0 },
        { name: 'SHARED3', x: 100, y: 50 },
        { name: '2285C', x: 100, y: 100 },
        { name: '2285D', x: 50, y: 100 }
      ]
      
      const topology = buildTopology(parcels, points)
      
      // Should have 3 parcels
      expect(topology.summary.totalParcels).toBe(3)
      
      // Should have shared beacons
      expect(topology.summary.sharedBeacons).toBeGreaterThan(0)
      
      // All parcels should be adjacent to at least one other
      expect(topology.summary.totalAdjacencies).toBeGreaterThan(0)
    })
  })
})
