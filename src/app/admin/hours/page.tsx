"use client";

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { getAllUsers, getAttendanceForDateRange, AttendanceRecord, getBreakTimeMs, getTodayDateString, getUserAttendanceHistory } from '@/lib/db';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';
import Pagination from '@/components/Pagination';
import { toast } from 'react-hot-toast';
import SalaryStatementSlip from '@/components/SalaryStatementSlip';

interface SalaryCycleOption {
  label: string;
  startDate: Date;
  endDate: Date;
  key: string;
}

const getRecentSalaryCycles = (startDay: number): SalaryCycleOption[] => {
  const options: SalaryCycleOption[] = [];
  const today = new Date();
  
  for (let i = 0; i < 6; i++) {
    const tempDate = new Date(today.getFullYear(), today.getMonth() - i, startDay);
    const startDate = new Date(tempDate.getFullYear(), tempDate.getMonth() - 1, startDay);
    const endDate = new Date(tempDate.getFullYear(), tempDate.getMonth(), startDay);
    
    const label = `${startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} - ${endDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    const key = `${startDate.getFullYear()}-${String(startDate.getMonth()).padStart(2, '0')}`;
    
    options.push({
      label,
      startDate,
      endDate,
      key
    });
  }
  return options;
};

export default function AdminHours() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const isFirstLoad = useRef(true);
  const [searchName, setSearchName] = useState('');
  const [now, setNow] = useState(new Date());

  // Sorting states
  const [sortBy, setSortBy] = useState<'name' | 'totalHours' | 'overtimeHours' | 'pay' | 'salaryStartDay' | 'periodStartDate' | 'periodEndDate'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Export PDF states
  const [selectedUserForExport, setSelectedUserForExport] = useState<AppUser | null>(null);
  const [selectedCycleIndex, setSelectedCycleIndex] = useState<number>(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<{
    user: AppUser;
    cycleRecords: AttendanceRecord[];
    startDate: Date;
    endDate: Date;
  } | null>(null);

  const handleOpenExportModal = (user: AppUser) => {
    setSelectedUserForExport(user);
    setSelectedCycleIndex(0);
    setShowExportModal(true);
  };

  const handleExportSalaryPDF = async (user: AppUser, cycleIdx: number) => {
    const toastId = toast.loading("Preparing statement preview...");

    try {
      const history = await getUserAttendanceHistory(user.uid);

      const startDay = user.salaryStartDay || 1;
      const cycles = getRecentSalaryCycles(startDay);
      const selectedCycle = cycles[cycleIdx];
      const startDate = selectedCycle.startDate;
      const endDate = selectedCycle.endDate;

      const cycleRecords = history.filter(rec => {
        const recDate = new Date(rec.date);
        return recDate >= startDate && recDate <= endDate;
      }).sort((a, b) => a.date.localeCompare(b.date));

      if (cycleRecords.length === 0) {
        toast.dismiss(toastId);
        toast.error("No attendance records found for the selected cycle.");
        return;
      }

      setPreviewData({
        user,
        cycleRecords,
        startDate,
        endDate
      });
      setShowPreviewModal(true);
      setShowExportModal(false);
      toast.dismiss(toastId);
    } catch (error) {
      console.error("Export preparation failed:", error);
      toast.dismiss(toastId);
      toast.error("Failed to prepare statement preview.");
    }
  };
  const formatHrsMins = (decimalHrs: number) => {
    const hrs = Math.floor(decimalHrs);
    const mins = Math.round((decimalHrs - hrs) * 60);
    return `${hrs}h ${mins}m`;
  };

  const getInitialDates = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth();
    const firstDay = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDayDate = new Date(y, m + 1, 0);
    const lastDay = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
    return { firstDay, lastDay };
  };
  const { firstDay, lastDay } = getInitialDates();
  const [startDateFilter, setStartDateFilter] = useState(firstDay);
  const [endDateFilter, setEndDateFilter] = useState(lastDay);

  // Pagination State
  const [reportPage, setReportPage] = useState(1);

  // Reset page when filters change
  useEffect(() => {
    setTimeout(() => {
      setReportPage(1);
    }, 0);
  }, [searchName, startDateFilter, endDateFilter, sortBy, sortOrder]);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribe = listenToAuthChanges((firebaseUser, appUser) => {
      if (!appUser) {
        router.push('/');
      } else if (appUser.role !== 'admin') {
        router.push('/dashboard');
      } else {
        setCurrentUser(appUser);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const setThisMonthPreset = () => {
    const { firstDay, lastDay } = getInitialDates();
    setStartDateFilter(firstDay);
    setEndDateFilter(lastDay);
  };

  const setLastMonthPreset = () => {
    const d = new Date();
    const prevYear = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
    const prevMonth = d.getMonth() === 0 ? 11 : d.getMonth() - 1;
    const firstDay = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-01`;
    const lastDayDate = new Date(prevYear, prevMonth + 1, 0);
    const lastDay = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
    setStartDateFilter(firstDay);
    setEndDateFilter(lastDay);
  };

  const loadData = async (start: string, end: string, isInitial: boolean = false) => {
    await Promise.resolve();
    if (isInitial) {
      setInitialLoading(true);
    } else {
      setIsFetching(true);
    }
    try {
      const [usersList, attendanceList] = await Promise.all([
        getAllUsers(),
        getAttendanceForDateRange(start, end)
      ]);

      // Keep approved members (excluding pending)
      setAllUsers(usersList.filter(u => u.role !== 'pending'));
      setAllAttendance(attendanceList);
    } catch (error) {
      console.error("Error loading hours data", error);
    } finally {
      if (isInitial) {
        setInitialLoading(false);
      } else {
        setIsFetching(false);
      }
    }
  };

  useEffect(() => {
    if (!currentUser) return;
    const isInitial = isFirstLoad.current;
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
    }
    const t = setTimeout(() => {
      loadData(startDateFilter, endDateFilter, isInitial);
    }, 0);
    return () => clearTimeout(t);
  }, [currentUser, startDateFilter, endDateFilter]);

  useEffect(() => {
    if (!currentUser) return;

    // Silent background refresh every 1 minute
    const interval = setInterval(() => {
      loadData(startDateFilter, endDateFilter, false);
    }, 60000);

    return () => clearInterval(interval);
  }, [currentUser, startDateFilter, endDateFilter]);

  if (!currentUser || initialLoading) return <PrinterLoader text="Loading Employee Reports..." fullscreen type="tshirt" />;

  // Filter users by search query
  const filteredUsers = allUsers.filter(u =>
    u.displayName.toLowerCase().includes(searchName.toLowerCase())
  );



  const formatOrdinal = (day: number) => {
    if (day === 11 || day === 12 || day === 13) return `${day}th`;
    const lastDigit = day % 10;
    if (lastDigit === 1) return `${day}st`;
    if (lastDigit === 2) return `${day}nd`;
    if (lastDigit === 3) return `${day}rd`;
    return `${day}th`;
  };

  const userStatsList = filteredUsers.map(user => {
    const records = allAttendance.filter(a =>
      a.userId === user.uid &&
      a.date >= startDateFilter &&
      a.date <= endDateFilter
    );

    const presentDays = records.filter(r => r.status === 'present').length;
    const halfDays = records.filter(r => r.status === 'half-day').length;
    const leaveDays = records.filter(r => r.status === 'leave').length;
    const workingDays = presentDays + halfDays;

    const totalHours = records.reduce((sum, r) => {
      if (r.punchOut) return sum + (r.totalHours || 0);
      if (!r.punchIn) return sum;
      
      // Past unclosed sessions do not calculate live active hours
      if (r.date !== getTodayDateString()) return sum;

      const inTime = typeof r.punchIn.toDate === 'function' ? r.punchIn.toDate().getTime() : new Date(r.punchIn as unknown as string).getTime();
      const breakMs = getBreakTimeMs(r.breaks, now.getTime());
      const activeHrs = Math.max(0, (now.getTime() - inTime - breakMs) / (1000 * 60 * 60));
      return sum + activeHrs;
    }, 0);

    const overtimeHours = records.reduce((sum, r) => {
      if (r.punchOut) return sum + (r.overtimeHours || 0);
      if (!r.punchIn) return sum;
      
      // Past unclosed sessions do not calculate live overtime hours
      if (r.date !== getTodayDateString()) return sum;

      const inTime = typeof r.punchIn.toDate === 'function' ? r.punchIn.toDate().getTime() : new Date(r.punchIn as unknown as string).getTime();
      const breakMs = getBreakTimeMs(r.breaks, now.getTime());
      const activeHrs = Math.max(0, (now.getTime() - inTime - breakMs) / (1000 * 60 * 60));
      const activeOvertime = activeHrs > 9 ? activeHrs - 9 : 0;
      return sum + activeOvertime;
    }, 0);

    return {
      user,
      workingDays,
      presentDays,
      halfDays,
      leaveDays,
      totalHours,
      overtimeHours
    };
  });

  // Sort user stats
  const sortedUserStatsList = [...userStatsList].sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'name') {
      comparison = a.user.displayName.localeCompare(b.user.displayName);
    } else if (sortBy === 'totalHours') {
      comparison = a.totalHours - b.totalHours;
    } else if (sortBy === 'overtimeHours') {
      comparison = a.overtimeHours - b.overtimeHours;
    } else if (sortBy === 'pay') {
      comparison = a.overtimeHours - b.overtimeHours; // directly proportional
    } else if (sortBy === 'salaryStartDay' || sortBy === 'periodStartDate' || sortBy === 'periodEndDate') {
      comparison = (a.user.salaryStartDay || 1) - (b.user.salaryStartDay || 1);
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  // Calculate cumulative stats for all matching users
  const totalHoursLogged = userStatsList.reduce((sum, u) => sum + u.totalHours, 0);
  const totalOvertimeLogged = userStatsList.reduce((sum, u) => sum + u.overtimeHours, 0);

  const ITEMS_PER_PAGE = 10;
  const totalReportPages = Math.ceil(sortedUserStatsList.length / ITEMS_PER_PAGE);
  const activeReportPage = Math.min(reportPage, Math.max(1, totalReportPages));
  const startIndex = (activeReportPage - 1) * ITEMS_PER_PAGE;
  const paginatedUserStatsList = sortedUserStatsList.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  return (
    <>
      <Navbar user={currentUser} />
      <main className="container animate-fade-in">
        <h1 className="title !text-4xl mb-8">Admin Console</h1>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar */}
          <aside className="w-full lg:w-64 flex-shrink-0 flex flex-col gap-3">
            <a href="/admin" className="sidebar-link">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" />
                <rect x="14" y="3" width="7" height="5" />
                <rect x="14" y="12" width="7" height="9" />
                <rect x="3" y="16" width="7" height="5" />
              </svg>
              Dashboard Overview
            </a>
            <a href="/admin/hours" className="sidebar-link active">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Employee Work Hours
            </a>
          </aside>

          {/* Main Content Area */}
          <div className="flex-1 min-w-0">
            {/* Top Summaries for selected month */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="glass-card !p-5 flex justify-between items-center border border-[rgba(99,102,241,0.15)] bg-[rgba(99,102,241,0.02)]">
                <div>
                  <div className="text-xs text-secondary uppercase font-bold tracking-wider">Total Monthly Hours Logged</div>
                  <div className="text-3xl font-extrabold text-gradient mt-1 flex items-baseline gap-1">
                    <span>{formatHrsMins(totalHoursLogged)}</span>
                    <span className="text-xs font-normal text-secondary">({totalHoursLogged.toFixed(1)}h)</span>
                  </div>
                </div>
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/25">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
              </div>

              <div className="glass-card !p-5 flex justify-between items-center border border-[rgba(236,72,153,0.15)] bg-[rgba(236,72,153,0.02)]">
                <div>
                  <div className="text-xs text-secondary uppercase font-bold tracking-wider">Total Monthly Overtime</div>
                  <div className="text-3xl font-extrabold text-pink-500 mt-1 flex items-baseline gap-1">
                    <span>{formatHrsMins(totalOvertimeLogged)}</span>
                    <span className="text-xs font-normal text-secondary">({totalOvertimeLogged.toFixed(1)}h)</span>
                  </div>
                  <div className="text-xs font-bold text-pink-400 mt-1">
                    Est. Overtime Pay: ₹{Math.round(totalOvertimeLogged * 100).toLocaleString('en-IN')}
                  </div>
                </div>
                <div className="w-12 h-12 rounded-xl bg-pink-500/10 text-pink-400 flex items-center justify-center border border-pink-500/25">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Filters controls card */}
            <div className="glass-card mb-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xs text-white font-semibold uppercase tracking-wider">Report Controls</h2>
                <a
                  href="/overtime-calculator"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="open-calendar-trigger !py-1 !px-2.5 !text-xs"
                >
                  <span className="flex items-center gap-1">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}><rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><line x1="9" y1="22" x2="15" y2="22" /><line x1="8" y1="6" x2="16" y2="6" /><line x1="16" y1="14" x2="16" y2="18" /><line x1="16" y1="10" x2="16" y2="10" /><path d="M12 10v4" /><path d="M12 18v.01" /><path d="M8 10v.01" /><path d="M8 14v.01" /><path d="M8 18v.01" /><path d="M12 14v.01" /></svg>
                    Calculator Tool
                  </span>
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <label className="text-xs text-secondary mb-1 block">Search Employee Name</label>
                  <input
                    type="text"
                    placeholder="Search by name..."
                    className="input-field w-full !py-1.5 !px-3 !text-sm"
                    value={searchName}
                    onChange={(e) => setSearchName(e.target.value)}
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-secondary">Start Date</label>
                  </div>
                  <input
                    type="date"
                    className="input-field w-full !py-1.5 !px-3 !text-sm"
                    value={startDateFilter}
                    onChange={(e) => setStartDateFilter(e.target.value)}
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs text-secondary">End Date</label>
                  </div>
                  <input
                    type="date"
                    className="input-field w-full !py-1.5 !px-3 !text-sm"
                    value={endDateFilter}
                    onChange={(e) => setEndDateFilter(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-secondary mb-1 block">Sort Employees By</label>
                  <select
                    className="input-field w-full !py-1.5 !px-3 !text-sm"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'name' | 'totalHours' | 'overtimeHours' | 'pay' | 'salaryStartDay' | 'periodStartDate' | 'periodEndDate')}
                  >
                    <option value="name">Name</option>
                    <option value="totalHours">Total Hours Worked</option>
                    <option value="overtimeHours">Overtime Hours</option>
                    <option value="pay">Estimated Pay</option>
                    <option value="periodStartDate">Period Start Date</option>
                    <option value="periodEndDate">Period End Date</option>
                    <option value="salaryStartDay">Salary Cycle Day</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-secondary mb-1 block">Sort Order</label>
                  <select
                    className="input-field w-full !py-1.5 !px-3 !text-sm"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                  >
                    <option value="asc">Ascending</option>
                    <option value="desc">Descending</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[rgba(255,255,255,0.06)]">
                <span className="text-xs text-secondary font-medium">Quick Date Ranges:</span>
                <button
                  type="button"
                  onClick={setThisMonthPreset}
                  className="px-2.5 py-1 text-xs bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 rounded-md border border-indigo-500/20 transition-colors font-medium"
                >
                  This Month
                </button>
                <button
                  type="button"
                  onClick={setLastMonthPreset}
                  className="px-2.5 py-1 text-xs bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 rounded-md border border-purple-500/20 transition-colors font-medium"
                >
                  Last Month
                </button>
              </div>
            </div>

            {/* Hours list panel */}
            <div className="glass-card relative">
              <div className="flex justify-between items-center mb-4">
                <h2 className="subtitle !text-xl !text-white !mb-0">Work Hours & Days Report</h2>
                {isFetching && (
                  <span className="flex items-center gap-2 text-xs text-indigo-400 bg-indigo-500/10 px-3 py-1 rounded-full border border-indigo-500/20 animate-pulse">
                    <svg className="animate-spin h-3.5 w-3.5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Updating report...
                  </span>
                )}
              </div>
              {sortedUserStatsList.length === 0 ? (
                <p className="text-secondary text-sm">No employees match your search criteria.</p>
              ) : (
                <>
                  <div className={`flex flex-col gap-4 max-h-[600px] overflow-y-auto pr-2 mb-2 transition-opacity duration-200 ${isFetching ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                    {paginatedUserStatsList.map(({ user, workingDays, presentDays, halfDays, leaveDays, totalHours, overtimeHours }) => {
                      // Compute periods range dates safely
                      const startDay = user.salaryStartDay || 1;
                      let periodRangeStr = "Custom Range";
                      if (startDateFilter && endDateFilter) {
                        const parts = startDateFilter.split('-').map(Number);
                        if (parts.length === 3 && !parts.some(isNaN)) {
                          const [y, mVal] = parts;
                          const m = mVal - 1;
                          const sDate = new Date(y, m, startDay);
                          const eDate = new Date(y, m + 1, startDay);
                          if (!isNaN(sDate.getTime()) && !isNaN(eDate.getTime())) {
                            const formatOption: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
                            periodRangeStr = `${sDate.toLocaleDateString('en-US', formatOption)} - ${eDate.toLocaleDateString('en-US', formatOption)}`;
                          }
                        }
                      }

                      return (
                        <div key={user.uid} className="p-4 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                          {/* Worker Identity info */}
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-sm border border-indigo-500/20">
                              {user.displayName?.charAt(0).toUpperCase() || 'W'}
                            </div>
                            <div>
                              <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
                                <span>{user.displayName}</span>
                                {user.designation && (
                                  <span className="text-[10px] font-semibold text-teal-300 bg-teal-500/10 border border-teal-500/25 px-2 py-0.5 rounded-full capitalize">
                                    {user.designation}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-secondary">{user.email}</div>
                            </div>
                          </div>

                          {/* Stats grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 flex-1 md:flex-none justify-items-start md:justify-items-end text-sm items-center">
                            <div>
                              <div className="text-[10px] text-secondary uppercase font-bold">Salary Cycle</div>
                              <div className="font-semibold text-purple-400 mt-0.5 text-xs flex flex-col items-start md:items-end">
                                <span>{periodRangeStr}</span>
                                <span className="text-[9px] text-secondary">Start: {formatOrdinal(startDay)}</span>
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-secondary uppercase font-bold">Working Days</div>
                              <div className="font-semibold text-white mt-0.5 flex items-baseline gap-1">
                                <span>{workingDays}</span>
                                <span className="text-[10px] text-secondary">days</span>
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-secondary uppercase font-bold">Present / Half / Leave</div>
                              <div className="font-semibold text-white mt-0.5 flex gap-1 text-xs">
                                <span className="text-success">{presentDays}p</span>
                                <span className="text-amber-500">{halfDays}h</span>
                                <span className="text-danger">{leaveDays}l</span>
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-secondary uppercase font-bold">Total Hours</div>
                              <div className="font-semibold text-gradient mt-0.5">
                                {formatHrsMins(totalHours)} <span className="text-[10px] text-secondary font-normal font-sans">({totalHours.toFixed(1)}h)</span>
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-secondary uppercase font-bold">Overtime</div>
                              <div className={`font-semibold mt-0.5 ${overtimeHours > 0 ? 'text-pink-500 font-extrabold' : 'text-secondary'}`}>
                                {formatHrsMins(overtimeHours)} <span className="text-[10px] opacity-75 font-normal font-sans">({overtimeHours.toFixed(1)}h)</span>
                              </div>
                              {overtimeHours > 0 && (
                                <div className="text-[10px] text-pink-400 font-semibold mt-0.5">
                                  Est. Pay: ₹{Math.round(overtimeHours * 100).toLocaleString('en-IN')}
                                </div>
                              )}
                            </div>
                            <div className="col-span-2 sm:col-span-1 flex items-center justify-end w-full">
                              <button
                                onClick={() => handleOpenExportModal(user)}
                                className="btn btn-primary !py-1.5 !px-3.5 !text-xs"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', width: 'auto' }}
                              >
                                <span className="flex items-center gap-1">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                                  Export
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Pagination
                    totalItems={sortedUserStatsList.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    currentPage={activeReportPage}
                    onPageChange={setReportPage}
                    label="employees"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Export Modal Overlay */}
      {showExportModal && selectedUserForExport && (
        <div className="welcome-modal-overlay" style={{ zIndex: 10000 }}>
          <div className="welcome-modal-card animate-scale-up" style={{ maxWidth: '480px', width: '90%', background: 'var(--bg-surface)' }}>
            <div className="welcome-modal-grid-pattern" />
            <div className="welcome-modal-orb welcome-modal-orb-1" />
            <div className="welcome-modal-orb welcome-modal-orb-2" />
            <div className="welcome-modal-accent" style={{ background: 'linear-gradient(90deg, var(--sapphire), var(--sapphire-light))' }} />

            {/* Close Button */}
            <button 
              onClick={() => setShowExportModal(false)} 
              className="welcome-modal-close"
              aria-label="Close export dialog"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Title */}
            <h3 className="welcome-modal-title" style={{ fontSize: '1.4rem', marginBottom: '0.5rem', textAlign: 'left' }}>
              Export Salary Statement
            </h3>
            <p className="text-secondary text-xs mb-6">
              Generate a professional, branded PDF statement showing detailed shift records and overtime summaries.
            </p>

            {/* Employee info */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '1rem', marginBottom: '1.25rem', textAlign: 'left' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Selected Employee</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {selectedUserForExport.displayName}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                {selectedUserForExport.email}
              </div>
            </div>

            {/* Cycle Selector */}
            <div className="input-group" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
              <label className="input-label text-xs font-semibold">Select Salary Cycle</label>
              <select
                className="input-field"
                value={selectedCycleIndex}
                onChange={(e) => setSelectedCycleIndex(Number(e.target.value))}
              >
                {getRecentSalaryCycles(selectedUserForExport.salaryStartDay || 1).map((cycle, idx) => (
                  <option key={cycle.key} value={idx}>
                    {cycle.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
              <button 
                onClick={() => handleExportSalaryPDF(selectedUserForExport, selectedCycleIndex)}
                className="btn btn-primary flex-grow"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'center' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                Generate & Export
              </button>
              <button 
                onClick={() => setShowExportModal(false)}
                className="btn btn-outline"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Statement Preview Modal Overlay */}
      {showPreviewModal && previewData && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}>
          <div className="card-glass" style={{ width: '100%', maxWidth: '900px', maxHeight: '94vh', overflowY: 'auto', borderRadius: '20px', padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <SalaryStatementSlip
              user={previewData.user}
              cycleRecords={previewData.cycleRecords}
              startDate={previewData.startDate}
              endDate={previewData.endDate}
              onClose={() => setShowPreviewModal(false)}
            />
          </div>
        </div>
      )}
    </>
  );
}
