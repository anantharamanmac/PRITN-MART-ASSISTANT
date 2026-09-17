import { db } from './firebase';
import { collection, doc, getDocs, setDoc, Timestamp } from 'firebase/firestore';
import JSZip from 'jszip';

export const BACKUP_COLLECTIONS = [
  'orders',
  'users',
  'attendance',
  'tasks',
  'holidays',
  'settings',
  'feedback',
  'changelogs',
  'admin_files',
  'face_profiles',
  'notifications',
] as const;

export type BackupCollectionName = typeof BACKUP_COLLECTIONS[number];

export interface BackupMetadata {
  appName: string;
  version: string;
  exportedAt: string;
  exportedBy?: string;
  collections: Record<string, number>;
  totalDocuments: number;
}

export interface BackupPreview {
  fileName: string;
  fileSizeFormatted: string;
  exportedAt: string | null;
  appName: string;
  totalDocuments: number;
  collectionCounts: Record<string, number>;
  rawCollectionsData: Record<string, any[]>;
  isValidBackup: boolean;
  validationErrors: string[];
}

export type AutoBackupSchedule = 'disabled' | 'weekly' | 'monthly';

export interface BackupScheduleConfig {
  schedule: AutoBackupSchedule;
  autoDownloadOnVisit: boolean;
  lastBackupDate: string | null;
  lastBackupCount: number;
}

const STORAGE_SCHEDULE_KEY = 'printmart_backup_schedule_config';

/**
 * Format raw byte count into human-readable size string
 */
export function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Recursively convert Firestore Timestamps, Dates, Bytes into JSON-serializable objects
 */
function serializeValue(value: any): any {
  if (value === null || value === undefined) return value;

  // Handle Firestore Timestamp object or objects with toDate method
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const d: Date = value.toDate();
    return {
      _type: 'firestore_timestamp',
      seconds: value.seconds ?? Math.floor(d.getTime() / 1000),
      nanoseconds: value.nanoseconds ?? 0,
      iso: d.toISOString(),
    };
  }

  // Handle standard JS Date
  if (value instanceof Date) {
    return {
      _type: 'firestore_timestamp',
      seconds: Math.floor(value.getTime() / 1000),
      nanoseconds: 0,
      iso: value.toISOString(),
    };
  }

  // Handle object with seconds property (raw timestamp)
  if (
    typeof value === 'object' &&
    typeof value.seconds === 'number' &&
    value.nanoseconds !== undefined &&
    Object.keys(value).length <= 3
  ) {
    return {
      _type: 'firestore_timestamp',
      seconds: value.seconds,
      nanoseconds: value.nanoseconds,
      iso: new Date(value.seconds * 1000).toISOString(),
    };
  }

  // Handle Arrays
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  // Handle plain objects
  if (typeof value === 'object' && value.constructor === Object) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      result[key] = serializeValue(value[key]);
    }
    return result;
  }

  return value;
}

/**
 * Recursively deserialize backup objects back into Firestore Timestamps or original types
 */
function deserializeValue(value: any): any {
  if (value === null || value === undefined) return null;

  if (typeof value === 'object') {
    if (value._type === 'firestore_timestamp' && typeof value.seconds === 'number') {
      return new Timestamp(value.seconds, value.nanoseconds || 0);
    }

    if (Array.isArray(value)) {
      return value.map(deserializeValue).filter((v) => v !== undefined);
    }

    if (value.constructor === Object) {
      const result: Record<string, any> = {};
      for (const key of Object.keys(value)) {
        if (key === '_docId') continue; // omit internal doc ID metadata wrapper
        const val = deserializeValue(value[key]);
        if (val !== undefined) {
          result[key] = val;
        }
      }
      return result;
    }
  }

  return value;
}

/**
 * Export all database collections into a compressed .zip file and download to user's device
 */
