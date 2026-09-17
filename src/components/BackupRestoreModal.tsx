"use client";

import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'react-hot-toast';
import {
  exportFullDatabaseBackupZip,
  parseBackupFile,
  executeDatabaseRestore,
  getBackupScheduleConfig,
  saveBackupScheduleConfig,
  checkIsBackupDue,
  BackupPreview,
  BackupScheduleConfig,
  BACKUP_COLLECTIONS,
  formatBytes,
} from '@/lib/backupEngine';

interface BackupRestoreModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRestoreCompleted?: () => void;
  adminName?: string;
}

export default function BackupRestoreModal({
  isOpen,
  onClose,
  onRestoreCompleted,
  adminName = 'Admin',
}: BackupRestoreModalProps) {
  const [mounted, setMounted] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState<BackupScheduleConfig>({
    schedule: 'weekly',
    autoDownloadOnVisit: true,
    lastBackupDate: null,
    lastBackupCount: 0,
  });

  // Download completion popup state
  const [downloadCompleteResult, setDownloadCompleteResult] = useState<{
    fileName: string;
    totalDocs: number;
    zipSize: number;
    savedFilePath?: string | null;
  } | null>(null);

  // Restore states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState<{ col: string; percent: number }>({
    col: '',
    percent: 0,
  });
  const [restoreResult, setRestoreResult] = useState<{ totalRestored: number; errorCount?: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setScheduleConfig(getBackupScheduleConfig());
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const dueInfo = checkIsBackupDue();

  const handleDownloadBackup = async () => {
    try {
      setDownloading(true);
      const res = await exportFullDatabaseBackupZip(adminName);
      setDownloadCompleteResult(res);
      const locMsg = res.savedFilePath ? `\nSaved to C Drive: ${res.savedFilePath}` : '';
      toast.success(`✅ Backup Download Complete!\n${res.fileName} (${formatBytes(res.zipSize)}, ${res.totalDocs} items)${locMsg}`, { duration: 8000 });
      setScheduleConfig(getBackupScheduleConfig());
    } catch (err: any) {
      console.error('Backup export failed:', err);
      toast.error(`Backup failed: ${err?.message || 'Unknown error'}`);
    } finally {
      setDownloading(false);
    }
  };

  const handleScheduleChange = (schedule: BackupScheduleConfig['schedule']) => {
    const updated = saveBackupScheduleConfig({ schedule });
    setScheduleConfig(updated);
    toast.success(`Backup schedule updated to ${schedule.toUpperCase()}`);
  };

  const handleAutoVisitToggle = (enabled: boolean) => {
    const updated = saveBackupScheduleConfig({ autoDownloadOnVisit: enabled });
    setScheduleConfig(updated);
    toast.success(enabled ? 'Auto-download on visit enabled' : 'Auto-download on visit disabled');
  };

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setParsing(true);
    setRestoreResult(null);
    try {
      const p = await parseBackupFile(file);
      setPreview(p);
      if (!p.isValidBackup) {
        toast.error(p.validationErrors[0] || 'Invalid backup file');
      }
    } catch (err: any) {
      toast.error(`Failed to inspect file: ${err?.message || 'Invalid file'}`);
      setPreview(null);
    } finally {
      setParsing(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileSelect(file);
    }
  };

  const handleStartRestore = async () => {
    if (!preview || !preview.isValidBackup || preview.totalDocuments === 0) {
      toast.error('No valid documents found in backup file to restore.');
      return;
    }

    setRestoring(true);
    setRestoreProgress({ col: 'Initializing database write...', percent: 0 });

    try {
      const res = await executeDatabaseRestore(preview.rawCollectionsData, (currentCol, percent) => {
        setRestoreProgress({ col: currentCol, percent });
      });

      setRestoreResult({ totalRestored: res.totalRestored, errorCount: res.errorCount });
      if (res.errorCount > 0) {
        toast.error(`Database restore completed with ${res.errorCount} errors. ${res.totalRestored} restored.`);
      } else {
        toast.success(`Database restore complete! ${res.totalRestored} documents restored into Firestore.`);
      }
      if (onRestoreCompleted) {
        onRestoreCompleted();
      }
    } catch (err: any) {
      console.error('Restore failed:', err);
      toast.error(`Restore failed: ${err?.message || 'Database error'}`);
    } finally {
      setRestoring(false);
    }
  };

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999999,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          backgroundColor: '#0f172a',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '20px',
          maxWidth: '780px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
          color: '#ffffff',
          fontFamily: 'inherit',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: 'rgba(99, 102, 241, 0.2)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.25rem',
              }}
            >
              💾
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Data Backup & Disaster Recovery
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '9999px',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    fontWeight: 600,
                  }}
                >
                  Compressed .ZIP
                </span>
              </h2>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                Download local backups of all site data or restore database snapshots.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
              fontWeight: 'bold',
            }}
          >
            ✕
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Section 1: Manual Export */}
          <div
            style={{
              padding: '1.25rem',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.1) 100%)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              borderRadius: '14px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                📦 Manual Data Download
              </h3>
              <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.75rem', color: '#cbd5e1', maxWidth: '420px', lineHeight: 1.4 }}>
                Exports all 11 site collections (Orders, Attendance, Users, Settings, Pricing, Face IDs, etc.) into a compressed <code style={{ color: '#fde047', fontFamily: 'monospace' }}>.zip</code> archive.
              </p>
              {scheduleConfig.lastBackupDate && (
                <div style={{ fontSize: '0.7rem', color: '#a5b4fc', marginTop: '0.5rem' }}>
                  ✓ Last Backup: {new Date(scheduleConfig.lastBackupDate).toLocaleString()} ({scheduleConfig.lastBackupCount} items)
                </div>
              )}
            </div>

            <button
              onClick={handleDownloadBackup}
              disabled={downloading}
              style={{
                padding: '0.75rem 1.25rem',
                backgroundColor: '#4f46e5',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: downloading ? 'not-allowed' : 'pointer',
                boxShadow: '0 10px 15px -3px rgba(79, 70, 229, 0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              {downloading ? '🌀 Compressing...' : '📥 Download Backup (.ZIP)'}
            </button>
          </div>

          {/* Section 2: Automated Schedule Config */}
          <div
            style={{
              padding: '1.25rem',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📅 Automated Backup Schedule
                  {dueInfo.isDue ? (
                    <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: 'rgba(245, 158, 11, 0.2)', color: '#fde047', border: '1px solid rgba(245, 158, 11, 0.3)', fontWeight: 600 }}>
                      Backup Due Now!
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: 'rgba(20, 184, 166, 0.2)', color: '#5eead4', border: '1px solid rgba(20, 184, 166, 0.3)', fontWeight: 600 }}>
                      Up to Date
                    </span>
                  )}
                </h3>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                  Configure recurring automated backup downloads when admins open the dashboard.
                </p>
              </div>

              <select
                value={scheduleConfig.schedule}
                onChange={(e) => handleScheduleChange(e.target.value as any)}
                style={{
                  backgroundColor: '#1e293b',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#ffffff',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  padding: '0.4rem 0.75rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                <option value="disabled">Disabled (Manual Only)</option>
                <option value="weekly">Weekly Schedule (Every 7 Days)</option>
                <option value="monthly">Monthly Schedule (Every 30 Days)</option>
              </select>
            </div>

            {scheduleConfig.schedule !== 'disabled' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)', fontSize: '0.75rem', color: '#cbd5e1', flexWrap: 'wrap', gap: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={scheduleConfig.autoDownloadOnVisit}
                    onChange={(e) => handleAutoVisitToggle(e.target.checked)}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                  <span>Auto-download backup archive on Admin login when schedule is due</span>
                </label>

                {dueInfo.nextDueDate && (
                  <span style={{ fontSize: '0.7rem', color: '#2dd4bf', fontFamily: 'monospace' }}>
                    Next Due: {dueInfo.nextDueDate.toLocaleDateString()}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Section 3: Restore Backup (Disaster Recovery) */}
          <div
            style={{
              padding: '1.25rem',
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <div>
              <h3 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                🔄 Restore Database from Backup
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: '#94a3b8' }}>
                Upload a backup <code style={{ color: '#fde047', fontFamily: 'monospace' }}>.zip</code> archive or single <code style={{ color: '#fde047', fontFamily: 'monospace' }}>.json</code> file (e.g. <code style={{ color: '#fde047', fontFamily: 'monospace' }}>attendance.json</code>) to restore data into Firestore.
              </p>
            </div>

            {/* Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '1.5rem',
                border: isDragging ? '2px dashed #818cf8' : selectedFile ? '2px dashed #10b981' : '2px dashed rgba(255, 255, 255, 0.2)',
                backgroundColor: isDragging ? 'rgba(99, 102, 241, 0.1)' : selectedFile ? 'rgba(16, 185, 129, 0.05)' : 'rgba(255, 255, 255, 0.01)',
                borderRadius: '12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip,.json,application/zip,application/json"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                    e.target.value = '';
                  }
                }}
                style={{ display: 'none' }}
              />

              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{selectedFile ? '📄' : '📁'}</div>
              {selectedFile ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#6ee7b7' }}>{selectedFile.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.2rem' }}>{formatBytes(selectedFile.size)}</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    style={{
                      marginTop: '0.5rem',
                      fontSize: '0.7rem',
                      color: '#818cf8',
                      background: 'none',
                      border: 'none',
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    Change / Select Another File
                  </button>
                </div>
              ) : (
                <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#e2e8f0' }}>
                    Click to select or drag & drop backup file (.zip / .json)
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    Supports Print Mart backup ZIP archives & individual JSON files (e.g. attendance.json)
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    style={{
                      padding: '0.4rem 1rem',
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      color: '#ffffff',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      marginTop: '0.25rem',
                    }}
                  >
                    📁 Browse Computer...
                  </button>
                </div>
              )}
            </div>

            {/* Inspecting state */}
            {parsing && (
              <div style={{ padding: '0.75rem', backgroundColor: 'rgba(255, 255, 255, 0.05)', borderRadius: '8px', textAlign: 'center', fontSize: '0.75rem', color: '#94a3b8' }}>
                🔍 Inspecting backup file content...
              </div>
            )}

            {/* Invalid File Warning */}
            {preview && !preview.isValidBackup && !parsing && (
              <div style={{ padding: '1rem', backgroundColor: 'rgba(159, 18, 57, 0.4)', border: '1px solid rgba(244, 63, 94, 0.3)', borderRadius: '12px' }}>
                <div style={{ fontWeight: 700, color: '#fb7185', fontSize: '0.85rem' }}>⚠️ Unable to Read Backup Archive</div>
                <ul style={{ margin: '0.5rem 0 0 0', paddingLeft: '1.25rem', fontSize: '0.75rem', color: '#fecdd3' }}>
                  {preview.validationErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setPreview(null);
                    fileInputRef.current?.click();
                  }}
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.3rem 0.75rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: '0.7rem',
                    cursor: 'pointer',
                  }}
                >
                  Select Valid File
                </button>
              </div>
            )}

            {/* Valid Preview Summary & Execute Button */}
            {preview && preview.isValidBackup && !parsing && (
              <div style={{ padding: '1rem', backgroundColor: 'rgba(30, 27, 75, 0.5)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.1)', paddingBottom: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Backup Data Summary Preview
                  </div>
                  {preview.exportedAt && (
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                      Exported: {new Date(preview.exportedAt).toLocaleString()}
                    </div>
                  )}
                </div>

                {/* Grid of collections */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }}>
                  {BACKUP_COLLECTIONS.map((col) => {
                    const count = preview.collectionCounts[col] || 0;
                    if (count === 0 && preview.totalDocuments > 0) return null;
                    return (
                      <div key={col} style={{ padding: '0.5rem', backgroundColor: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '8px' }}>
                        <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'capitalize' }}>{col.replace('_', ' ')}</div>
                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ffffff' }}>{count} items</div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                    Total Snapshot Payload: <strong style={{ color: '#fde047' }}>{preview.totalDocuments} documents</strong>
                  </div>

                  {!restoring && !restoreResult && (
                    <button
                      onClick={handleStartRestore}
                      style={{
                        padding: '0.6rem 1.25rem',
                        backgroundColor: '#10b981',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '10px',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.3)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      ⚡ Execute Database Restore
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Restore Progress Bar */}
            {restoring && (
              <div style={{ padding: '1rem', backgroundColor: 'rgba(6, 78, 59, 0.5)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: '#6ee7b7' }}>
                  <span>Restoring Collection: {restoreProgress.col}</span>
                  <span>{restoreProgress.percent}%</span>
                </div>
                <div style={{ width: '100%', height: '10px', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: '9999px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'linear-gradient(90deg, #10b981 0%, #2dd4bf 100%)',
                      width: `${restoreProgress.percent}%`,
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Success Result */}
            {restoreResult && (
              <div style={{ padding: '1rem', backgroundColor: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#34d399', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    ✓ Database Restore Completed Successfully!
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.2rem' }}>
                    Successfully restored {restoreResult.totalRestored} database entries into Firestore.
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    setPreview(null);
                    setRestoreResult(null);
                    if (onRestoreCompleted) onRestoreCompleted();
                  }}
                  style={{
                    padding: '0.4rem 1rem',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#ffffff',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', backgroundColor: 'rgba(255, 255, 255, 0.03)', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1.25rem',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#ffffff',
              borderRadius: '8px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* Download Completion Pop-up Modal Overlay */}
      {downloadCompleteResult && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1000000,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              backgroundColor: '#0f172a',
              border: '2px solid #10b981',
              borderRadius: '24px',
              maxWidth: '540px',
              width: '100%',
              padding: '2.25rem',
              textAlign: 'center',
              boxShadow: '0 25px 50px -12px rgba(16, 185, 129, 0.4)',
              color: '#ffffff',
              animation: 'fadeIn 0.25s ease-out',
            }}
          >
            <div style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>🎉</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#34d399', margin: '0 0 0.5rem 0' }}>
              Backup Download Finished!
            </h2>
            <p style={{ fontSize: '0.85rem', color: '#cbd5e1', margin: '0 0 1.25rem 0', lineHeight: 1.4 }}>
              Your complete database backup archive has been compressed, downloaded, and saved into your date-wise folder.
            </p>

            <div
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '14px',
                padding: '1.25rem',
                textAlign: 'left',
                fontSize: '0.825rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                marginBottom: '1.5rem',
              }}
            >
              <div>📁 <strong>File Name:</strong> <span style={{ color: '#6ee7b7', fontFamily: 'monospace' }}>{downloadCompleteResult.fileName}</span></div>
              <div>📊 <strong>Total Items Archived:</strong> <span style={{ color: '#fde047', fontWeight: 700 }}>{downloadCompleteResult.totalDocs} documents</span></div>
              <div>📦 <strong>File Size:</strong> <span style={{ color: '#cbd5e1' }}>{formatBytes(downloadCompleteResult.zipSize)}</span></div>
              {downloadCompleteResult.savedFilePath && (
                <div style={{ wordBreak: 'break-all', paddingTop: '0.5rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  🖥️ <strong>Local C Drive Path:</strong><br />
                  <span style={{ color: '#a5b4fc', fontFamily: 'monospace', fontSize: '0.75rem' }}>{downloadCompleteResult.savedFilePath}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setDownloadCompleteResult(null)}
              style={{
                width: '100%',
                padding: '0.85rem',
                backgroundColor: '#10b981',
                color: '#ffffff',
                border: 'none',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '0.95rem',
                cursor: 'pointer',
                boxShadow: '0 10px 15px -3px rgba(16, 185, 129, 0.4)',
                letterSpacing: '0.02em',
              }}
            >
              ✓ Great, Got It!
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
}
