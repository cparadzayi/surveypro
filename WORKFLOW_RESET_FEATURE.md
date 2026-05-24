# Workflow Step Reset Feature

## Overview
Added the ability to reset individual workflow steps in the Cadastral Standard module without restarting the entire workflow. This allows users to regenerate documents or redo work at any step while preserving progress from previous steps.

## Implementation

### 1. Composable Functions (`useCadastralWorkflow.ts`)

Added step-specific reset functions:

```typescript
// Step-specific reset functions
resetFieldBook()           // Clears Field Book document
resetCalculationsPart1()   // Clears Calculations Part 1 + adjusted coordinates
resetCoordinateList()      // Clears Coordinate List document
resetCalculationsPart2()   // Clears Calculations Part 2 document
resetCurrentStep()         // Resets the currently active step
```

### 2. UI Integration

#### Field Book Step
- **Reset Button**: Appears after Field Book is generated
- **Action**: Clears the generated Field Book PDF
- **Confirmation**: "Reset Field Book? This will clear the generated field book document. You can regenerate it anytime."

#### Calculations Part 1 Step
- **Reset Button**: Appears after Calculations Part 1 is generated
- **Action**: Clears Calculations Part 1 PDF and adjusted coordinates
- **Cascade Effect**: Also resets Coordinate List and Calculations Part 2 (dependent steps)
- **Confirmation**: "Reset Calculations Part 1? This will clear the calculations document and adjusted coordinates. The Coordinate List will also need to be regenerated."

#### Coordinate List Step
- **Reset Button**: Appears after Coordinate List is generated
- **Action**: Clears the Coordinate List PDF
- **Confirmation**: "Reset Coordinate List? This will clear the generated coordinate list document. You can regenerate it anytime."

#### Calculations Part 2 Step
- **Reset Button**: Always visible in header
- **Action**: Clears all parcel definitions and area computations
- **Confirmation**: "Reset Calculations Part 2? This will clear all parcel definitions and area computations. You can rebuild them anytime."

## User Workflow

### Example: Regenerating Field Book

1. User completes CSV Import → Field Book → Calculations Part 1
2. User notices an error in Field Book
3. Click **🔄 Reset** button on Field Book step
4. Confirm the reset action
5. Field Book document is cleared
6. Click **📖 Generate Field Book** to regenerate
7. Calculations Part 1 and subsequent steps remain intact

### Example: Redoing Calculations Part 1

1. User completes all steps through Coordinate List
2. User wants to redo Calculations Part 1 with different settings
3. Click **🔄 Reset** button on Calculations Part 1 step
4. Confirm the reset action
5. Calculations Part 1, Coordinate List, and Calculations Part 2 are all cleared (cascade)
6. Regenerate Calculations Part 1
7. Regenerate Coordinate List
8. Rebuild parcels in Calculations Part 2

## Technical Details

### State Management

The workflow state is managed in a reactive singleton:

```typescript
const workflowState = reactive<CadastralWorkflowState>({
  currentStep: 'csv-import',
  importedPoints: [],
  documents: {},
  adjustedCoordinates: undefined,
  // ... other properties
})
```

### Reset Logic

Each reset function:
1. Deletes the relevant document from `workflowState.documents`
2. Clears related data (e.g., `adjustedCoordinates` for Calculations Part 1)
3. Logs the action to console
4. Does NOT change `currentStep` (user stays on same step)

### Dependency Handling

Some steps depend on others:
- **Coordinate List** depends on **Calculations Part 1** (needs adjusted coordinates)
- **Calculations Part 2** depends on **Coordinate List** (needs coordinate data)

When resetting Calculations Part 1, dependent steps are also reset to maintain data integrity.

## Benefits

1. **Flexibility**: Users can fix errors without starting over
2. **Efficiency**: Preserves work from unaffected steps
3. **Safety**: Confirmation dialogs prevent accidental resets
4. **Transparency**: Console logging for debugging
5. **User-Friendly**: Clear button placement and messaging

## Button Styling

All reset buttons use consistent styling:
- Icon: 🔄 (refresh/reset symbol)
- Style: Secondary button (white background, gray border)
- Position: Next to primary action button
- Visibility: Only shown when relevant document exists (except Calculations Part 2)

## Future Enhancements

1. **Undo/Redo**: Add ability to undo resets
2. **Partial Reset**: Reset specific sections within a step
3. **Auto-Save**: Automatically save state before reset
4. **History**: Show history of resets and regenerations
5. **Batch Reset**: Reset multiple steps at once

## Testing Recommendations

1. Test reset at each workflow step
2. Verify cascade resets work correctly
3. Test regeneration after reset
4. Verify state persistence across page refreshes
5. Test with different data sizes
6. Verify console logging works

## Notes

- Reset buttons are disabled during generation (to prevent conflicts)
- Resetting does NOT delete imported CSV data
- Resetting does NOT change surveyor/project selections
- All resets require user confirmation
- Pre-existing TypeScript lint errors in CadastralStandardView are unrelated to this feature
