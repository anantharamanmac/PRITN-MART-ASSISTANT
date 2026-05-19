"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { getPendingUsers, approveUser, getAllAttendance, AttendanceRecord, getTodayDateString, markHoliday, getAllUsers, updateUserProfile } from '@/lib/db';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';

export default function AdminDashboard() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [pendingUsers, setPendingUsers] = useState<AppUser[]>([]);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [holidayDate, setHolidayDate] = useState('');
  const [holidayDesc, setHolidayDesc] = useState('');
  
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState('');
  const [editDesignationValue, setEditDesignationValue] = useState('');

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

  const loadData = async () => {
    try {
      const usersList = await getAllUsers();
      setAllUsers(usersList);
      setPendingUsers(usersList.filter(u => u.role === 'pending'));
      
      const today = getTodayDateString();
      const atts = await getAllAttendance(today);
      setAttendances(atts);
    } catch (error) {
      console.error("Error loading admin data", error);
    } finally {
      setLoading(false);
    }
  };

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
        designation: editDesignationValue.trim()
      });
      setEditingUserId(null);
      await loadData(); // Reload to update UI
      toast.success("Profile updated successfully!");
    } catch (error) {
      toast.error("Failed to update profile.");
    }
  };

  const handleMarkHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayDate) return;
    try {
      await markHoliday(holidayDate, holidayDesc || 'Company Holiday');
      setHolidayDate('');
      setHolidayDesc('');
      toast.success("Holiday marked successfully!");
    } catch (error) {
      toast.error("Failed to mark holiday.");
    }
  };

  if (!currentUser || loading) return <PrinterLoader text="Loading Admin Panel..." fullscreen />;

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
                  Today's Attendance
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
                            <div className="font-semibold text-sm">
                              {allUsers.find(u => u.uid === a.userId)?.displayName || 'Unknown Worker'}
                            </div>
                            {allUsers.find(u => u.uid === a.userId)?.designation && (
                              <div className="text-[10px] text-teal-400 capitalize">
                                {allUsers.find(u => u.uid === a.userId)?.designation}
                              </div>
                            )}
                          </div>
                          <span className={`badge ${
                            a.status === 'present' ? 'badge-worker' : 
                            a.status === 'half-day' ? 'badge-half-day' : 
                            a.status === 'leave' ? 'badge-leave' : 
                            'badge-pending'
                          }`}>
                            {a.status}
                          </span>
                        </div>
                        {a.punchIn && (
                          <div className="text-xs text-secondary grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/5">
                            <div>In: {a.punchIn ? new Date(a.punchIn.toDate()).toLocaleTimeString() : 'N/A'}</div>
                            <div>Out: {a.punchOut ? new Date(a.punchOut.toDate()).toLocaleTimeString() : 'Working'}</div>
                            <div>Total: {a.totalHours.toFixed(2)} hrs</div>
                            <div className={a.overtimeHours > 0 ? 'text-danger font-semibold' : ''}>
                              Overtime: {a.overtimeHours.toFixed(2)} hrs
                            </div>
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
                            <button onClick={() => setEditingUserId(null)} className="btn btn-outline !text-xs !py-1 !px-2 h-[28px]">Cancel</button>
                            <button onClick={() => handleUpdateProfile(user.uid)} className="btn btn-success !text-xs !py-1 !px-2 h-[28px] font-semibold">Save</button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => { 
                              setEditingUserId(user.uid); 
                              setEditNameValue(user.displayName); 
                              setEditDesignationValue(user.designation || ''); 
                            }} 
                            className="text-xs text-primary hover:text-white transition-colors underline underline-offset-2"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Holiday Management */}
            <div className="glass-card mt-8 max-w-2xl">
              <h2 className="subtitle !text-xl !text-white !mb-6 flex items-center gap-2">
                Holiday Management
              </h2>
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
    </>
  );
}
