import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import JSZip from 'jszip';
import { adminDb } from '@/lib/firebaseAdmin';

const BACKUP_COLLECTIONS = [
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
];

function serializeValue(value: any): any {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    const d: Date = value.toDate();
    return {
      _type: 'firestore_timestamp',
      seconds: value.seconds ?? Math.floor(d.getTime() / 1000),
      nanoseconds: value.nanoseconds ?? 0,
      iso: d.toISOString(),
    };
  }
  if (value instanceof Date) {
    return {
      _type: 'firestore_timestamp',
      seconds: Math.floor(value.getTime() / 1000),
      nanoseconds: 0,
      iso: value.toISOString(),
    };
  }
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
  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }
  if (typeof value === 'object' && value.constructor === Object) {
    const result: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      result[key] = serializeValue(value[key]);
    }
    return result;
  }
  return value;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { adminName = 'Admin', rawCollectionsData } = body;

    const zip = new JSZip();
    const collectionCounts: Record<string, number> = {};
    let totalDocs = 0;

    // Use provided client data or fetch from Firestore adminDb
    if (rawCollectionsData && typeof rawCollectionsData === 'object') {
      for (const colName of BACKUP_COLLECTIONS) {
        const docsList = rawCollectionsData[colName] || [];
        collectionCounts[colName] = docsList.length;
        totalDocs += docsList.length;
        zip.file(`${colName}.json`, JSON.stringify(docsList, null, 2));
      }
    } else {
      try {
        for (const colName of BACKUP_COLLECTIONS) {
          try {
            const snap = await adminDb.collection(colName).get();
            const docsData = snap.docs.map((d) => ({
              _docId: d.id,
              ...serializeValue(d.data()),
            }));
            collectionCounts[colName] = docsData.length;
            totalDocs += docsData.length;
            zip.file(`${colName}.json`, JSON.stringify(docsData, null, 2));
          } catch (err) {
            console.warn(`Server backup export warning for ${colName}:`, err);
            collectionCounts[colName] = 0;
            zip.file(`${colName}.json`, JSON.stringify([], null, 2));
          }
        }
      } catch (adminErr) {
        console.warn('Firebase Admin default credentials not loaded on server:', adminErr);
      }
    }

    const nowISO = new Date().toISOString();
    const metadata = {
      appName: 'Print Mart Assistant',
      version: '1.0',
      exportedAt: nowISO,
      exportedBy: adminName,
      collections: collectionCounts,
      totalDocuments: totalDocs,
    };
    zip.file('metadata.json', JSON.stringify(metadata, null, 2));

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const fileName = `printmart_backup_${dateStr}_${timeStr}.zip`;

    // Target folder structure: C:\PRINTMART BACKUP\<YYYY-MM-DD>\
    let targetDir = path.join('C:', 'PRINTMART BACKUP', dateStr);

    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    } catch (fsErr) {
      console.warn('Failed to write directly to C:\\PRINTMART BACKUP, falling back to home dir:', fsErr);
      targetDir = path.join(os.homedir(), 'PRINTMART BACKUP', dateStr);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    }

    const savedFilePath = path.join(targetDir, fileName);
    fs.writeFileSync(savedFilePath, zipBuffer);

    return NextResponse.json({
      success: true,
      fileName,
      savedFilePath,
      dateFolder: dateStr,
      totalDocs,
      sizeBytes: zipBuffer.length,
      exportedAt: nowISO,
    });
  } catch (error: any) {
    console.error('API auto-save backup error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to save backup to C drive' },
      { status: 500 }
    );
  }
}
