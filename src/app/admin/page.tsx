"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { approveUser, getAllAttendance, AttendanceRecord, getTodayDateString, markHoliday, getAllUsers, updateUserProfile, HolidayRecord, getHolidayRecords, deleteHoliday, getOfficeSettings, updateOfficeSettings, OfficeSettings, getBreakTimeMs, AdminFileRecord, getAdminFiles, createAdminFileRecord, saveAdminFileChunk, getAdminFileChunks, deleteAdminFile } from '@/lib/db';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';
import Pagination from '@/components/Pagination';

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // returns distance in meters
};

export default function AdminDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [pendingUsers, setPendingUsers] = useState<AppUser[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());

  const [holidayDate, setHolidayDate] = useState('');
  const [holidayDesc, setHolidayDesc] = useState('');

  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [holidayRecords, setHolidayRecords] = useState<HolidayRecord[]>([]);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null);
  const [editingHolidayDate, setEditingHolidayDate] = useState<string | null>(null);
  const [editHolidayDescValue, setEditHolidayDescValue] = useState('');

  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [editDesignationValue, setEditDesignationValue] = useState('');
  const [editWorkModeValue, setEditWorkModeValue] = useState<'office' | 'remote'>('office');

  // Office Location configuration state
  const [officeLat, setOfficeLat] = useState('12.9716');
  const [officeLng, setOfficeLng] = useState('77.5946');
  const [officeRadius, setOfficeRadius] = useState('200');
  const [officeSettings, setOfficeSettings] = useState<OfficeSettings | null>(null);
  const [savingOffice, setSavingOffice] = useState(false);
  const [fetchingAdminLocation, setFetchingAdminLocation] = useState(false);

  // Pagination States
  const [pendingUsersPage, setPendingUsersPage] = useState(1);
  const [attendancesPage, setAttendancesPage] = useState(1);
  const [allUsersPage, setAllUsersPage] = useState(1);

  // File sharing & upload states
  const [files, setFiles] = useState<AdminFileRecord[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadingFileName, setUploadingFileName] = useState<string | null>(null);
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<AdminFileRecord | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const loadData = async () => {
    try {
      const today = getTodayDateString();
      const [usersList, atts, holidays, officeData, filesList] = await Promise.all([
        getAllUsers(),
        getAllAttendance(today),
        getHolidayRecords(),
        getOfficeSettings(),
        getAdminFiles()
      ]);

      setAllUsers(usersList);
      setPendingUsers(usersList.filter(u => u.role === 'pending'));
      setAttendances(atts);
      setHolidayRecords(holidays);
      setOfficeSettings(officeData);
      setOfficeLat(officeData.latitude.toString());
      setOfficeLng(officeData.longitude.toString());
      setOfficeRadius(officeData.radius.toString());
      setFiles(filesList);
    } catch (error) {
      console.error("Error loading admin data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = listenToAuthChanges((firebaseUser, appUser) => {
      if (!appUser) {
        router.push('/');
      } else if (appUser.role !== 'admin') {
        router.push('/dashboard');
      } else {
        setCurrentUser(appUser);
        loadData();
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!currentUser) return;

    // Silent background refresh every 1 minute
    const interval = setInterval(() => {
      loadData();
    }, 60000);

    return () => clearInterval(interval);
  }, [currentUser]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (showHolidayModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [showHolidayModal]);

  const handleApprove = async (userId: string) => {
    try {
      await approveUser(userId);
      await loadData(); // Reload to update both lists
      toast.success("User approved successfully!");
    } catch (error) {
      console.error("Error approving user", error);
      toast.error("Failed to approve user.");
    }
  };

  const handleUpdateProfile = async (userId: string) => {
    if (!editNameValue.trim()) return;
    try {
      await updateUserProfile(userId, {
        displayName: editNameValue.trim(),
        designation: editDesignationValue.trim(),
        workMode: editWorkModeValue
      });
      setEditingUserId(null);
      await loadData(); // Reload to update UI
      toast.success("Profile updated successfully!");
    } catch {
      toast.error("Failed to update profile.");
    }
  };

  const handleSaveOfficeSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingOffice(true);
    try {
      const lat = parseFloat(officeLat);
      const lng = parseFloat(officeLng);
      const rad = parseFloat(officeRadius);
      if (isNaN(lat) || isNaN(lng) || isNaN(rad)) {
        toast.error("Please enter valid coordinates and radius.");
        setSavingOffice(false);
        return;
      }
      await updateOfficeSettings({ latitude: lat, longitude: lng, radius: rad });
      setOfficeSettings({ latitude: lat, longitude: lng, radius: rad });
      toast.success("Office settings updated successfully!");
    } catch {
      toast.error("Failed to update office settings.");
    } finally {
      setSavingOffice(false);
    }
  };

  const handleFetchAdminLocation = () => {
    setFetchingAdminLocation(true);
    if (typeof window === 'undefined' || !navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      setFetchingAdminLocation(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOfficeLat(pos.coords.latitude.toString());
        setOfficeLng(pos.coords.longitude.toString());
        toast.success("Coordinates updated to your current position!");
        setFetchingAdminLocation(false);
      },
      (err) => {
        console.error("GPS Error:", err);
        toast.error("Failed to fetch location. Please check browser permissions.");
        setFetchingAdminLocation(false);
      },
      { enableHighAccuracy: true }
    );
  };

  const handleMarkHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayDate) return;
    try {
      await markHoliday(holidayDate, holidayDesc || 'Company Holiday');
      setHolidayDate('');
      setHolidayDesc('');
      await loadData();
      toast.success("Holiday marked successfully!");
    } catch {
      toast.error("Failed to mark holiday.");
    }
  };

  const handleSaveHoliday = async (date: string) => {
    try {
      await markHoliday(date, editHolidayDescValue || 'Company Holiday');
      setEditingHolidayDate(null);
      setEditHolidayDescValue('');
      await loadData();
      toast.success("Holiday description updated!");
    } catch {
      toast.error("Failed to update holiday.");
    }
  };

  const handleDeleteHoliday = async (date: string) => {
    if (!confirm("Are you sure you want to delete this holiday?")) return;
    try {
      await deleteHoliday(date);
      if (selectedCalendarDate === date) {
        setSelectedCalendarDate(null);
      }
      await loadData();
      toast.success("Holiday deleted successfully!");
    } catch {
      toast.error("Failed to delete holiday.");
    }
  };

  const renderHolidayCalendarModal = () => {
    // Generate dates for current month view
    const year = currentCalendarMonth.getFullYear();
    const month = currentCalendarMonth.getMonth(); // 0-indexed

    // First day of month
    const firstDay = new Date(year, month, 1);
    // Number of days in month
    const totalDays = new Date(year, month + 1, 0).getDate();
    // Day of the week of first day (0-6, Sunday is 0)
    const startDayOfWeek = firstDay.getDay();

    // Previous month total days to fill starting blank spaces
    const prevMonthTotalDays = new Date(year, month, 0).getDate();

    const calendarCells: { dateStr: string; dayNum: number; isCurrentMonth: boolean; isSunday: boolean }[] = [];

    // Fill previous month trailing days
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const dayNum = prevMonthTotalDays - i;
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      const mStr = String(prevMonth + 1).padStart(2, '0');
      const dStr = String(dayNum).padStart(2, '0');
      calendarCells.push({
        dateStr: `${prevYear}-${mStr}-${dStr}`,
        dayNum,
        isCurrentMonth: false,
        isSunday: false
      });
    }

    // Fill current month days
    for (let i = 1; i <= totalDays; i++) {
      const mStr = String(month + 1).padStart(2, '0');
      const dStr = String(i).padStart(2, '0');
      const dateStr = `${year}-${mStr}-${dStr}`;
      const dayOfWeek = new Date(year, month, i).getDay();
      calendarCells.push({
        dateStr,
        dayNum: i,
        isCurrentMonth: true,
        isSunday: dayOfWeek === 0
      });
    }

    // Fill next month leading days to complete grid (multiples of 7, say 42 cells)
    const remainingCells = 42 - calendarCells.length;
    for (let i = 1; i <= remainingCells; i++) {
      const nextMonth = month === 11 ? 0 : month + 1;
      const nextYear = month === 11 ? year + 1 : year;
      const mStr = String(nextMonth + 1).padStart(2, '0');
      const dStr = String(i).padStart(2, '0');
      calendarCells.push({
        dateStr: `${nextYear}-${mStr}-${dStr}`,
        dayNum: i,
        isCurrentMonth: false,
        isSunday: false
      });
    }

    const prevMonthAction = () => {
      setCurrentCalendarMonth(new Date(year, month - 1, 1));
    };

    const nextMonthAction = () => {
      setCurrentCalendarMonth(new Date(year, month + 1, 1));
    };

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    // Find if selected date is a holiday
    const selectedHoliday = holidayRecords.find(h => h.date === selectedCalendarDate);

    return (
      <div className="modal-backdrop" onClick={() => setShowHolidayModal(false)}>
        <div className="glass-card modal-content-wrapper text-left animate-fade-in" onClick={(e) => e.stopPropagation()}>
          <div className="modal-accent-bar" />

          <button className="close-modal-btn" onClick={() => setShowHolidayModal(false)} title="Close Modal">
            ✕
          </button>

          {/* Left Side: Calendar Grid */}
          <div className="modal-calendar-section">
            <div className="calendar-header-wrapper">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                📅 Holiday Calendar
              </h2>
              <div className="flex items-center gap-2">
                <button onClick={prevMonthAction} className="calendar-nav-btn" title="Previous Month">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                </button>
                <span className="text-sm font-semibold text-white px-2 min-w-[120px] text-center">
                  {monthNames[month]} {year}
                </span>
                <button onClick={nextMonthAction} className="calendar-nav-btn" title="Next Month">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="calendar-grid-header">
              <div>Sun</div>
              <div>Mon</div>
              <div>Tue</div>
              <div>Wed</div>
              <div>Thu</div>
              <div>Fri</div>
              <div>Sat</div>
            </div>

            <div className="calendar-days-grid">
              {calendarCells.map((cell, idx) => {
                const isHoliday = holidayRecords.some(h => h.date === cell.dateStr);
                const isSelected = selectedCalendarDate === cell.dateStr;
                return (
                  <div
                    key={idx}
                    onClick={() => {
                      if (cell.isCurrentMonth) {
                        setSelectedCalendarDate(cell.dateStr);
                        setEditingHolidayDate(null);
                      }
                    }}
                    className={`calendar-day-cell ${!cell.isCurrentMonth ? 'other-month' : ''} ${cell.isSunday ? 'is-sunday' : ''} ${isHoliday ? 'is-holiday' : ''} ${isSelected ? 'is-selected' : ''}`}
                  >
                    <span className="day-number-label">{cell.dayNum}</span>
                    {isHoliday && <span className="holiday-dot-indicator self-end" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Side: Selected Date Editor */}
          <div className="modal-editor-section">
            <h3 className="text-lg font-bold text-white mb-4">
              Manage Day Details
            </h3>

            {selectedCalendarDate ? (
              <div className="flex flex-col gap-4">
                <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-xs text-secondary uppercase font-bold">Selected Date</div>
                  <div className="text-base font-semibold text-gradient mt-0.5">
                    {new Date(selectedCalendarDate).toLocaleDateString('en-US', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    })}
                  </div>
                </div>

                {selectedHoliday ? (
                  <div className="flex flex-col gap-3">
                    {editingHolidayDate === selectedCalendarDate ? (
                      <div className="editor-card-container flex flex-col gap-3">
                        <div>
                          <label className="text-xs text-secondary mb-1 block">Edit Description</label>
                          <input
                            type="text"
                            className="editor-input"
                            value={editHolidayDescValue}
                            onChange={(e) => setEditHolidayDescValue(e.target.value)}
                            placeholder="e.g. Diwali Festival"
                            autoFocus
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => {
                              setEditingHolidayDate(null);
                              setEditHolidayDescValue('');
                            }}
                            className="editor-btn-outline !text-xs !py-1.5 !px-3"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSaveHoliday(selectedCalendarDate)}
                            className="editor-btn-primary !text-xs !py-1.5 !px-4"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="editor-card-container flex flex-col gap-4">
                        <div>
                          <div className="text-xs text-purple-300 font-semibold uppercase">Status</div>
                          <div className="text-sm text-purple-400 font-bold mt-0.5 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse" />
                            Registered Holiday
                          </div>
                        </div>

                        <div>
                          <div className="text-xs text-secondary font-semibold uppercase">Description</div>
                          <p className="text-sm text-white font-medium mt-1 bg-white/5 p-2.5 rounded-lg border border-white/5">
                            {selectedHoliday.description}
                          </p>
                        </div>

                        <div className="flex gap-2 justify-end mt-2">
                          <button
                            onClick={() => handleDeleteHoliday(selectedCalendarDate)}
                            className="editor-btn-danger !text-xs !py-1.5 !px-3"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => {
                              setEditingHolidayDate(selectedCalendarDate);
                              setEditHolidayDescValue(selectedHoliday.description);
                            }}
                            className="editor-btn-outline !text-xs !py-1.5 !px-3"
                          >
                            Edit
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="editor-card-container flex flex-col gap-3">
                    <div className="text-xs text-secondary font-semibold uppercase mb-1">Status</div>
                    <div className="text-sm text-secondary italic mb-2">No holiday registered for this date.</div>

                    <div className="flex flex-col gap-3">
                      <div>
                        <label className="text-xs text-secondary mb-1 block">Holiday Name / Description</label>
                        <input
                          type="text"
                          className="editor-input"
                          placeholder="e.g. Guru Nanak Jayanti"
                          value={holidayDesc}
                          onChange={(e) => setHolidayDesc(e.target.value)}
                        />
                      </div>
                      <button
                        onClick={async () => {
                          try {
                            await markHoliday(selectedCalendarDate, holidayDesc || 'Company Holiday');
                            setHolidayDesc('');
                            await loadData();
                            toast.success("Holiday marked successfully!");
                          } catch {
                            toast.error("Failed to mark holiday.");
                          }
                        }}
                        className="editor-btn-primary w-full text-center mt-1"
                      >
                        Mark as Holiday
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 bg-white/5 rounded-xl border border-white/10 text-center text-secondary text-sm">
                Select a date from the calendar to edit details or register a holiday.
              </div>
            )}
          </div>

        </div>
      </div>
    );
  };

  const handleFileUpload = async (file: File) => {
    if (!currentUser) return;

    // Validate size (60 MB)
    const MAX_SIZE_BYTES = 60 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      toast.error(`File is too large. Max size is 60 MB. (Selected: ${(file.size / (1024 * 1024)).toFixed(1)} MB)`);
      return;
    }

    // Validate type (PDF, CDR, Image formats)
    const allowedExts = ['pdf', 'cdr', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'];
    const allowedMimes = ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/svg+xml', 'image/webp'];
    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';

    const isValidType = allowedMimes.includes(file.type) || allowedExts.includes(fileExt);

    if (!isValidType) {
      toast.error("Unsupported file format. Please upload PDF, CDR, or an image file.");
      return;
    }

    // Slice file into 900KB chunks
    const CHUNK_SIZE = 900 * 1024; // 900 KB
    const chunkCount = Math.ceil(file.size / CHUNK_SIZE);
    
    setUploadingFileName(file.name);
    setUploadProgress(0);

    try {
      // 1. Create parent record in Firestore
      const fileId = await createAdminFileRecord(
        file.name,
        file.size,
        file.type || fileExt,
        currentUser.displayName || currentUser.email || 'Admin',
        chunkCount
      );

      // Helper function to read a file slice as ArrayBuffer
      const readChunk = (start: number, end: number): Promise<ArrayBuffer> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result instanceof ArrayBuffer) {
              resolve(e.target.result);
            } else {
              reject(new Error("Failed to read chunk buffer."));
            }
          };
          reader.onerror = (err) => reject(err);
          reader.readAsArrayBuffer(file.slice(start, end));
        });
      };

      // 2. Upload chunks sequentially to track progress accurately
      for (let i = 0; i < chunkCount; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        
        const arrayBuffer = await readChunk(start, end);
        const chunkData = new Uint8Array(arrayBuffer);
        
        await saveAdminFileChunk(fileId, i, chunkData);

        // Update progress
        const progress = Math.round(((i + 1) / chunkCount) * 100);
        setUploadProgress(progress);
      }

      toast.success("File uploaded successfully!");
      setUploadProgress(null);
      setUploadingFileName(null);
      
      // Refresh list
      const updatedFiles = await getAdminFiles();
      setFiles(updatedFiles);
    } catch (error: any) {
      console.error("Error during chunk upload:", error);
      toast.error(`Upload failed: ${error.message}`);
      setUploadProgress(null);
      setUploadingFileName(null);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleDownloadClick = async (fileRecord: AdminFileRecord) => {
    const toastId = toast.loading("Downloading and preparing file...");
    try {
      // 1. Fetch combined file bytes
      const fileBytes = await getAdminFileChunks(fileRecord.id);
      
      // 2. Create Blob and trigger download
      const fileBlob = new Blob([fileBytes.buffer as ArrayBuffer], { type: fileRecord.fileType });
      const downloadUrl = URL.createObjectURL(fileBlob);
      
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = fileRecord.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);

      toast.success("Download completed!", { id: toastId });

      // 3. Open the deletion dialog
      setConfirmDeleteFile(fileRecord);
    } catch (error: any) {
      console.error("Download error:", error);
      toast.error(`Download failed: ${error.message}`, { id: toastId });
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteFile) return;
    const toastId = toast.loading("Deleting file...");
    try {
      await deleteAdminFile(confirmDeleteFile.id);
      toast.success("File deleted successfully!", { id: toastId });
      setConfirmDeleteFile(null);
      
      // Refresh list
      const updatedFiles = await getAdminFiles();
      setFiles(updatedFiles);
    } catch (error) {
      console.error("Error deleting file:", error);
      toast.error("Failed to delete file.", { id: toastId });
    }
  };

  const handleDirectDelete = async (fileRecord: AdminFileRecord) => {
    if (!confirm(`Are you sure you want to permanently delete "${fileRecord.fileName}"?`)) return;
    const toastId = toast.loading("Deleting file...");
    try {
      await deleteAdminFile(fileRecord.id);
      toast.success("File deleted successfully!", { id: toastId });
      
      // Refresh list
      const updatedFiles = await getAdminFiles();
      setFiles(updatedFiles);
    } catch (error) {
      console.error("Error deleting file:", error);
      toast.error("Failed to delete file.", { id: toastId });
    }
  };

  const renderConfirmDeleteModal = () => {
    if (!confirmDeleteFile) return null;
    return (
      <div className="modal-backdrop" onClick={() => setConfirmDeleteFile(null)}>
        <div className="glass-card modal-content-wrapper text-center max-w-md animate-fade-in" onClick={(e) => e.stopPropagation()}>
          <div className="modal-accent-bar !bg-danger" />
          
          <button className="close-modal-btn" onClick={() => setConfirmDeleteFile(null)} title="Close Modal">
            ✕
          </button>

          <h3 className="text-xl font-bold text-white mb-4 flex items-center justify-center gap-2">
            ⚠️ Confirm File Deletion
          </h3>
          
          <div className="p-4 bg-white/5 border border-white/10 rounded-xl text-left mb-6">
            <div className="text-[10px] text-secondary uppercase font-bold mb-1">Downloaded File</div>
            <div className="text-sm font-semibold text-gradient truncate mb-1" title={confirmDeleteFile.fileName}>
              {confirmDeleteFile.fileName}
            </div>
            <div className="text-xs text-secondary">
              Size: {confirmDeleteFile.fileSize >= 1024 * 1024 
                ? `${(confirmDeleteFile.fileSize / (1024 * 1024)).toFixed(1)} MB` 
                : `${(confirmDeleteFile.fileSize / 1024).toFixed(1)} KB`}
            </div>
          </div>
          
          <p className="text-sm text-secondary mb-6 leading-relaxed">
            Your download has been triggered in a new window/tab.
            <br />
            <span className="text-white font-medium">Have you successfully downloaded this file?</span>
            <br />
            Confirming deletion will permanently erase this file from storage.
          </p>
          
          <div className="flex flex-col gap-2.5">
            <button
              onClick={handleConfirmDelete}
              className="confirm-delete-modal-btn"
            >
              Yes, Delete Permanently
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteFile(null)}
                className="btn btn-outline flex-grow"
              >
                No, Keep on Server
              </button>
              <button
                onClick={() => setConfirmDeleteFile(null)}
                className="btn btn-outline flex-grow"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!currentUser || loading) return <PrinterLoader text="Loading Admin Panel..." fullscreen type="tshirt" />;

  const ITEMS_PER_PAGE = 10;

  // Active page bounding
  const totalPendingPages = Math.ceil(pendingUsers.length / ITEMS_PER_PAGE);
  const activePendingPage = Math.min(pendingUsersPage, Math.max(1, totalPendingPages));
  const startIndexPending = (activePendingPage - 1) * ITEMS_PER_PAGE;
  const paginatedPendingUsers = pendingUsers.slice(startIndexPending, startIndexPending + ITEMS_PER_PAGE);

  const totalAttendancesPages = Math.ceil(attendances.length / ITEMS_PER_PAGE);
  const activeAttendancesPage = Math.min(attendancesPage, Math.max(1, totalAttendancesPages));
  const startIndexAtt = (activeAttendancesPage - 1) * ITEMS_PER_PAGE;
  const paginatedAttendances = attendances.slice(startIndexAtt, startIndexAtt + ITEMS_PER_PAGE);

  const teamUsers = allUsers.filter(u => u.role !== 'pending');
  const totalTeamPages = Math.ceil(teamUsers.length / ITEMS_PER_PAGE);
  const activeTeamPage = Math.min(allUsersPage, Math.max(1, totalTeamPages));
  const startIndexTeam = (activeTeamPage - 1) * ITEMS_PER_PAGE;
  const paginatedTeamUsers = teamUsers.slice(startIndexTeam, startIndexTeam + ITEMS_PER_PAGE);

  return (
    <>
      <Navbar user={currentUser} />
      <main className="container animate-fade-in">
        <h1 className="title !text-4xl mb-8">Admin Console</h1>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="w-full lg:w-64 flex-shrink-0 flex flex-col gap-3">
            <a href="/admin" className="sidebar-link active">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" />
                <rect x="14" y="3" width="7" height="5" />
                <rect x="14" y="12" width="7" height="9" />
                <rect x="3" y="16" width="7" height="5" />
              </svg>
              Dashboard Overview
            </a>
            <a href="/admin/hours" className="sidebar-link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Employee Work Hours
            </a>
          </aside>

          {/* Main Content Pane */}
          <div className="flex-1 min-w-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Pending Users Column */}
              <div className="glass-card">
                <h2 className="subtitle !text-xl !text-white !mb-4 flex justify-between items-center">
                  Pending Approvals
                  <span className="badge badge-pending">{pendingUsers.length}</span>
                </h2>

                {pendingUsers.length === 0 ? (
                  <p className="text-secondary text-sm">No pending users found.</p>
                ) : (
                  <>
                    <div className="flex flex-col gap-4 mb-2">
                      {paginatedPendingUsers.map(u => (
                        <div key={u.uid} className="flex justify-between items-center p-4 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl">
                          <div>
                            <div className="font-semibold">{u.displayName}</div>
                            <div className="text-sm text-secondary">{u.email}</div>
                          </div>
                          <button onClick={() => handleApprove(u.uid)} className="btn btn-success" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem' }}>
                            Approve
                          </button>
                        </div>
                      ))}
                    </div>
                    <Pagination
                      totalItems={pendingUsers.length}
                      itemsPerPage={ITEMS_PER_PAGE}
                      currentPage={activePendingPage}
                      onPageChange={setPendingUsersPage}
                      label="pending users"
                    />
                  </>
                )}
              </div>

              {/* Today's Attendance Column */}
              <div className="glass-card">
                <h2 className="subtitle !text-xl !text-white !mb-4 flex justify-between items-center">
                  {"Today's Attendance"}
                  <span className="badge badge-admin">{attendances.length} Records</span>
                </h2>

                {attendances.length === 0 ? (
                  <p className="text-secondary text-sm">No attendance records for today.</p>
                ) : (
                  <>
                    <div className="flex flex-col gap-4 mb-2">
                      {paginatedAttendances.map((a, i) => (
                        <div key={i} className="p-4 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl">
                          <div className="flex justify-between mb-2">
                            <div>
                              <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                                <span>{allUsers.find(u => u.uid === a.userId)?.displayName || 'Unknown Worker'}</span>
                                <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${a.workMode === 'remote'
                                  ? 'text-pink-400 bg-pink-500/10 border border-pink-500/20'
                                  : 'text-teal-400 bg-teal-500/10 border border-teal-500/20'
                                  }`}>
                                  {a.workMode || 'office'}
                                </span>
                              </div>
                              {allUsers.find(u => u.uid === a.userId)?.designation && (
                                <div className="text-[10px] text-teal-400 capitalize">
                                  {allUsers.find(u => u.uid === a.userId)?.designation}
                                </div>
                              )}
                            </div>
                            <span className={`badge ${a.status === 'present' ? 'badge-worker' :
                              a.status === 'half-day' ? 'badge-half-day' :
                                a.status === 'leave' ? 'badge-leave' :
                                  'badge-pending'
                              }`}>
                              {a.status}
                            </span>
                          </div>
                          {a.punchIn && (
                            <div className="text-xs text-secondary grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/5">
                              <div>In: {a.punchIn ? new Date(a.punchIn.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}</div>
                              <div>Out: {a.punchOut ? new Date(a.punchOut.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Working'}</div>
                              {a.punchInLocation && officeSettings && (
                                <div className="col-span-2 text-[10px] text-indigo-300 bg-indigo-500/5 border border-indigo-500/10 rounded-lg p-1.5 mt-1 flex items-center gap-1.5">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="flex-shrink-0">
                                    <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z" />
                                    <circle cx="12" cy="10" r="3" />
                                  </svg>
                                  <span>
                                    Verified GPS:{' '}
                                    <a
                                      href={`https://www.google.com/maps/search/?api=1&query=${a.punchInLocation.latitude},${a.punchInLocation.longitude}`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="underline font-semibold hover:text-white text-indigo-400"
                                      title="View coordinates on Google Maps"
                                    >
                                      {(() => {
                                        const dist = calculateDistance(
                                          a.punchInLocation.latitude,
                                          a.punchInLocation.longitude,
                                          officeSettings.latitude,
                                          officeSettings.longitude
                                        );
                                        return dist >= 1000
                                          ? `${(dist / 1000).toFixed(2)} km`
                                          : `${Math.round(dist)}m`;
                                      })()}{' '}
                                      from office
                                    </a>
                                  </span>
                                </div>
                              )}
                              {(() => {
                                const isWorking = !a.punchOut;
                                const stats = a.punchOut ? {
                                  totalHours: a.totalHours,
                                  overtimeHours: a.overtimeHours
                                } : (() => {
                                  if (!a.punchIn || a.date !== getTodayDateString()) return { totalHours: 0, overtimeHours: 0 };
                                  const inTime = typeof a.punchIn.toDate === 'function' ? a.punchIn.toDate().getTime() : new Date(a.punchIn as unknown as string).getTime();
                                  const breakMs = getBreakTimeMs(a.breaks, now.getTime());
                                  const diffHrs = Math.max(0, (now.getTime() - inTime - breakMs) / (1000 * 60 * 60));
                                  return {
                                    totalHours: diffHrs,
                                    overtimeHours: diffHrs > 9 ? diffHrs - 9 : 0
                                  };
                                })();
                                const totalHrs = Math.floor(stats.totalHours);
                                const totalMins = Math.round((stats.totalHours - totalHrs) * 60);

                                const otHrs = Math.floor(stats.overtimeHours);
                                const otMins = Math.round((stats.overtimeHours - otHrs) * 60);

                                const isOnBreak = !!(a.breaks && a.breaks.some(b => b.end === null));

                                return (
                                  <>
                                    <div className={stats.overtimeHours > 0 ? 'text-danger font-semibold' : ''}>
                                      Total: {totalHrs}h {totalMins}m <span className="text-[10px] opacity-75">({stats.totalHours.toFixed(2)} hrs)</span> {isWorking && (
                                        isOnBreak ? (
                                          <span className="text-[9px] uppercase tracking-wider bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 animate-pulse ml-1 text-amber-400 font-bold">On Break</span>
                                        ) : (
                                          <span className="text-[9px] uppercase tracking-wider bg-teal-500/10 px-1.5 py-0.5 rounded border border-teal-500/20 animate-pulse ml-1 text-teal-400 font-bold">Live</span>
                                        )
                                      )}
                                    </div>
                                    <div className={stats.overtimeHours > 0 ? 'text-danger font-semibold flex items-center gap-1.5 flex-wrap' : ''}>
                                      <span>Overtime: {otHrs}h {otMins}m <span className="text-[10px] opacity-75">({stats.overtimeHours.toFixed(2)} hrs)</span></span>
                                      {stats.overtimeHours > 0 && (
                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/10 border border-danger/25 text-pink-400 font-bold">
                                          ₹{Math.round(stats.overtimeHours * 100)}
                                        </span>
                                      )}
                                    </div>
                                  </>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <Pagination
                      totalItems={attendances.length}
                      itemsPerPage={ITEMS_PER_PAGE}
                      currentPage={activeAttendancesPage}
                      onPageChange={setAttendancesPage}
                      label="attendance records"
                    />
                  </>
                )}
              </div>
            </div>

            {/* Team Management */}
            <div className="glass-card mt-8">
              <h2 className="subtitle !text-xl !text-white !mb-4">Manage Team</h2>
              <>
                <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-2 mb-2">
                  {paginatedTeamUsers.map(user => (
                    <div key={user.uid} className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl gap-4">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-sm flex-shrink-0 border border-indigo-500/20">
                          {user.displayName?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        {editingUserId === user.uid ? (
                          <div className="flex flex-col sm:flex-row gap-3 flex-1">
                            <div className="flex-1">
                              <label className="text-[10px] text-secondary font-semibold uppercase block mb-1">Name</label>
                              <input
                                className="input-field !p-1.5 !text-xs w-full"
                                value={editNameValue}
                                onChange={(e) => setEditNameValue(e.target.value)}
                                placeholder="Name"
                                autoFocus
                                required
                              />
                            </div>
                            <div className="flex-1">
                              <label className="text-[10px] text-secondary font-semibold uppercase block mb-1">Designation</label>
                              <input
                                className="input-field !p-1.5 !text-xs w-full"
                                value={editDesignationValue}
                                onChange={(e) => setEditDesignationValue(e.target.value)}
                                placeholder="Designation (e.g. Designer)"
                              />
                            </div>
                            <div className="w-28">
                              <label className="text-[10px] text-secondary font-semibold uppercase block mb-1">Work Mode</label>
                              <select
                                className="input-field !p-1.5 !text-xs w-full"
                                value={editWorkModeValue}
                                onChange={(e) => setEditWorkModeValue(e.target.value as 'office' | 'remote')}
                              >
                                <option value="office">Office</option>
                                <option value="remote">Remote</option>
                              </select>
                            </div>
                          </div>
                        ) : (
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-sm truncate flex items-center gap-2 flex-wrap">
                              <span>{user.displayName}</span>
                              {user.designation ? (
                                <span className="text-[10px] font-semibold text-teal-300 bg-teal-500/10 border border-teal-500/25 px-2 py-0.5 rounded-full capitalize">
                                  {user.designation}
                                </span>
                              ) : (
                                <span className="text-[10px] font-semibold text-secondary bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
                                  No Designation
                                </span>
                              )}
                              <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${user.workMode === 'remote'
                                ? 'text-pink-400 bg-pink-500/10 border-pink-500/25'
                                : 'text-teal-400 bg-teal-500/10 border-teal-500/25'
                                }`}>
                                {user.workMode || 'office'}
                              </span>
                            </div>
                            <div className="text-xs text-secondary truncate">{user.email}</div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-4 justify-between sm:justify-end flex-shrink-0">
                        <span className={`badge ${user.role === 'admin' ? 'badge-admin' : 'badge-worker'}`}>
                          {user.role}
                        </span>

                        <div>
                          {editingUserId === user.uid ? (
                            <div className="flex gap-2">
                              <button onClick={() => setEditingUserId(null)} className="team-btn-cancel">Cancel</button>
                              <button onClick={() => handleUpdateProfile(user.uid)} className="team-btn-save">Save</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingUserId(user.uid);
                                setEditNameValue(user.displayName);
                                setEditDesignationValue(user.designation || '');
                                setEditWorkModeValue(user.workMode || 'office');
                              }}
                              className="team-edit-btn"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                              </svg>
                              Edit
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <Pagination
                  totalItems={teamUsers.length}
                  itemsPerPage={ITEMS_PER_PAGE}
                  currentPage={activeTeamPage}
                  onPageChange={setAllUsersPage}
                  label="team members"
                />
              </>
            </div>

            {/* Office Location Settings */}
            <div className="glass-card mt-8">
              <h2 className="subtitle !text-xl !text-white !mb-4 flex items-center gap-2">
                🏢 Office Location Settings
              </h2>
              <form onSubmit={handleSaveOfficeSettings} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="input-group !mb-0">
                  <label className="input-label">Latitude</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. 12.9716"
                    value={officeLat}
                    onChange={(e) => setOfficeLat(e.target.value)}
                    required
                  />
                </div>
                <div className="input-group !mb-0">
                  <label className="input-label">Longitude</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. 77.5946"
                    value={officeLng}
                    onChange={(e) => setOfficeLng(e.target.value)}
                    required
                  />
                </div>
                <div className="input-group !mb-0">
                  <label className="input-label">Radius (meters)</label>
                  <input
                    type="number"
                    className="input-field"
                    placeholder="e.g. 200"
                    value={officeRadius}
                    onChange={(e) => setOfficeRadius(e.target.value)}
                    required
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleFetchAdminLocation}
                    disabled={fetchingAdminLocation}
                    className="btn btn-outline flex-grow h-[46px] text-xs !px-3"
                    title="Detect current coordinates via GPS"
                  >
                    {fetchingAdminLocation ? 'GPS...' : 'Detect'}
                  </button>
                  <button
                    type="submit"
                    disabled={savingOffice}
                    className="btn btn-primary flex-grow h-[46px] text-xs !px-4"
                  >
                    {savingOffice ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </form>
              <p className="text-xs text-secondary mt-4">
                Configure the geographical center coordinates and validation radius of your workspace. Employees with an **Office** shift mode will only be allowed to punch in when within this proximity.
              </p>
            </div>

            {/* File Sharing & Storage */}
            <div className="glass-card mt-8">
              <h2 className="subtitle !text-xl !text-white !mb-6 flex items-center gap-2">
                📁 File Storage & Shared Designs
              </h2>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Upload Zone (1 Col) */}
                <div className="lg:col-span-1 flex flex-col gap-4">
                  <h3 className="text-xs font-bold text-secondary uppercase tracking-wider">Upload Design File</h3>
                  <input
                    id="admin-file-input"
                    type="file"
                    className="hidden"
                    onChange={handleFileSelect}
                    accept=".pdf,.cdr,image/*"
                  />
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`file-upload-dropzone ${isDragging ? 'dragging' : ''}`}
                    onClick={() => document.getElementById('admin-file-input')?.click()}
                  >
                    <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 mb-3 border border-indigo-500/20">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-white">Drag & drop file here</p>
                    <p className="text-xs text-secondary mt-1">or click to browse device</p>
                    <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                      <span className="file-upload-badge">PDF</span>
                      <span className="file-upload-badge">CDR</span>
                      <span className="file-upload-badge">Images</span>
                    </div>
                    <p className="text-[10px] text-secondary mt-2">Max file size: 60 MB</p>
                  </div>

                  {uploadProgress !== null && uploadingFileName && (
                    <div className="file-progress-container flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-white font-medium truncate max-w-[180px]" title={uploadingFileName}>
                          Uploading: {uploadingFileName}
                        </span>
                        <span className="text-xs font-bold text-gradient">{uploadProgress}%</span>
                      </div>
                      <div className="file-progress-bar-bg">
                        <div
                          className="file-progress-bar-fill"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* File List (2 Cols) */}
                <div className="lg:col-span-2 flex flex-col min-w-0">
                  <h3 className="text-xs font-bold text-secondary uppercase tracking-wider mb-4">Uploaded Files ({files.length})</h3>
                  
                  {files.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl text-center min-h-[200px]">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-secondary mb-2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                        <line x1="9" y1="11" x2="15" y2="11" />
                      </svg>
                      <p className="text-sm text-secondary font-medium">No files uploaded yet.</p>
                      <p className="text-xs text-secondary mt-0.5">Use the upload zone on the left to add items.</p>
                    </div>
                  ) : (
                    <div className="max-h-[300px] overflow-y-auto pr-1 flex flex-col gap-2.5">
                      {files.map((file) => {
                        const fileExt = file.fileName.split('.').pop()?.toLowerCase();
                        const isPDF = fileExt === 'pdf' || file.fileType.includes('pdf');
                        const isCDR = fileExt === 'cdr' || file.fileType.includes('cdr');
                        const isImage = file.fileType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(fileExt || '');

                        const formatSize = (bytes: number) => {
                          if (bytes < 1024) return `${bytes} B`;
                          if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
                          return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
                        };

                        let typeClass = 'file-type-generic';
                        let iconSvg = (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        );

                        if (isPDF) {
                          typeClass = 'file-type-pdf';
                          iconSvg = (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="9" y1="15" x2="15" y2="15" />
                            </svg>
                          );
                        } else if (isCDR) {
                          typeClass = 'file-type-cdr';
                          iconSvg = (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5" />
                              <line x1="12" y1="22" x2="12" y2="12" />
                              <line x1="12" y1="12" x2="22" y2="8.5" />
                              <line x1="12" y1="12" x2="2" y2="8.5" />
                            </svg>
                          );
                        } else if (isImage) {
                          typeClass = 'file-type-image';
                          iconSvg = (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                              <circle cx="8.5" cy="8.5" r="1.5" />
                              <polyline points="21 15 16 10 5 21" />
                            </svg>
                          );
                        }

                        const uploadDateStr = file.uploadedAt?.toDate
                          ? new Date(file.uploadedAt.toDate()).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                          : '';

                        return (
                          <div key={file.id} className="file-item-row">
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className={`file-type-icon ${typeClass}`}>
                                {iconSvg}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-sm text-white truncate max-w-full" title={file.fileName}>
                                  {file.fileName}
                                </div>
                                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-secondary flex-wrap">
                                  <span>{formatSize(file.fileSize)}</span>
                                  <span className="opacity-40">•</span>
                                  <span className="truncate max-w-[120px]" title={file.uploadedBy}>{file.uploadedBy.split('@')[0]}</span>
                                  <span className="opacity-40">•</span>
                                  <span>{uploadDateStr}</span>
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 justify-end flex-shrink-0">
                              <button
                                onClick={() => handleDownloadClick(file)}
                                className="file-btn-download"
                                title="Download and Manage File"
                              >
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                  <polyline points="7 10 12 15 17 10" />
                                  <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                Download
                              </button>
                              <button
                                onClick={() => handleDirectDelete(file)}
                                className="file-btn-delete"
                                title="Delete File Directly"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Holiday Management */}
            <div className="glass-card mt-8 max-w-2xl">
              <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                <h2 className="subtitle !text-xl !text-white !mb-0 flex items-center gap-2">
                  Holiday Management
                </h2>
                <button
                  type="button"
                  onClick={() => { setShowHolidayModal(true); loadData(); }}
                  className="open-calendar-trigger"
                >
                  📅 Open Holiday Calendar
                </button>
              </div>
              <form onSubmit={handleMarkHoliday} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                <div className="input-group !mb-0">
                  <label className="input-label">Date</label>
                  <input
                    type="date"
                    className="input-field"
                    value={holidayDate}
                    onChange={(e) => setHolidayDate(e.target.value)}
                    required
                  />
                </div>
                <div className="input-group !mb-0">
                  <label className="input-label">Description (Optional)</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Independence Day"
                    value={holidayDesc}
                    onChange={(e) => setHolidayDesc(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary h-[46px]">
                  Mark Holiday
                </button>
              </form>
              <p className="text-xs text-secondary mt-4">
                Marking a holiday will prevent the auto-leave system from marking workers absent on that date. Sundays are automatically treated as holidays.
              </p>
            </div>
          </div>
        </div>
      </main>
      {showHolidayModal && renderHolidayCalendarModal()}
      {confirmDeleteFile && renderConfirmDeleteModal()}
    </>
  );
}
