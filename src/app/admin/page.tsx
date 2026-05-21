"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { approveUser, getAllAttendance, AttendanceRecord, getTodayDateString, markHoliday, getAllUsers, updateUserProfile, HolidayRecord, getHolidayRecords, deleteHoliday, getOfficeSettings, updateOfficeSettings, OfficeSettings } from '@/lib/db';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';

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

  const loadData = async () => {
    try {
      const today = getTodayDateString();
      const [usersList, atts, holidays, officeData] = await Promise.all([
        getAllUsers(),
        getAllAttendance(today),
        getHolidayRecords(),
        getOfficeSettings()
      ]);

      setAllUsers(usersList);
      setPendingUsers(usersList.filter(u => u.role === 'pending'));
      setAttendances(atts);
      setHolidayRecords(holidays);
      setOfficeSettings(officeData);
      setOfficeLat(officeData.latitude.toString());
      setOfficeLng(officeData.longitude.toString());
      setOfficeRadius(officeData.radius.toString());
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

    // Silent background refresh every 2 minutes
    const interval = setInterval(() => {
      loadData();
    }, 120000);

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

  if (!currentUser || loading) return <PrinterLoader text="Loading Admin Panel..." fullscreen type="tshirt" />;

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
                  <div className="flex flex-col gap-4">
                    {pendingUsers.map(u => (
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
                  <div className="flex flex-col gap-4">
                    {attendances.map((a, i) => (
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
                                 if (!a.punchIn) return { totalHours: 0, overtimeHours: 0 };
                                 const inTime = typeof a.punchIn.toDate === 'function' ? a.punchIn.toDate().getTime() : new Date(a.punchIn as unknown as string).getTime();
                                 const diffHrs = Math.max(0, (now.getTime() - inTime) / (1000 * 60 * 60));
                                return {
                                  totalHours: diffHrs,
                                  overtimeHours: diffHrs > 9 ? diffHrs - 9 : 0
                                };
                              })();
                              const totalHrs = Math.floor(stats.totalHours);
                              const totalMins = Math.round((stats.totalHours - totalHrs) * 60);

                              const otHrs = Math.floor(stats.overtimeHours);
                              const otMins = Math.round((stats.overtimeHours - otHrs) * 60);

                              return (
                                <>
                                  <div className={stats.overtimeHours > 0 ? 'text-danger font-semibold' : ''}>
                                    Total: {totalHrs}h {totalMins}m <span className="text-[10px] opacity-75">({stats.totalHours.toFixed(2)} hrs)</span> {isWorking && <span className="text-[9px] uppercase tracking-wider bg-teal-500/10 px-1 py-0.5 rounded border border-teal-500/20 animate-pulse ml-0.5">Live</span>}
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
                )}
              </div>
            </div>

            {/* Team Management */}
            <div className="glass-card mt-8">
              <h2 className="subtitle !text-xl !text-white !mb-4">Manage Team</h2>
              <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-2">
                {allUsers.filter(u => u.role !== 'pending').map(user => (
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
    </>
  );
}
