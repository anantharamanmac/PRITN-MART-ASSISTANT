"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { getUserAttendanceHistory, getUserTasks, AttendanceRecord } from '@/lib/db';
import Navbar from '@/components/Navbar';

export default function HistoryPage() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search and Filter States
  const [searchDate, setSearchDate] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');

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

  const loadHistory = async (uid: string) => {
    try {
      const attData = await getUserAttendanceHistory(uid);
      setAttendances(attData);
      
      const taskData = await getUserTasks(uid);
      setTasks(taskData);
    } catch (error) {
      console.error("Failed to load history", error);
    } finally {
      setLoading(false);
    }
  };

  if (!user || loading) return <div className="flex justify-center mt-20">Loading...</div>;

  const filteredAttendances = attendances.filter(a => {
    let match = true;
    if (searchDate && a.date !== searchDate) match = false;
    
    if (filterStatus === 'present' && a.status !== 'present') match = false;
    if (filterStatus === 'leave' && a.status !== 'leave') match = false;
    if (filterStatus === 'overtime' && (a.status !== 'present' || !(a.overtimeHours > 0))) match = false;

    return match;
  });

  return (
    <>
      <Navbar user={user} />
      <main className="container animate-fade-in">
        <h1 className="title !text-4xl mb-8">My History</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Attendance History */}
          <div className="glass-card">
            <h2 className="subtitle !text-xl !text-white !mb-4">Attendance Records</h2>

            {/* Total Overtime Stat */}
            <div className="mb-6 p-4 rounded-xl bg-[rgba(99,102,241,0.08)] border border-[rgba(99,102,241,0.2)] flex justify-between items-center">
              <div>
                <div className="text-xs text-secondary uppercase font-bold tracking-wider">Total Overtime Hours</div>
                <div className="text-2xl font-bold text-gradient mt-1">
                  {filteredAttendances.reduce((acc, curr) => acc + (curr.overtimeHours || 0), 0).toFixed(2)} hrs
                </div>
              </div>
              <div className="text-xs text-secondary max-w-[200px] text-right">
                Total hours overtime calculated from present days.
              </div>
            </div>
            
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6 p-4 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl">
              <div className="flex-1">
                <label className="text-xs text-secondary mb-1 block">Search by Date</label>
                <input 
                  type="date" 
                  className="input-field w-full !py-1.5 !px-3 !text-sm"
                  value={searchDate}
                  onChange={(e) => setSearchDate(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-secondary mb-1 block">Filter Status</label>
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
              {(searchDate || filterStatus !== 'all') && (
                <div className="flex items-end">
                  <button 
                    onClick={() => { setSearchDate(''); setFilterStatus('all'); }}
                    className="btn btn-outline !text-xs !py-1.5 h-[36px]"
                  >
                    Clear Filters
                  </button>
                </div>
              )}
            </div>

            {filteredAttendances.length === 0 ? (
              <p className="text-secondary text-sm">No matching attendance records found.</p>
            ) : (
              <div className="flex flex-col gap-4 max-h-[600px] overflow-y-auto pr-2">
                {filteredAttendances.map((a, i) => (
                  <div key={i} className="p-4 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl">
                    <div className="flex justify-between mb-2">
                      <div className="font-semibold">{a.date}</div>
                      <span className={`badge ${a.status === 'present' ? 'badge-worker' : 'badge-pending'}`}>
                        {a.status}
                      </span>
                    </div>
                    {a.status === 'present' && (
                      <div className="text-sm text-secondary grid grid-cols-2 gap-y-1">
                        <div>In: {a.punchIn ? new Date(a.punchIn.toDate()).toLocaleTimeString() : '-'}</div>
                        <div>Out: {a.punchOut ? new Date(a.punchOut.toDate()).toLocaleTimeString() : '-'}</div>
                        <div>Total: {a.totalHours?.toFixed(2)} hrs</div>
                        {a.overtimeHours > 0 && (
                          <div className="text-danger font-semibold">Overtime: {a.overtimeHours.toFixed(2)} hrs</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Task History */}
          <div className="glass-card">
            <h2 className="subtitle !text-xl !text-white !mb-4">Tasks Completed</h2>
            {tasks.length === 0 ? (
              <p className="text-secondary text-sm">No tasks found.</p>
            ) : (
              <div className="flex flex-col gap-4 max-h-[600px] overflow-y-auto pr-2">
                {tasks.map((t, i) => (
                  <div key={i} className="p-4 bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] rounded-xl">
                    <div className="text-xs text-primary mb-2 font-semibold">
                      {new Date(t.createdAt.toDate()).toLocaleDateString()}
                    </div>
                    <p className="text-sm text-white whitespace-pre-wrap">{t.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
          
        </div>
      </main>
    </>
  );
}
