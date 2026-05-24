/**
 * Batch Export Utility
 * Creates a ZIP archive of all documents using JSZip
 * Saves to project folder via backend API
 */

import JSZip from 'jszip';
import axios from 'axios';

interface DocumentInfo {
  name: string;
  blob: Blob;
  type: string;
}

/**
 * Save ZIP archive to project folder via backend
 * Returns the saved file path
 */
export async function batchDownloadDocuments(
  projectName: string,
  documents: DocumentInfo[],
  workingDirectory?: string
): Promise<string> {
  if (documents.length === 0) {
    throw new Error('No documents to export');
  }

  const date = new Date().toISOString().split('T')[0];
  const zipFileName = `${projectName}_${date}_Documents.zip`;

  console.log(`📦 Creating ZIP archive: ${zipFileName}`);
  
  // Create new ZIP instance
  const zip = new JSZip();

  // Add each document to the ZIP
  for (let i = 0; i < documents.length; i++) {
    const doc = documents[i];
    const fileName = `${String(i + 1).padStart(2, '0')}_${doc.name}`;
    
    console.log(`  - Adding: ${fileName}`);
    zip.file(fileName, doc.blob);
  }

  // Create and add metadata file
  const metadata = {
    projectName,
    exportDate: new Date().toISOString(),
    documents: documents.map((doc, i) => ({
      number: i + 1,
      name: doc.name,
      type: doc.type,
      size: doc.blob.size
    })),
    totalDocuments: documents.length,
    totalSize: documents.reduce((sum, doc) => sum + doc.blob.size, 0)
  };

  zip.file('metadata.json', JSON.stringify(metadata, null, 2));

  console.log('🔄 Generating ZIP file...');
  
  // Generate ZIP blob
  const zipBlob = await zip.generateAsync({ 
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: {
      level: 6 // Balanced compression (0-9)
    }
  });

  console.log(`✅ ZIP created: ${(zipBlob.size / 1024 / 1024).toFixed(2)} MB`);
  
  // If working directory provided, save to project folder via backend
  if (workingDirectory) {
    console.log('💾 Saving ZIP to project folder...');
    
    // Convert blob to base64
    const zipBase64 = await blobToBase64(zipBlob);
    
    // Construct file path in project folder
    const filePath = `${workingDirectory}/output/batch-export/${zipFileName}`;
    
    // Save via backend API (uses Vite proxy /api -> http://127.0.0.1:3050)
    const response = await axios.post('/api/documents/save-zip', {
      zipBase64,
      filePath
    });
    
    if (response.data.success) {
      console.log(`✅ ZIP saved to: ${response.data.filePath}`);
      return response.data.filePath;
    } else {
      throw new Error(response.data.message || 'Failed to save ZIP');
    }
  } else {
    // Fallback: Download to browser Downloads folder
    console.log('📥 Downloading ZIP to browser Downloads folder...');
    await downloadBlob(zipBlob, zipFileName);
    return `Downloads/${zipFileName}`;
  }
}

/**
 * Convert Blob to base64 string
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // Remove data URL prefix (e.g., "data:application/zip;base64,")
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Download a single blob as a file
 */
function downloadBlob(blob: Blob, fileName: string): Promise<void> {
  return new Promise((resolve) => {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up the URL object
    setTimeout(() => {
      URL.revokeObjectURL(url);
      resolve();
    }, 100);
  });
}

/**
 * Convert a data URL to Blob
 */
export function dataURLtoBlob(dataURL: string): Blob {
  const arr = dataURL.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new Blob([u8arr], { type: mime });
}