export async function exportFullDatabaseBackupZip(
  adminName: string = 'Admin'
): Promise<{ fileName: string; totalDocs: number; zipSize: number; savedFilePath?: string | null }> {
  const zip = new JSZip();
  const collectionCounts: Record<string, number> = {};
  const rawCollectionsData: Record<string, any[]> = {};
  let totalDocs = 0;

  for (const colName of BACKUP_COLLECTIONS) {
    try {
      const colRef = collection(db, colName);
      const snap = await getDocs(colRef);
      const docsData = snap.docs.map((d) => ({
        _docId: d.id,
        ...serializeValue(d.data()),
      }));

      rawCollectionsData[colName] = docsData;
      collectionCounts[colName] = docsData.length;
      totalDocs += docsData.length;

      // Add collection JSON file to zip
      zip.file(`${colName}.json`, JSON.stringify(docsData, null, 2));
    } catch (err) {
      console.warn(`Error exporting collection ${colName}:`, err);
      rawCollectionsData[colName] = [];
      collectionCounts[colName] = 0;
      zip.file(`${colName}.json`, JSON.stringify([], null, 2));
    }
  }

  const nowISO = new Date().toISOString();
  const metadata: BackupMetadata = {
    appName: 'Print Mart Assistant',
    version: '1.0',
    exportedAt: nowISO,
    exportedBy: adminName,
    collections: collectionCounts,
    totalDocuments: totalDocs,
  };

  zip.file('metadata.json', JSON.stringify(metadata, null, 2));

  // Generate compressed ZIP file
  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  const dateStr = new Date().toISOString().slice(0, 10);
  const timeStr = new Date().toTimeString().slice(0, 8).replace(/:/g, '');
  const fileName = `printmart_backup_${dateStr}_${timeStr}.zip`;

  // Call server API to save directly into C:\PRINTMART BACKUP\<YYYY-MM-DD>\ date-wise folder on local disk
  let savedFilePath: string | null = null;
  try {
    const res = await fetch('/api/backup/auto-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminName, rawCollectionsData }),
    });
    const json = await res.json();
    if (json.success) {
      savedFilePath = json.savedFilePath;
    }
  } catch (err) {
    console.warn('Auto-save API call warning:', err);
  }

  // Trigger client browser download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 15000);

  // Update last backup date in storage
  updateLastBackupConfig(nowISO, totalDocs);

  return { fileName, totalDocs, zipSize: blob.size, savedFilePath };
}

/**
 * Parse an uploaded .zip or .json backup file for validation and preview before restoring
 */
