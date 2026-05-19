"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { getTodayAttendance, punchIn, punchOut, submitWorkTask, applyForLeave, AttendanceRecord, getTodayDateString, fillMissingLeaves } from '@/lib/db';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';

export default function WorkerDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [taskText, setTaskText] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = listenToAuthChanges((firebaseUser, appUser) => {
      if (!appUser) {
        router.push('/');
      } else if (appUser.role === 'pending') {
        router.push('/pending');
      } else {
        setUser(appUser);
        loadAttendance(appUser.uid);
      }
    });
    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    
    // Silent background refresh every 1 minute
    const interval = setInterval(() => {
      loadAttendance(user.uid);
    }, 60000);
    
    return () => clearInterval(interval);
  }, [user]);

  const loadAttendance = async (uid: string) => {
    try {
      // First, backfill any missing days!
      await fillMissingLeaves(uid);
      
      const rec = await getTodayAttendance(uid);
      setAttendance(rec);
    } catch (error) {
      console.error("Failed to load attendance", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePunchIn = async () => {
    if (!user) return;
    try {
      await punchIn(user.uid);
      await loadAttendance(user.uid);
      toast.success("Successfully punched in!");
    } catch (error) {
      toast.error("Error punching in.");
    }
  };

  const handlePunchOut = async () => {
    if (!user) return;
    try {
      await punchOut(user.uid);
      await loadAttendance(user.uid);
      toast.success("Successfully punched out!");
    } catch (error) {
      toast.error("Error punching out.");
    }
  };

  const handleApplyLeave = async () => {
    if (!user) return;
    // Keeping native confirm for intentional friction
    const confirmLeave = confirm("Are you sure you want to mark today as Leave?");
    if (!confirmLeave) return;
    
    try {
      await applyForLeave(user.uid, getTodayDateString());
      await loadAttendance(user.uid);
      toast.success("Marked as Leave");
    } catch (error) {
      toast.error("Error applying for leave.");
    }
  };

  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !taskText.trim()) return;
    
    try {
      await submitWorkTask(user.uid, taskText.trim());
      setTaskText('');
      toast.success("Task submitted successfully!");
    } catch (error) {
      toast.error("Error submitting task.");
    }
  };

  if (!user || loading) return <PrinterLoader text="Loading Workspace..." fullscreen />;

  const isLeave = attendance && attendance.status === 'leave' && !attendance.punchIn;
  const isPunchedIn = attendance && attendance.punchIn && !attendance.punchOut;
  const isPunchedOut = attendance && attendance.punchOut;

  return (
    <>
      <Navbar user={user} />
      <main className="container animate-fade-in">
        <h1 className="title !text-4xl mb-8">Worker Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          
          {/* Attendance Card */}
          <div className="glass-card flex flex-col items-center text-center">
            <h2 className="subtitle !text-xl !text-white !mb-2">Time Tracking</h2>
            <p className="text-sm text-secondary mb-8">{getTodayDateString()}</p>
            
            {isLeave ? (
              <div className="p-6 rounded-full bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] mb-4">
                <div className="text-xl font-bold text-amber-500">On Leave Today</div>
              </div>
            ) : isPunchedOut ? (
              <>
                <div className="p-6 rounded-full bg-[rgba(16,185,129,0.1)] border border-[rgba(16,185,129,0.3)] mb-4 w-48 h-48 flex flex-col items-center justify-center">
                  <div className="text-2xl font-bold text-success">{attendance.totalHours.toFixed(1)} hrs</div>
                  <div className="text-sm text-secondary mt-1">Total Worked</div>
                </div>
                <div className="mt-2 flex gap-2 flex-wrap justify-center">
                  <span className={`badge ${
                    attendance.status === 'present' ? 'badge-worker' : 
                    attendance.status === 'half-day' ? 'badge-half-day' : 
                    'badge-leave'
                  }`}>
                    {attendance.status}
                  </span>
                  {attendance.overtimeHours > 0 && (
                    <span className="badge badge-admin text-danger border-danger/30 bg-danger/10">
                      Overtime: {attendance.overtimeHours.toFixed(1)} hrs
                    </span>
                  )}
                </div>
                <p className="mt-6 text-secondary text-sm">Shift completed for today.</p>
              </>
            ) : (
              <>
                <button 
                  onClick={isPunchedIn ? handlePunchOut : handlePunchIn}
                  className={`w-48 h-48 rounded-full flex flex-col items-center justify-center text-center overflow-hidden text-xl font-bold transition-all duration-300 ${
                    isPunchedIn 
                      ? 'bg-gradient-to-br from-orange-500 to-red-600 shadow-[0_0_30px_rgba(239,68,68,0.4)] hover:shadow-[0_0_50px_rgba(239,68,68,0.6)] border-4 border-red-400' 
                      : 'bg-gradient-to-br from-teal-400 to-emerald-600 shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:shadow-[0_0_50px_rgba(16,185,129,0.6)] border-4 border-emerald-400'
                  }`}
                >
                  <span className="text-white drop-shadow-md leading-tight px-4">
                    {isPunchedIn ? 'PUNCH OUT' : 'PUNCH IN'}
                  </span>
                  {isPunchedIn && (
                    <span className="text-sm font-normal mt-1 text-white/90 bg-black/20 px-3 py-1 rounded-full">
                      In: {new Date(attendance.punchIn.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </span>
                  )}
                </button>
                
                {!isPunchedIn && (
                  <button 
                    onClick={handleApplyLeave} 
                    className="mt-8 btn btn-outline flex items-center gap-2 border-[rgba(245,158,11,0.3)] text-amber-500 hover:bg-[rgba(245,158,11,0.1)] hover:border-amber-500 transition-colors"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                      <line x1="16" y1="2" x2="16" y2="6"></line>
                      <line x1="8" y1="2" x2="8" y2="6"></line>
                      <line x1="3" y1="10" x2="21" y2="10"></line>
                      <path d="M9 16l2 2 4-4"></path>
                    </svg>
                    Apply for Leave
                  </button>
                )}
              </>
            )}
          </div>

          {/* Task Submission Card */}
          <div className="glass-card">
            <h2 className="subtitle !text-xl !text-white !mb-6">Log Work Task</h2>
            <form onSubmit={handleTaskSubmit} className="flex flex-col h-full">
              <div className="input-group flex-grow">
                <label className="input-label">What did you work on today?</label>
                <textarea 
                  className="input-field min-h-[150px] resize-none" 
                  placeholder="E.g. Completed the UI design for the dashboard, fixed 3 bugs in the admin panel..."
                  value={taskText}
                  onChange={(e) => setTaskText(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary mt-auto w-full">
                Submit Task
              </button>
            </form>
          </div>
          
        </div>
      </main>
    </>
  );
}
