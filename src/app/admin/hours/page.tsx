"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { getAllUsers, getAttendanceForMonth, AttendanceRecord } from '@/lib/db';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';

export default function AdminHours() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchName, setSearchName] = useState('');
  const [now, setNow] = useState(new Date());

  const formatHrsMins = (decimalHrs: number) => {
    const hrs = Math.floor(decimalHrs);
    const mins = Math.round((decimalHrs - hrs) * 60);
    return `${hrs}h ${mins}m`;
  };
  
  const currentMonthStr = () => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}`;
  };
  const [searchMonth, setSearchMonth] = useState(currentMonthStr());

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

  useEffect(() => {
    if (!currentUser) return;
    loadData(searchMonth);
  }, [currentUser, searchMonth]);

  const loadData = async (month: string) => {
    setLoading(true);
    try {
      const [usersList, attendanceList] = await Promise.all([
        getAllUsers(),
        getAttendanceForMonth(month)
      ]);
      
      // Keep approved members (excluding pending)
      setAllUsers(usersList.filter(u => u.role !== 'pending'));
      setAllAttendance(attendanceList);
    } catch (error) {
      console.error("Error loading hours data", error);
    } finally {
      setLoading(false);
    }
  };

  if (!currentUser || loading) return <PrinterLoader text="Loading Employee Reports..." fullscreen type="tshirt" />;

  // Filter users by search query
  const filteredUsers = allUsers.filter(u => 
    u.displayName.toLowerCase().includes(searchName.toLowerCase())
  );

  // Compute aggregated stats for the selected month
  const userStatsList = filteredUsers.map(user => {
    const records = allAttendance.filter(a => 
      a.userId === user.uid && 
      a.date.startsWith(searchMonth)
    );

    const presentDays = records.filter(r => r.status === 'present').length;
    const halfDays = records.filter(r => r.status === 'half-day').length;
    const leaveDays = records.filter(r => r.status === 'leave').length;
    const workingDays = presentDays + halfDays;

    const totalHours = records.reduce((sum, r) => {
      if (r.punchOut) return sum + (r.totalHours || 0);
      if (!r.punchIn) return sum;
      const inTime = r.punchIn.toDate ? r.punchIn.toDate().getTime() : new Date(r.punchIn).getTime();
      const activeHrs = Math.max(0, (now.getTime() - inTime) / (1000 * 60 * 60));
      return sum + activeHrs;
    }, 0);

    const overtimeHours = records.reduce((sum, r) => {
      if (r.punchOut) return sum + (r.overtimeHours || 0);
      if (!r.punchIn) return sum;
      const inTime = r.punchIn.toDate ? r.punchIn.toDate().getTime() : new Date(r.punchIn).getTime();
      const activeHrs = Math.max(0, (now.getTime() - inTime) / (1000 * 60 * 60));
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

  // Calculate cumulative stats for all matching users
  const totalHoursLogged = userStatsList.reduce((sum, u) => sum + u.totalHours, 0);
  const totalOvertimeLogged = userStatsList.reduce((sum, u) => sum + u.overtimeHours, 0);

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
              <h2 className="text-xs text-white font-semibold uppercase tracking-wider mb-4">Report Controls</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <label className="text-xs text-secondary mb-1 block">Select Month</label>
                  <input 
                    type="month" 
                    className="input-field w-full !py-1.5 !px-3 !text-sm"
                    value={searchMonth}
                    onChange={(e) => setSearchMonth(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Hours list panel */}
            <div className="glass-card">
              <h2 className="subtitle !text-xl !text-white !mb-4">Work Hours & Days Report</h2>
              {userStatsList.length === 0 ? (
                <p className="text-secondary text-sm">No employees match your search criteria.</p>
              ) : (
                <div className="flex flex-col gap-4 max-h-[600px] overflow-y-auto pr-2">
                  {userStatsList.map(({ user, workingDays, presentDays, halfDays, leaveDays, totalHours, overtimeHours }) => (
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
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1 md:flex-none justify-items-start md:justify-items-end text-sm">
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
                            {formatHrsMins(totalHours)} <span className="text-[10px] text-secondary font-normal">({totalHours.toFixed(1)}h)</span>
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-secondary uppercase font-bold">Overtime</div>
                          <div className={`font-semibold mt-0.5 ${overtimeHours > 0 ? 'text-pink-500 font-extrabold' : 'text-secondary'}`}>
                            {formatHrsMins(overtimeHours)} <span className="text-[10px] opacity-75 font-normal">({overtimeHours.toFixed(1)}h)</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
