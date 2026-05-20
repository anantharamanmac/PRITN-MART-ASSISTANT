"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { getTodayAttendance, punchIn, punchOut, submitWorkTask, applyForLeave, AttendanceRecord, getTodayDateString, fillMissingLeaves } from '@/lib/db';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';

interface Particle {
  id: number;
  x: number;
  y: number;
  color: string;
  size: number;
  angle: number;
  speed: number;
  spin: number;
  rotation: number;
}

const playCheckInSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.5, start + duration);
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };
    playTone(523.25, now, 0.15); // C5
    playTone(659.25, now + 0.08, 0.2); // E5
    playTone(783.99, now + 0.16, 0.35); // G5
  } catch (e) {
    console.warn("Web Audio API blocked or not supported", e);
  }
};

const playCheckOutSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.8, start + duration);
      gain.gain.setValueAtTime(0.18, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };
    playTone(587.33, now, 0.2); // D5
    playTone(440.00, now + 0.1, 0.25); // A4
    playTone(349.23, now + 0.2, 0.45); // F4
  } catch (e) {
    console.warn("Web Audio API blocked or not supported", e);
  }
};

export default function WorkerDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [taskText, setTaskText] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [particles, setParticles] = useState<Particle[]>([]);

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
    
    // Silent background refresh every 2 minutes
    const interval = setInterval(() => {
      loadAttendance(user.uid);
    }, 120000);
    
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!attendance || !attendance.punchIn || attendance.punchOut) return;
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [attendance]);

  const getLiveHours = () => {
    if (!attendance || !attendance.punchIn) return '0h 00m 00s';
    const punchInTime = attendance.punchIn.toDate 
      ? attendance.punchIn.toDate().getTime() 
      : new Date(attendance.punchIn).getTime();
    const diffMs = currentTime.getTime() - punchInTime;
    const diffHrs = Math.max(0, diffMs / (1000 * 60 * 60));
    const hrs = Math.floor(diffHrs);
    const mins = Math.floor((diffHrs % 1) * 60);
    const secs = Math.floor((((diffHrs % 1) * 60) % 1) * 60);
    return `${hrs}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  };

  const formatHrsMins = (decimalHrs: number) => {
    const hrs = Math.floor(decimalHrs);
    const mins = Math.round((decimalHrs - hrs) * 60);
    return `${hrs}h ${mins}m`;
  };

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

  const triggerBurst = (clientX: number, clientY: number, colors = ['#818cf8', '#c084fc', '#f472b6', '#34d399', '#fb7185']) => {
    const newParticles: Particle[] = Array.from({ length: 40 }).map((_, idx) => {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      const size = 5 + Math.random() * 7;
      const color = colors[Math.floor(Math.random() * colors.length)];
      return {
        id: Math.random() + idx + Date.now(),
        x: clientX,
        y: clientY,
        color,
        size,
        angle,
        speed,
        spin: (Math.random() - 0.5) * 8,
        rotation: Math.random() * 360
      };
    });
    setParticles(prev => [...prev, ...newParticles]);

    const startTime = Date.now();
    const duration = 1200;

    const updateFrame = () => {
      const elapsed = Date.now() - startTime;
      if (elapsed >= duration) {
        setParticles(prev => prev.filter(p => !newParticles.find(np => np.id === p.id)));
        return;
      }

      const progress = elapsed / duration;
      setParticles(prev =>
        prev.map(p => {
          if (!newParticles.find(np => np.id === p.id)) return p;
          const rad = p.angle;
          const currentSpeed = p.speed * (1 - progress * 0.7);
          const dx = Math.cos(rad) * currentSpeed;
          const dy = Math.sin(rad) * currentSpeed + progress * 6;
          return {
            ...p,
            x: p.x + dx,
            y: p.y + dy,
            rotation: p.rotation + p.spin
          };
        })
      );
      requestAnimationFrame(updateFrame);
    };

    requestAnimationFrame(updateFrame);
  };

  const handlePunchIn = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!user) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX || (rect.left + rect.width / 2);
    const clientY = e.clientY || (rect.top + rect.height / 2);
    try {
      await punchIn(user.uid);
      await loadAttendance(user.uid);
      playCheckInSound();
      triggerBurst(clientX, clientY, ['#34d399', '#059669', '#10b981', '#6ee7b7', '#a7f3d0']);
      toast.success("Successfully punched in!");
    } catch (error) {
      toast.error("Error punching in.");
    }
  };

  const handlePunchOut = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!user) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX || (rect.left + rect.width / 2);
    const clientY = e.clientY || (rect.top + rect.height / 2);
    try {
      await punchOut(user.uid);
      await loadAttendance(user.uid);
      playCheckOutSound();
      triggerBurst(clientX, clientY, ['#f87171', '#ef4444', '#dc2626', '#fca5a5', '#fb7185']);
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
                  <div className="text-2xl font-bold text-success">{formatHrsMins(attendance.totalHours)}</div>
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
                      Overtime: {formatHrsMins(attendance.overtimeHours)}
                    </span>
                  )}
                </div>
                <p className="mt-6 text-secondary text-sm">Shift completed for today.</p>
              </>
            ) : (
              <>
                <div className={isPunchedIn ? "pulse-glowing-ring animate-fade-in" : "pulse-glowing-ring-green animate-fade-in"}>
                  <button 
                    onClick={(e) => isPunchedIn ? handlePunchOut(e) : handlePunchIn(e)}
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
                      <div className="flex flex-col items-center mt-1">
                        <span className="text-xs font-semibold text-amber-300 animate-pulse">
                          {getLiveHours()}
                        </span>
                        <span className="text-[10px] font-normal mt-1 text-white/90 bg-black/20 px-2 py-0.5 rounded-full">
                          In: {new Date(attendance.punchIn.toDate()).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                      </div>
                    )}
                  </button>
                </div>
                
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
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 99999, overflow: 'hidden' }}>
        {particles.map(p => (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              borderRadius: p.size % 3 === 0 ? '0%' : '50%',
              transform: `translate(-50%, -50%) rotate(${p.rotation}deg)`,
              opacity: 1 - (p.y / window.innerHeight) * 0.2,
              transition: 'opacity 0.2s ease'
            }}
          />
        ))}
      </div>
    </>
  );
}