export async function parseBackupFile(file: File): Promise<BackupPreview> {
  const preview: BackupPreview = {
    fileName: file.name,
    fileSizeFormatted: formatBytes(file.size),
    exportedAt: null,
    appName: 'Print Mart Assistant',
    totalDocuments: 0,
    collectionCounts: {},
    rawCollectionsData: {},
    isValidBackup: true,
    validationErrors: [],
  };

  try {
    const nameLower = file.name.toLowerCase();

    if (nameLower.endsWith('.zip')) {
      const zip = await JSZip.loadAsync(file);

      // Create a map of lowercased entry filenames to JSZip objects
      const zipEntriesByName: Record<string, any> = {};
      zip.forEach((relativePath, zipObject) => {
        if (!zipObject.dir) {
          const fileNameOnly = relativePath.split('/').pop()?.toLowerCase() || '';
          zipEntriesByName[fileNameOnly] = zipObject;
        }
      });

      // Read metadata if present
      const metaFile = zipEntriesByName['metadata.json'];
      if (metaFile) {
        try {
          const metaText = await metaFile.async('string');
          const meta: BackupMetadata = JSON.parse(metaText);
          preview.exportedAt = meta.exportedAt || null;
          preview.appName = meta.appName || 'Print Mart Assistant';
        } catch {
          // ignore metadata parse error
        }
      }

      // Read all collection JSON files inside zip
      for (const colName of BACKUP_COLLECTIONS) {
        const colFile = zipEntriesByName[`${colName.toLowerCase()}.json`];
        if (colFile) {
          try {
            const text = await colFile.async('string');
            const data = JSON.parse(text);
            if (Array.isArray(data)) {
              preview.rawCollectionsData[colName] = data;
              preview.collectionCounts[colName] = data.length;
              preview.totalDocuments += data.length;
            }
          } catch (err: any) {
            preview.validationErrors.push(`Failed to parse ${colName}.json inside ZIP file.`);
          }
        }
      }
    } else if (nameLower.endsWith('.json')) {
      // Direct JSON upload support (either combined object OR single collection array like attendance.json)
      const text = await file.text();
      const jsonData = JSON.parse(text);

      if (Array.isArray(jsonData)) {
        // Single collection JSON file (e.g., attendance.json, orders.json, users.json)
        const rawBaseName = file.name.split(/[\/\\]/).pop() || file.name;
        const cleanBase = rawBaseName.replace(/\.json$/i, '').replace(/\s*\(\d+\)/g, '').trim().toLowerCase();

        let matchedCol: string | undefined = BACKUP_COLLECTIONS.find(
          (c) => c.toLowerCase() === cleanBase || cleanBase.includes(c.toLowerCase())
        );

        // Fallback sample inspection if filename didn't match directly
        if (!matchedCol && jsonData.length > 0) {
          const sample = jsonData[0] || {};
          if ('infoNumber' in sample || 'customerName' in sample || 'customerPhone' in sample) matchedCol = 'orders';
          else if ('punchIn' in sample || 'punchOut' in sample || ('userId' in sample && 'date' in sample)) matchedCol = 'attendance';
          else if ('email' in sample || ('displayName' in sample && 'role' in sample)) matchedCol = 'users';
          else if ('embedding' in sample || 'photoDataUrl' in sample) matchedCol = 'face_profiles';
          else if ('latitude' in sample || 'radius' in sample || 'materials' in sample) matchedCol = 'settings';
          else if ('date' in sample && ('description' in sample || 'isHoliday' in sample)) matchedCol = 'holidays';
          else if ('taskName' in sample || 'assignedTo' in sample) matchedCol = 'tasks';
          else if ('message' in sample && 'type' in sample) matchedCol = 'notifications';
          else if ('feedback' in sample || 'rating' in sample) matchedCol = 'feedback';
          else if ('version' in sample || 'changelog' in sample) matchedCol = 'changelogs';
          else if ('fileId' in sample || 'fileName' in sample) matchedCol = 'admin_files';
        }

        if (matchedCol) {
          preview.rawCollectionsData[matchedCol] = jsonData;
          preview.collectionCounts[matchedCol] = jsonData.length;
          preview.totalDocuments += jsonData.length;
        } else {
          // If unmatched, default to orders or first collection to allow manual mapping
          preview.rawCollectionsData['orders'] = jsonData;
          preview.collectionCounts['orders'] = jsonData.length;
          preview.totalDocuments += jsonData.length;
        }
      } else if (jsonData && typeof jsonData === 'object') {
        if (jsonData.collections && typeof jsonData.collections === 'object') {
          for (const colName of BACKUP_COLLECTIONS) {
            const data = jsonData.collections[colName] || jsonData.collections[colName.toLowerCase()] || [];
            if (Array.isArray(data)) {
              preview.rawCollectionsData[colName] = data;
              preview.collectionCounts[colName] = data.length;
              preview.totalDocuments += data.length;
            }
          }
          if (jsonData.metadata) {
            preview.exportedAt = jsonData.metadata.exportedAt || null;
            preview.appName = jsonData.metadata.appName || 'Print Mart Assistant';
          }
        } else {
          for (const colName of BACKUP_COLLECTIONS) {
            const data = jsonData[colName] || jsonData[colName.toLowerCase()];
            if (Array.isArray(data)) {
              preview.rawCollectionsData[colName] = data;
              preview.collectionCounts[colName] = data.length;
              preview.totalDocuments += data.length;
            }
          }
        }
      }
    } else {
      preview.isValidBackup = false;
      preview.validationErrors.push('Unsupported file format. Please select a .zip or .json backup archive.');
      return preview;
    }

    if (preview.totalDocuments === 0) {
      preview.isValidBackup = false;
      preview.validationErrors.push('No valid data collections were found in this backup archive.');
    }
  } catch (err: any) {
    preview.isValidBackup = false;
    preview.validationErrors.push(`Failed to read backup file: ${err?.message || 'Invalid or damaged file'}`);
  }

  return preview;
}

/**
 * Execute restore of database documents from parsed backup data into Firestore
 */
