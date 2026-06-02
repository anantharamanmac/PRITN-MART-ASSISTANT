"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { getUserAttendanceHistory, getUserTasks, AttendanceRecord, WorkTask } from '@/lib/db';
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
  const [searchDate, setSearchDate] = useState('');

  const [searchMonth, setSearchMonth] = useState(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  });
  const [filterStatus, setFilterStatus] = useState('all');

  // Pagination States
  const [attendancePage, setAttendancePage] = useState(1);
  const [taskPage, setTaskPage] = useState(1);

  // Reset pages when filters change
  useEffect(() => {
    setTimeout(() => {
      setAttendancePage(1);
      setTaskPage(1);
    }, 0);
  }, [searchDate, searchMonth, filterStatus]);

  const formatHrsMins = (decimalHrs: number) => {
    const hrs = Math.floor(decimalHrs);
    const mins = Math.round((decimalHrs - hrs) * 60);
    return `${hrs}h ${mins}m`;
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
    if (searchDate && a.date !== searchDate) match = false;
    if (searchMonth && !a.date.startsWith(searchMonth)) match = false;

    if (filterStatus === 'present' && a.status !== 'present') match = false;
    if (filterStatus === 'leave' && a.status !== 'leave') match = false;
    if (filterStatus === 'overtime' && (a.status !== 'present' || !(a.overtimeHours > 0))) match = false;

    return match;
  });

  const filteredTasks = tasks.filter(t => {
    let match = true;
    if (searchDate && t.date !== searchDate) match = false;
    if (searchMonth && !t.date?.startsWith(searchMonth)) match = false;
    return match;
  });

  const ITEMS_PER_PAGE = 10;
  const startIndexAtt = (attendancePage - 1) * ITEMS_PER_PAGE;
  const paginatedAttendances = filteredAttendances.slice(startIndexAtt, startIndexAtt + ITEMS_PER_PAGE);

  const startIndexTasks = (taskPage - 1) * ITEMS_PER_PAGE;
  const paginatedTasks = filteredTasks.slice(startIndexTasks, startIndexTasks + ITEMS_PER_PAGE);

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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-secondary mb-1 block">Search by Day</label>
              <input
                type="date"
                className="input-field w-full !py-1.5 !px-3 !text-sm"
                value={searchDate}
                onChange={(e) => {
                  setSearchDate(e.target.value);
                  if (e.target.value) setSearchMonth('');
                }}
              />
            </div>
            <div>
              <label className="text-xs text-secondary mb-1 block">Search by Month</label>
              <input
                type="month"
                className="input-field w-full !py-1.5 !px-3 !text-sm"
                value={searchMonth}
                onChange={(e) => {
                  setSearchMonth(e.target.value);
                  if (e.target.value) setSearchDate('');
                }}
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
          </div>
          {(searchDate || searchMonth || filterStatus !== 'all') && (
            <div className="flex justify-end mt-4 pt-3 border-t border-[rgba(255,255,255,0.05)]">
              <button
                onClick={() => { setSearchDate(''); setSearchMonth(''); setFilterStatus('all'); }}
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
            <h2 className="subtitle !text-xl !text-white !mb-4">Attendance Records</h2>

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
              <div className="text-xs text-secondary max-w-[200px] text-right">
                Total hours overtime calculated from present days (Rate: ₹100/hr).
              </div>
            </div>

            {filteredAttendances.length === 0 ? (
              <p className="text-secondary text-sm">No matching attendance records found.</p>
            ) : (
              <>
                <div className="flex flex-col gap-4 max-h-[600px] overflow-y-auto pr-2 mb-2">
                  {paginatedAttendances.map((a, i) => (
                    <div key={i} className="p-4 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl">
                      <div className="flex justify-between mb-2">
                        <div className="font-semibold">{a.date}</div>
                        <span className={`badge ${a.status === 'present' ? 'badge-worker' :
                            a.status === 'half-day' ? 'badge-half-day' :
                              a.status === 'leave' ? 'badge-leave' :
                                'badge-pending'
                          }`}>
                          {a.status}
                        </span>
                      </div>
                      {a.punchIn && (
                        <div className="text-sm text-secondary grid grid-cols-2 gap-y-1">
                          <div>In: {a.punchIn ? new Date(a.punchIn.toDate()).toLocaleTimeString() : '-'}</div>
                          <div>Out: {a.punchOut ? new Date(a.punchOut.toDate()).toLocaleTimeString() : '-'}</div>
                          <div>Total: {formatHrsMins(a.totalHours || 0)}</div>
                          {a.overtimeHours > 0 && (
                            <div className="text-danger font-semibold flex items-center gap-1.5 flex-wrap">
                              <span>Overtime: {formatHrsMins(a.overtimeHours)}</span>
                              <span className="text-[10px] opacity-90 px-1.5 py-0.5 rounded bg-danger/10 border border-danger/25 text-pink-400">
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
