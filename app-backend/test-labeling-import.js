// Test if pdfkitLabeling.js can be imported
import { LabelingSystem } from './src/services/pdfkitLabeling.js';

console.log('✅ LabelingSystem imported successfully');
console.log('LabelingSystem type:', typeof LabelingSystem);
console.log('LabelingSystem is class:', LabelingSystem.prototype !== undefined);

process.exit(0);
