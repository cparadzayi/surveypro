# Working Directory Implementation for Cadastral Projects

## Overview
Implemented a comprehensive working directory system for cadastral survey projects. Land surveyors can now specify a working directory when creating a project, which will contain all input files and generated output files.

## Features Implemented

### 1. Working Directory Selector Component
**File:** `app-frontend/src/components/cadastral/WorkingDirectorySelector.vue`

**Features:**
- Text input for manual path entry
- "Use Default" button to generate recommended path
- "Browse" button for directory picker (modern browsers)
- Real-time path validation
- Directory structure preview
- Absolute/relative path handling
- Help text with guidelines

**Props:**
- `modelValue`: Current working directory path (v-model)
- `projectName`: Project name for default path generation
- `district`: District name (optional) for path generation

### 2. Directory Management Utilities
**File:** `app-frontend/src/utils/project-directory.ts`

**Functions:**

#### `getProjectDirectoryStructure(workingDirectory: string)`
Returns the complete directory structure:
```typescript
{
  root: workingDirectory,
  input: `${workingDirectory}/input`,
  output: `${workingDirectory}/output`,
  fieldBook: `${workingDirectory}/output/field-book`,
  calculations: `${workingDirectory}/output/calculations`,
  coordinateList: `${workingDirectory}/output/coordinate-list`,
  reports: `${workingDirectory}/output/reports`,
  certificates: `${workingDirectory}/output/certificates`
}
```

#### `generateDefaultWorkingDirectory(projectName: string, district?: string)`
Generates a default path based on project information:
```
Documents/SurveyPro/Projects/ProjectName_District_2025-10-27
```

#### `validateWorkingDirectory(path: string)`
Validates directory path:
- Checks for empty path
- Validates against invalid characters: `< > " | ? *`
- Prevents parent directory references (`..`)

#### `getOutputFilePaths(workingDirectory: string, projectName: string)`
Returns all output file paths:
- Field Book PDF
- Calculations Part 1 PDF
- Coordinate List PDF
- Calculations Part 2 PDF
- Report on Survey PDF
- DSG Certificate PDF
- Combined full document
- CSV input file
- Project metadata JSON

#### `getDirectoryStructureDescription(workingDirectory: string)`
Returns formatted directory tree for display

#### `formatDirectoryPath(path: string, maxLength: number)`
Shortens long paths for display (e.g., `C:/.../ ProjectName`)

#### `isAbsolutePath(path: string)`
Checks if path is absolute (Windows/Unix compatible)

#### `makeAbsolutePath(path: string, basePath?: string)`
Converts relative path to absolute for display

### 3. Type System Updates
**File:** `app-frontend/src/types/cadastral.ts`

Added `workingDirectory` field to `CadastralWorkflowState.projectInfo`:
```typescript
projectInfo: {
  name: string;
  district: string;
  surveyDescription: string;
  projectId?: number;
  centralMeridian?: number;
  controlPointIds?: number[];
  workingDirectory?: string; // NEW
}
```

### 4. UI Integration
**File:** `app-frontend/src/views/modules/cadastral-standard/CadastralStandardView.vue`

Added Working Directory Selector to the Field Book step, after the "Instruments Used" field.

## Directory Structure

### Recommended Layout
```
WorkingDirectory/
├── input/                    # Input files
│   ├── coordinates.csv      # Imported coordinate data
│   └── control-points.csv   # Control point data
│
└── output/                   # Generated outputs
    ├── field-book/          # Electronic Field Book PDFs
    │   └── ProjectName_FieldBook.pdf
    │
    ├── calculations/        # Calculations PDFs
    │   ├── ProjectName_CalculationsPart1.pdf
    │   └── ProjectName_CalculationsPart2.pdf
    │
    ├── coordinate-list/     # Coordinate List PDFs
    │   └── ProjectName_CoordinateList.pdf
    │
    ├── reports/             # Report on Survey PDFs
    │   └── ProjectName_ReportOnSurvey.pdf
    │
    ├── certificates/        # DSG Certificate PDFs
    │   └── ProjectName_DSGCertificate.pdf
    │
    └── ProjectName_Complete.pdf  # Combined document
```

## User Workflow

### 1. Project Creation
When creating a new cadastral project:

1. **Enter Project Information**
   - Surveyor details
   - Project name
   - District
   - Survey description

2. **Specify Working Directory**
   - Option 1: Use default path (recommended)
   - Option 2: Enter custom path manually
   - Option 3: Browse for directory (modern browsers)

3. **Validation**
   - Path is validated in real-time
   - Invalid characters are flagged
   - Directory structure preview is shown

### 2. File Organization

**Input Files:**
- Place CSV files in `input/` folder
- System reads from this location
- Control points can be stored here

**Output Files:**
- All PDFs automatically saved to appropriate subfolders
- Easy to find specific document types
- Organized chronologically