export async function executeDatabaseRestore(
  rawCollectionsData: Record<string, any[]>,
  onProgress?: (currentCol: string, percent: number) => void
): Promise<{ restoredCounts: Record<string, number>; totalRestored: number; errorCount: number }> {
  const restoredCounts: Record<string, number> = {};
  let totalDocsToRestore = 0;
  let docsProcessedSoFar = 0;
  let errorCount = 0;

  for (const colName of BACKUP_COLLECTIONS) {
    const list = rawCollectionsData[colName] || [];
    totalDocsToRestore += list.length;
  }

  if (totalDocsToRestore === 0) {
    throw new Error('Backup file contains 0 documents to restore.');
  }

  for (const colName of BACKUP_COLLECTIONS) {
    const docsList = rawCollectionsData[colName];
    if (!docsList || docsList.length === 0) {
      restoredCounts[colName] = 0;
      continue;
    }

    let colRestored = 0;
    for (let index = 0; index < docsList.length; index++) {
      const rawDoc = docsList[index];
      let docId = rawDoc._docId || rawDoc.id;

      if (!docId) {
        docId = `restored_${Date.now()}_${index}`;
      }

      try {
        const cleanData = deserializeValue(rawDoc);
        if (cleanData && typeof cleanData === 'object') {
          delete cleanData._docId;
        }

        const docRef = doc(db, colName, String(docId));
        await setDoc(docRef, cleanData, { merge: true });
        colRestored++;
      } catch (docErr: any) {
        console.error(`Error restoring doc ${docId} in ${colName}:`, docErr);
        errorCount++;
      }

      docsProcessedSoFar++;

      if (onProgress) {
        const percent = Math.min(99, Math.round((docsProcessedSoFar / totalDocsToRestore) * 100));
        onProgress(colName, percent);
      }
    }
    restoredCounts[colName] = colRestored;
  }

  if (onProgress) {
    onProgress('Complete', 100);
  }

  return { restoredCounts, totalRestored: docsProcessedSoFar - errorCount, errorCount };
}

/**
 * Get current schedule configuration from LocalStorage
 */
export function getBackupScheduleConfig(): BackupScheduleConfig {
  if (typeof window === 'undefined') {
    return {
      schedule: 'weekly',
      autoDownloadOnVisit: true,
      lastBackupDate: null,
      lastBackupCount: 0,
    };
  }

  try {
    const stored = localStorage.getItem(STORAGE_SCHEDULE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // fallback
  }

  return {
    schedule: 'weekly',
    autoDownloadOnVisit: true,
    lastBackupDate: null,
    lastBackupCount: 0,
  };
}

/**
 * Save schedule configuration into LocalStorage
 */
export function saveBackupScheduleConfig(config: Partial<BackupScheduleConfig>): BackupScheduleConfig {
  const current = getBackupScheduleConfig();
  const updated: BackupScheduleConfig = { ...current, ...config };
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(STORAGE_SCHEDULE_KEY, JSON.stringify(updated));
    } catch {
      // ignore
    }
  }
  return updated;
}

/**
 * Internal helper to update last backup date/count
 */
function updateLastBackupConfig(dateISO: string, totalCount: number) {
  saveBackupScheduleConfig({
    lastBackupDate: dateISO,
    lastBackupCount: totalCount,
  });
}

/**
 * Check if automated backup is due according to schedule
 */
export function checkIsBackupDue(): {
  isDue: boolean;
  daysSinceLastBackup: number | null;
  nextDueDate: Date | null;
} {
  const config = getBackupScheduleConfig();
  if (config.schedule === 'disabled') {
    return { isDue: false, daysSinceLastBackup: null, nextDueDate: null };
  }

  if (!config.lastBackupDate) {
    return { isDue: true, daysSinceLastBackup: null, nextDueDate: new Date() };
  }

  const lastDate = new Date(config.lastBackupDate);
  const now = new Date();
  const diffMs = now.getTime() - lastDate.getTime();
  const days = diffMs / (1000 * 60 * 60 * 24);

  const targetDays = config.schedule === 'weekly' ? 7 : 30;
  const nextDueDate = new Date(lastDate.getTime() + targetDays * 24 * 60 * 60 * 1000);

  return {
    isDue: days >= targetDays,
    daysSinceLastBackup: Math.floor(days),
    nextDueDate,
  };
}
