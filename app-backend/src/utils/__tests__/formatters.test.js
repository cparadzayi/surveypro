/**
 * Unit tests for Formatters & Utilities
 */

import { describe, test, expect } from '@jest/globals'
import {
  bankersRound,
  formatArea,
  formatAreaValue,
  getAreaUnit,
  formatCoordinate,
  formatDistance
} from '../formatters.js'

describe('Formatters & Utilities', () => {
  describe('bankersRound', () => {
    test('rounds 2.5 to 2 (nearest even)', () => {
      expect(bankersRound(2.5, 0)).toBe(2)
    })
    
    test('rounds 3.5 to 4 (nearest even)', () => {
      expect(bankersRound(3.5, 0)).toBe(4)
    })
    
    test('rounds 4.5 to 4 (nearest even)', () => {
      expect(bankersRound(4.5, 0)).toBe(4)
    })
    
    test('rounds 5.5 to 6 (nearest even)', () => {
      expect(bankersRound(5.5, 0)).toBe(6)
    })
    
    test('rounds 2.4 to 2 (standard rounding)', () => {
      expect(bankersRound(2.4, 0)).toBe(2)
    })
    
    test('rounds 2.6 to 3 (standard rounding)', () => {
      expect(bankersRound(2.6, 0)).toBe(3)
    })
    
    test('rounds with 1 decimal place', () => {
      expect(bankersRound(2.25, 1)).toBe(2.2)  // Even
      expect(bankersRound(2.35, 1)).toBe(2.4)  // Even
      expect(bankersRound(2.45, 1)).toBe(2.4)  // Even
      expect(bankersRound(2.55, 1)).toBe(2.6)  // Even
    })
    
    test('rounds with 2 decimal places', () => {
      expect(bankersRound(2.125, 2)).toBe(2.12)  // Even
      expect(bankersRound(2.135, 2)).toBe(2.14)  // Even
      expect(bankersRound(2.145, 2)).toBe(2.14)  // Even
      expect(bankersRound(2.155, 2)).toBe(2.16)  // Even
    })
    
    test('rounds with 4 decimal places', () => {
      expect(bankersRound(2.56785, 4)).toBe(2.5678)  // Even
      expect(bankersRound(2.56795, 4)).toBe(2.5680)  // Even
    })
    
    test('handles negative numbers', () => {
      expect(bankersRound(-2.5, 0)).toBe(-2)
      expect(bankersRound(-3.5, 0)).toBe(-4)
    })
    
    test('handles zero', () => {
      expect(bankersRound(0, 0)).toBe(0)
      expect(bankersRound(0.5, 0)).toBe(0)  // Even
    })
    
    test('handles very small numbers', () => {
      expect(bankersRound(0.00005, 4)).toBe(0.0000)
      expect(bankersRound(0.00015, 4)).toBe(0.0002)
    })
    
    test('throws error for non-number value', () => {
      expect(() => bankersRound('abc', 0)).toThrow('Value must be a valid number')
      expect(() => bankersRound(null, 0)).toThrow('Value must be a valid number')
      expect(() => bankersRound(undefined, 0)).toThrow('Value must be a valid number')
    })
    
    test('throws error for invalid decimals', () => {
      expect(() => bankersRound(2.5, -1)).toThrow('Decimals must be a non-negative integer')
      expect(() => bankersRound(2.5, 1.5)).toThrow('Decimals must be a non-negative integer')
      expect(() => bankersRound(2.5, 'abc')).toThrow('Decimals must be a non-negative integer')
    })
  })
  
  describe('formatArea', () => {
    test('formats small area in m² (whole number)', () => {
      expect(formatArea(566.03)).toBe('566 m²')
      expect(formatArea(1234.56)).toBe('1,235 m²')  // Banker's round 1234.56 -> 1235
    })
    
    test('formats area exactly at threshold', () => {
      expect(formatArea(9999.4)).toBe('9,999 m²')
      expect(formatArea(9999.5)).toBe('10,000 m²')  // Banker's round to even
      expect(formatArea(10000)).toBe('1.0000 ha')
    })
    
    test('formats large area in ha (4 decimals)', () => {
      expect(formatArea(10000)).toBe('1.0000 ha')
      expect(formatArea(25678.1234)).toBe('2.5678 ha')
      expect(formatArea(100000)).toBe('10.0000 ha')
    })
    
    test('applies banker\'s rounding to m²', () => {
      expect(formatArea(566.5)).toBe('566 m²')  // Even
      expect(formatArea(567.5)).toBe('568 m²')  // Even
    })
    
    test('applies banker\'s rounding to ha', () => {
      expect(formatArea(25678.5)).toBe('2.5678 ha')  // 2.56785 -> 2.5678 (even)
      expect(formatArea(25679.5)).toBe('2.5680 ha')  // 2.56795 -> 2.5680 (even)
    })
    
    test('handles zero area', () => {
      expect(formatArea(0)).toBe('0 m²')
    })
    
    test('handles very large areas', () => {
      expect(formatArea(1000000)).toBe('100.0000 ha')
      expect(formatArea(10000000)).toBe('1000.0000 ha')
    })
    
    test('throws error for negative area', () => {
      expect(() => formatArea(-100)).toThrow('Area cannot be negative')
    })
    
    test('throws error for non-number', () => {
      expect(() => formatArea('abc')).toThrow('Area must be a valid number')
      expect(() => formatArea(null)).toThrow('Area must be a valid number')
    })
  })
  
  describe('formatAreaValue', () => {
    test('returns numeric value without units for m²', () => {
      expect(formatAreaValue(566.03)).toBe('566')
      expect(formatAreaValue(1234.56)).toBe('1235')
    })
    
    test('returns numeric value without units for ha', () => {
      expect(formatAreaValue(10000)).toBe('1.0000')
      expect(formatAreaValue(25678.1234)).toBe('2.5678')
    })
    
    test('applies banker\'s rounding', () => {
      expect(formatAreaValue(566.5)).toBe('566')
      expect(formatAreaValue(567.5)).toBe('568')
    })
    
    test('throws error for negative area', () => {
      expect(() => formatAreaValue(-100)).toThrow('Area cannot be negative')
    })
  })
  
  describe('getAreaUnit', () => {
    test('returns m² for small areas', () => {
      expect(getAreaUnit(0)).toBe('m²')
      expect(getAreaUnit(100)).toBe('m²')
      expect(getAreaUnit(9999)).toBe('m²')
    })
    
    test('returns ha for large areas', () => {
      expect(getAreaUnit(10000)).toBe('ha')
      expect(getAreaUnit(50000)).toBe('ha')
      expect(getAreaUnit(1000000)).toBe('ha')
    })
    
    test('throws error for non-number', () => {
      expect(() => getAreaUnit('abc')).toThrow('Area must be a valid number')
    })
  })
  
  describe('formatCoordinate', () => {
    test('formats coordinate with default 3 decimals', () => {
      expect(formatCoordinate(2268555.01234)).toBe('2268555.012')
      expect(formatCoordinate(18862.52678)).toBe('18862.527')
    })
    
    test('formats coordinate with custom decimals', () => {
      expect(formatCoordinate(2268555.01234, 2)).toBe('2268555.01')
      expect(formatCoordinate(2268555.01234, 4)).toBe('2268555.0123')
    })
    
    test('handles negative coordinates', () => {
      expect(formatCoordinate(-2268555.01234)).toBe('-2268555.012')
    })
    
    test('throws error for non-number', () => {
      expect(() => formatCoordinate('abc')).toThrow('Value must be a valid number')
    })
  })
  
  describe('formatDistance', () => {
    test('formats short distances in meters', () => {
      expect(formatDistance(0)).toBe('0.00 m')
      expect(formatDistance(10.5)).toBe('10.50 m')
      expect(formatDistance(999.99)).toBe('999.99 m')
    })
    
    test('formats long distances in kilometers', () => {
      expect(formatDistance(1000)).toBe('1.000 km')
      expect(formatDistance(1500)).toBe('1.500 km')
      expect(formatDistance(10000)).toBe('10.000 km')
    })
    
    test('throws error for negative distance', () => {
      expect(() => formatDistance(-100)).toThrow('Distance cannot be negative')
    })
    
    test('throws error for non-number', () => {
      expect(() => formatDistance('abc')).toThrow('Distance must be a valid number')
    })
  })
  
  describe('Integration tests', () => {
    test('Schedule of Areas formatting workflow', () => {
      const parcels = [
        { stand: '2283', area_m2: 566.03 },
        { stand: '2284', area_m2: 566.53 },
        { stand: '2285', area_m2: 25678.1234 }
      ]
      
      const formatted = parcels.map(p => ({
        stand: p.stand,
        area: formatArea(p.area_m2),
        value: formatAreaValue(p.area_m2),
        unit: getAreaUnit(p.area_m2)
      }))
      
      expect(formatted[0]).toEqual({
        stand: '2283',
        area: '566 m²',
        value: '566',
        unit: 'm²'
      })
      
      expect(formatted[1]).toEqual({
        stand: '2284',
        area: '567 m²',  // Standard round 566.53 -> 567 (not exactly halfway)
        value: '567',
        unit: 'm²'
      })
      
      expect(formatted[2]).toEqual({
        stand: '2285',
        area: '2.5678 ha',
        value: '2.5678',
        unit: 'ha'
      })
    })
    
    test('CSV export workflow', () => {
      const area1 = 566.03
      const area2 = 25678.1234
      
      const csv = [
        `Stand,Area,Unit`,
        `2283,${formatAreaValue(area1)},${getAreaUnit(area1)}`,
        `2284,${formatAreaValue(area2)},${getAreaUnit(area2)}`
      ].join('\n')
      
      expect(csv).toContain('2283,566,m²')
      expect(csv).toContain('2284,2.5678,ha')
    })
  })
})
