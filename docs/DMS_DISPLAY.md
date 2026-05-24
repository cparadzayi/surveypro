# DMS Display and Parsing Guide

This document explains how DMS (Degrees–Minutes–Seconds) is handled across the frontend, allowing each module (mining, engineering, topo, conversions) to select its own display precision.

## Conventions

- Coordinates use Zimbabwe P(Y, X) convention; bearings are south-oriented (0° = South, clockwise).
- Preferred DMS separator is a colon `:`. The parser accepts `;` for compatibility.
- Minutes and seconds must be less than 60. After rounding, seconds and minutes carry to the next unit.
- Degrees wrap into the range [0, 360).

## Building blocks

- `src/utils/dms.ts`
  - `decimalToDMS(decimal)` → `{ D, M, S }`
  - `dmsToDecimal({D,M,S})` → number degrees
  - `carryDMS({D,M,S})` → carries seconds → minutes, minutes → degrees, degrees wrap
  - `formatDMS(dms, secondsDecimals, separator)` → string like `123:45:30.12`
  - `parseFlexibleNumberOrDMS(input)` → number | null (accepts D:M:S or decimal with comma)
- `src/utils/displayConfig.ts`
  - `getDMSPolicy(context)` → `{ secondsDecimals, separator }`
  - Contexts: `default`, `mining`, `engineering`, `topo`, `conversions`
- `src/composables/useDMS.ts`
  - `useDMSPolicy(context)` → composable returning helpers bound to the chosen context

## Using the composable

Example in a component:

```ts
<script setup lang="ts">
import { ref } from 'vue'
import { useDMSPolicy } from '../../composables/useDMS'

// Choose a context. Options: 'default' | 'mining' | 'engineering' | 'topo' | 'conversions'
const { policy, formatDegrees, parseDegrees, normalizeDMS } = useDMSPolicy('mining')

const bearing = ref(0) // decimal degrees south-oriented

function onInputChange(text: string) {
  const v = parseDegrees(text)
  if (v !== null) bearing.value = v
}
</script>

<template>
  <div>
    <div>Policy seconds decimals: {{ policy.secondsDecimals }}</div>
    <div>Display: {{ formatDegrees(bearing) }}</div>
  </div>
</template>
```

## Notes

- Use `formatDegrees` for displaying bearings with the policy’s precision.
- Use `parseDegrees` for user inputs (D:M:S or decimal with comma allowed).
- For inputs with separate fields (D / M / S), use `normalizeDMS` to carry and wrap values as the user types.

## Adopting per-module

- Topo module: `useDMSPolicy('topo')` for 1 decimal second.
- Mining/Engineering: `useDMSPolicy('mining')` or `'engineering'` for 2 decimal seconds.
- Conversions: `useDMSPolicy('conversions')` for higher precision (3 decimals).
- Default (if unspecified): integer seconds.

Adjust `src/utils/displayConfig.ts` if you need different defaults later.