### 3. Benefits

**For Surveyors:**
- ✅ All project files in one location
- ✅ Easy backup (backup entire directory)
- ✅ Clear organization by document type
- ✅ No file naming confusion
- ✅ Portable (can move entire directory)

**For System:**
- ✅ Consistent file paths
- ✅ Automatic directory creation
- ✅ No file conflicts
- ✅ Easy to implement file operations
- ✅ Supports project archiving

## Path Handling

### Absolute Paths
```
Windows: C:\Projects\Survey_2024
Unix/Linux: /home/user/projects/survey_2024
```

### Relative Paths
```
Documents/SurveyPro/Projects/MyProject
```
- Resolved relative to user's home directory
- Displayed as absolute path for clarity

### Path Validation Rules

**Valid:**
- `C:/Projects/Survey2024`
- `Documents/SurveyPro/Projects/LOT_1-12`
- `/home/surveyor/projects/gwelo_survey`

**Invalid:**
- `C:/Projects/Survey<2024>` (contains `<>`)
- `../../../system` (parent directory reference)
- `Projects/Survey|2024` (contains `|`)
- Empty path

## Browser Compatibility

### Directory Picker API
- **Supported:** Chrome 86+, Edge 86+
- **Not Supported:** Firefox, Safari
- **Fallback:** Manual path entry always available

### File System Access
- Modern browsers support File System Access API
- Older browsers use manual path entry
- No functionality loss in unsupported browsers

## Future Enhancements

### 1. Directory Creation
```typescript
async function createProjectDirectories(workingDirectory: string) {
  const structure = getProjectDirectoryStructure(workingDirectory);
  // Create all directories
  await fs.mkdir(structure.input, { recursive: true });
  await fs.mkdir(structure.fieldBook, { recursive: true });
  // ... etc
}
```

### 2. File Watching
Monitor directory for changes:
- Auto-import new CSV files
- Detect manual file additions
- Sync with cloud storage

### 3. Project Templates
Pre-configured directory structures:
- Standard cadastral survey
- Subdivision project
- Consolidation project
- Each with appropriate subfolders

### 4. Backup Integration
- Automatic backup to cloud
- Version control for PDFs
- Change tracking

### 5. Multi-Project Support
```
Documents/SurveyPro/
├── Projects/
│   ├── Project_A_2024-10-27/
│   ├── Project_B_2024-10-28/
│   └── Project_C_2024-10-29/
└── Templates/
    ├── Standard/
    └── Custom/
```

## Implementation Notes

### State Management
- Working directory stored in `workflowState.projectInfo.workingDirectory`
- Persists throughout workflow
- Available to all workflow steps

### File Operations
When generating PDFs:
```typescript
const filePaths = getOutputFilePaths(
  workflowState.projectInfo.workingDirectory,
  workflowState.projectInfo.name
);

// Save Field Book
await saveFile(filePaths.fieldBook, pdfBlob);

// Save Calculations
await saveFile(filePaths.calculationsPart1, calcBlob);
```

### Error Handling
- Validate path before file operations
- Handle permission errors gracefully
- Provide clear error messages
- Suggest alternative paths if needed

## Testing Checklist

- [ ] Default path generation works
- [ ] Manual path entry validates correctly
- [ ] Browse button works (modern browsers)
- [ ] Invalid characters are rejected
- [ ] Directory structure preview displays
- [ ] Absolute paths are recognized
- [ ] Relative paths are converted
- [ ] Path persists through workflow
- [ ] File operations use correct paths
- [ ] Error messages are helpful

## Documentation for Users

### Quick Start Guide

**Step 1: Enter Project Details**
Fill in surveyor information and project details.

**Step 2: Set Working Directory**
Click "Use Default" for recommended path, or enter custom path.

**Step 3: Verify Structure**
Check the directory structure preview to ensure it's correct.

**Step 4: Proceed with Workflow**
All generated files will be saved to the specified directory.

### Best Practices

1. **Use Descriptive Names**
   - Include project identifier
   - Add district name
   - Use date for versioning

2. **Keep Organized**
   - One directory per project
   - Don't mix projects
   - Archive completed projects

3. **Backup Regularly**
   - Backup entire working directory
   - Use cloud storage
   - Keep multiple versions

4. **File Naming**
   - System handles naming automatically
   - Don't rename generated files
   - Keep original structure

## Conclusion

The working directory system provides a professional, organized approach to managing cadastral survey project files. It ensures all input and output files are stored in a logical, consistent structure that's easy to navigate, backup, and archive.

**Key Benefits:**
- ✅ Professional organization
- ✅ Easy file management
- ✅ Simplified backup
- ✅ Clear structure
- ✅ Portable projects
- ✅ No file conflicts
- ✅ Future-proof design
