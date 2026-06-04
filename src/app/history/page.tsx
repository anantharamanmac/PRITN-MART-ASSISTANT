"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { getUserAttendanceHistory, getUserTasks, AttendanceRecord, WorkTask, getCurrentSalaryPeriod } from '@/lib/db';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';
import Pagination from '@/components/Pagination';

export default function HistoryPage() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and Filter States
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [viewType, setViewType] = useState<'date' | 'month'>('date');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Set default filters based on user's active salary cycle on mount
  useEffect(() => {
    if (user) {
      const startDay = user.salaryStartDay || 1;
      const { startDate, endDate } = getCurrentSalaryPeriod(startDay);
      setStartDateFilter(startDate);
      setEndDateFilter(endDate);
    }
  }, [user]);

  // Pagination States
  const [attendancePage, setAttendancePage] = useState(1);
  const [taskPage, setTaskPage] = useState(1);

  // Reset pages when filters change
  useEffect(() => {
    setTimeout(() => {
      setAttendancePage(1);
      setTaskPage(1);
    }, 0);
  }, [startDateFilter, endDateFilter, filterStatus, viewType, sortOrder]);

  const formatHrsMins = (decimalHrs: number) => {
    const hrs = Math.floor(decimalHrs);
    const mins = Math.round((decimalHrs - hrs) * 60);
    return `${hrs}h ${mins}m`;
  };

  const getSalaryMonthForDate = (dateStr: string, startDay: number) => {
    const [year, monthVal, day] = dateStr.split('-').map(Number);
    const month = monthVal - 1; // 0-indexed
    
    if (day < startDay) {
      const prevMonth = month === 0 ? 11 : month - 1;
      const prevYear = month === 0 ? year - 1 : year;
      return `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}`;
    } else {
      return `${year}-${String(monthVal).padStart(2, '0')}`;
    }
  };

  const loadHistory = async (uid: string) => {
    try {
      const [attData, taskData] = await Promise.all([
        getUserAttendanceHistory(uid),
        getUserTasks(uid)
      ]);
      setAttendances(attData);
      setTasks(taskData);
    } catch (error) {
      console.error("Failed to load history", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = listenToAuthChanges((firebaseUser, appUser) => {
      if (!appUser) {
        router.push('/');
      } else if (appUser.role === 'pending') {
        router.push('/pending');
      } else {
        setUser(appUser);
        loadHistory(appUser.uid);
      }
    });
    return () => unsubscribe();
  }, [router]);

  if (!user || loading) return <PrinterLoader text="Loading History..." fullscreen />;

  const filteredAttendances = attendances.filter(a => {
    let match = true;
    if (startDateFilter && a.date < startDateFilter) match = false;
    if (endDateFilter && a.date > endDateFilter) match = false;

    if (filterStatus === 'present' && a.status !== 'present') match = false;
    if (filterStatus === 'leave' && a.status !== 'leave') match = false;
    if (filterStatus === 'overtime' && (a.status !== 'present' || !(a.overtimeHours > 0))) match = false;

    return match;
  });

  const filteredTasks = tasks.filter(t => {
    let match = true;
    if (startDateFilter && (t.date || '') < startDateFilter) match = false;
    if (endDateFilter && (t.date || '') > endDateFilter) match = false;
    return match;
  });

  // Grouping logic for Monthly view
  const monthlyGroupsMap = new Map<string, {
    monthStr: string;
    startDateStr: string;
    endDateStr: string;
    attendanceRecords: AttendanceRecord[];
    totalHours: number;
    overtimeHours: number;
    overtimePay: number;
    presentCount: number;
    halfDayCount: number;
    leaveCount: number;
  }>();

  // We group by custom salary month
  filteredAttendances.forEach(a => {
    const salMonth = getSalaryMonthForDate(a.date, user.salaryStartDay || 1);
    
    if (!monthlyGroupsMap.has(salMonth)) {
      const startDay = user.salaryStartDay || 1;
      const [y, mVal] = salMonth.split('-').map(Number);
      const m = mVal - 1; // 0-indexed
      
      const sDate = new Date(y, m, startDay);
      const eDate = new Date(y, m + 1, startDay - 1);
      
      const formatOption: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

      monthlyGroupsMap.set(salMonth, {
        monthStr: salMonth,
        startDateStr: sDate.toLocaleDateString('en-US', formatOption),
        endDateStr: eDate.toLocaleDateString('en-US', formatOption),
        attendanceRecords: [],
        totalHours: 0,
        overtimeHours: 0,
        overtimePay: 0,
        presentCount: 0,
        halfDayCount: 0,
        leaveCount: 0
      });
    }

    const group = monthlyGroupsMap.get(salMonth)!;
    group.attendanceRecords.push(a);
    group.totalHours += a.totalHours || 0;
    group.overtimeHours += a.overtimeHours || 0;
    group.overtimePay += (a.overtimeHours || 0) * 100;
    
    if (a.status === 'present') group.presentCount++;
    else if (a.status === 'half-day') group.halfDayCount++;
    else if (a.status === 'leave') group.leaveCount++;
  });

  const sortedAttendances = [...filteredAttendances].sort((a, b) => {
    return sortOrder === 'desc' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  });

  const sortedMonthlyGroupsList = Array.from(monthlyGroupsMap.values()).sort((a, b) => {
    return sortOrder === 'desc' ? b.monthStr.localeCompare(a.monthStr) : a.monthStr.localeCompare(b.monthStr);
  });

  const sortedTasks = [...filteredTasks].sort((a, b) => {
    const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
    const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
    return sortOrder === 'desc' ? bTime - aTime : aTime - bTime;
  });

  const ITEMS_PER_PAGE = 10;
  const startIndexAtt = (attendancePage - 1) * ITEMS_PER_PAGE;
  const paginatedAttendances = sortedAttendances.slice(startIndexAtt, startIndexAtt + ITEMS_PER_PAGE);
  const paginatedMonthlyGroups = sortedMonthlyGroupsList.slice(startIndexAtt, startIndexAtt + ITEMS_PER_PAGE);

  const startIndexTasks = (taskPage - 1) * ITEMS_PER_PAGE;
  const paginatedTasks = sortedTasks.slice(startIndexTasks, startIndexTasks + ITEMS_PER_PAGE);

  const totalOvertime = filteredAttendances.reduce((acc, curr) => acc + (curr.overtimeHours || 0), 0);
  const totalOvertimePay = totalOvertime * 100;

  return (
    <>
      <Navbar user={user} />
      <main className="container animate-fade-in">
        <h1 className="title !text-4xl mb-6">My History</h1>

        {/* Unified Search & Filters Panel (Full Width) */}
        <div className="glass-card mb-8">
          <h2 className="text-xs text-white font-semibold uppercase tracking-wider mb-4">Search & Filter Controls</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-secondary mb-1 block">Start Date</label>
              <input
                type="date"
                className="input-field w-full !py-1.5 !px-3 !text-sm"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block">End Date</label>
              <input
                type="date"
                className="input-field w-full !py-1.5 !px-3 !text-sm"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block">Attendance Status</label>
              <select
                className="input-field w-full !py-1.5 !px-3 !text-sm"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                <option value="all">All Records</option>
                <option value="present">Present Only</option>
                <option value="leave">Leave Only</option>
                <option value="overtime">Overtime Days</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block">Sort By Date (Cycle Period)</label>
              <select
                className="input-field w-full !py-1.5 !px-3 !text-sm"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as 'desc' | 'asc')}
              >
                <option value="desc">Latest Date / Cycle 📉</option>
                <option value="asc">Oldest Date / Cycle 📈</option>
              </select>
            </div>
          </div>
          {(startDateFilter || endDateFilter || filterStatus !== 'all' || sortOrder !== 'desc') && (
            <div className="flex justify-end mt-4 pt-3 border-t border-[rgba(255,255,255,0.05)]">
              <button
                onClick={() => { setStartDateFilter(''); setEndDateFilter(''); setFilterStatus('all'); setSortOrder('desc'); }}
                className="btn btn-outline !text-xs !py-1 !px-3 h-[30px]"
              >
                Clear All Filters
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

          {/* Attendance History */}
          <div className="glass-card">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
              <h2 className="subtitle !text-xl !text-white !mb-0">
                {viewType === 'date' ? 'Attendance Records' : 'Monthly Salary Cycles'}
              </h2>
              <div className="view-switcher-container">
                <button
                  onClick={() => setViewType('date')}
                  className={`view-switcher-btn ${viewType === 'date' ? 'active' : ''}`}
                >
                  📅 Daily
                </button>
                <button
                  onClick={() => setViewType('month')}
                  className={`view-switcher-btn ${viewType === 'month' ? 'active' : ''}`}
                >
                  💳 Monthly
                </button>
              </div>
            </div>

            {/* Total Overtime Stat */}
            <div className="mb-6 p-4 rounded-xl bg-[rgba(99,102,241,0.08)] border border-[rgba(99,102,241,0.2)] flex justify-between items-center">
              <div>
                <div className="text-xs text-secondary uppercase font-bold tracking-wider">Total Overtime Hours</div>
                <div className="text-2xl font-bold text-gradient mt-1">
                  {formatHrsMins(totalOvertime)}
                </div>
                <div className="text-xs font-bold text-teal-400 mt-1">
                  Est. Overtime Pay: ₹{Math.round(totalOvertimePay).toLocaleString('en-IN')}
                </div>
              </div>
              <div className="text-[10px] text-secondary max-w-[180px] text-right font-medium leading-relaxed">
                Calculated based on your selected filters and custom salary start day ({user.salaryStartDay || 1}). Rate: ₹100/hr.
              </div>
            </div>

            {viewType === 'date' ? (
              filteredAttendances.length === 0 ? (
                <p className="text-secondary text-sm">No matching attendance records found.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-4 max-h-[600px] overflow-y-auto pr-2 mb-2">
                    {paginatedAttendances.map((a, i) => (
                      <div key={i} className="p-4 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl">
                        <div className="flex justify-between mb-2">
                          <div className="font-semibold text-sm">{a.date}</div>
                          <span className={`badge ${a.status === 'present' ? 'badge-worker' :
                              a.status === 'half-day' ? 'badge-half-day' :
                                a.status === 'leave' ? 'badge-leave' :
                                  'badge-pending'
                            }`}>
                            {a.status}
                          </span>
                        </div>
                        {a.punchIn && (
                          <div className="text-xs text-secondary grid grid-cols-2 gap-y-1.5 mt-2 pt-2 border-t border-white/5">
                            <div>In: {a.punchIn ? new Date(a.punchIn.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</div>
                            <div>Out: {a.punchOut ? new Date(a.punchOut.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</div>
                            <div>Total: {formatHrsMins(a.totalHours || 0)}</div>
                            {a.overtimeHours > 0 && (
                              <div className="text-danger font-semibold flex items-center gap-1.5 flex-wrap col-span-2 mt-1">
                                <span>Overtime: {formatHrsMins(a.overtimeHours)}</span>
                                <span className="text-[10px] opacity-90 px-1.5 py-0.5 rounded bg-danger/10 border border-danger/25 text-pink-400 font-bold">
                                  Est. Pay: ₹{Math.round(a.overtimeHours * 100).toLocaleString('en-IN')}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  <Pagination
                    totalItems={filteredAttendances.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    currentPage={attendancePage}
                    onPageChange={setAttendancePage}
                    label="attendance records"
                  />
                </>
              )
            ) : (
              sortedMonthlyGroupsList.length === 0 ? (
                <p className="text-secondary text-sm">No matching monthly payroll records found.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-4 max-h-[600px] overflow-y-auto pr-2 mb-2 animate-fade-in">
                    {paginatedMonthlyGroups.map((group, idx) => (
                      <div key={idx} className="p-4 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl flex flex-col gap-3">
                        <div className="flex justify-between items-start border-b border-white/5 pb-2">
                          <div>
                            <h3 className="font-bold text-white text-sm flex items-center gap-2">
                              <span>{new Date(group.monthStr + '-02').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                              <span className="text-[9px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full">
                                Day: {user.salaryStartDay || 1}
                              </span>
                            </h3>
                            <span className="text-[10px] text-secondary mt-0.5 block font-medium">
                              Period: {group.startDateStr} &mdash; {group.endDateStr}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[9px] text-secondary uppercase font-bold tracking-wider block">Est. Pay</span>
                            <span className="text-base font-extrabold text-gradient">
                              ₹{Math.round(group.overtimePay).toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="bg-white/[0.01] border border-white/5 p-1.5 rounded-lg">
                            <span className="text-[9px] text-secondary uppercase font-bold block">Worked</span>
                            <span className="font-semibold text-white mt-0.5 block">
                              {formatHrsMins(group.totalHours)}
                            </span>
                          </div>
                          <div className="bg-white/[0.01] border border-white/5 p-1.5 rounded-lg">
                            <span className="text-[9px] text-secondary uppercase font-bold block">Overtime</span>
                            <span className="font-semibold text-pink-500 mt-0.5 block">
                              {formatHrsMins(group.overtimeHours)}
                            </span>
                          </div>
                          <div className="bg-white/[0.01] border border-white/5 p-1.5 rounded-lg">
                            <span className="text-[9px] text-secondary uppercase font-bold block">Days</span>
                            <span className="font-semibold mt-0.5 block flex gap-1 justify-center text-[10px]">
                              <span className="text-success">{group.presentCount}p</span>
                              <span className="text-amber-500">{group.halfDayCount}h</span>
                              <span className="text-danger">{group.leaveCount}l</span>
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Pagination
                    totalItems={sortedMonthlyGroupsList.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    currentPage={attendancePage}
                    onPageChange={setAttendancePage}
                    label="salary cycles"
                  />
                </>
              )
            )}
          </div>

          {/* Task History */}
          <div className="glass-card">
            <h2 className="subtitle !text-xl !text-white !mb-4">Tasks Completed</h2>
            {filteredTasks.length === 0 ? (
              <p className="text-secondary text-sm">No matching tasks found.</p>
            ) : (
              <>
                <div className="flex flex-col gap-4 max-h-[600px] overflow-y-auto pr-2 mb-2">
                  {paginatedTasks.map((t, i) => (
                    <div key={i} className="p-4 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl">
                      <div className="text-xs text-primary mb-2 font-semibold">
                        {new Date(t.createdAt.toDate()).toLocaleDateString()}
                      </div>
                      <p className="text-sm text-white whitespace-pre-wrap">{t.description}</p>
                    </div>
                  ))}
                </div>
                <Pagination
                  totalItems={filteredTasks.length}
                  itemsPerPage={ITEMS_PER_PAGE}
                  currentPage={taskPage}
                  onPageChange={setTaskPage}
                  label="tasks"
                />
              </>
            )}
          </div>

        </div>
      </main>
    </>
  );
}
