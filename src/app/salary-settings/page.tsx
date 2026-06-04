"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { updateSalaryStartDay } from '@/lib/db';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';

export default function SalarySettings() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [saving, setSaving] = useState(false);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());

  useEffect(() => {
    const unsubscribe = listenToAuthChanges((firebaseUser, appUser) => {
      if (!appUser) {
        router.push('/');
      } else if (appUser.role === 'pending') {
        router.push('/pending');
      } else {
        setUser(appUser);
        setSelectedDay(appUser.salaryStartDay || 1);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateSalaryStartDay(user.uid, selectedDay);
      toast.success(`Salary start day set to the ${formatOrdinal(selectedDay)} of every month!`);
      
      // Redirect back to dashboard after a short delay
      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);
    } catch (error) {
      console.error("Error updating salary start day:", error);
      toast.error("Failed to update salary settings.");
    } finally {
      setSaving(false);
    }
  };

  const formatOrdinal = (day: number) => {
    if (day === 11 || day === 12 || day === 13) return `${day}th`;
    const lastDigit = day % 10;
    if (lastDigit === 1) return `${day}st`;
    if (lastDigit === 2) return `${day}nd`;
    if (lastDigit === 3) return `${day}rd`;
    return `${day}th`;
  };

  const getCyclePreview = (day: number) => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-indexed

    // Format start and end dates
    const startDate = new Date(currentYear, currentMonth, day);
    
    // End date is one day before the start day in the next month
    const endDate = new Date(currentYear, currentMonth + 1, day - 1);

    const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
    return {
      start: startDate.toLocaleDateString('en-US', options),
      end: endDate.toLocaleDateString('en-US', options),
      monthName: startDate.toLocaleDateString('en-US', { month: 'long' })
    };
  };

  // Generate calendar days for visual selector
  const year = currentCalendarMonth.getFullYear();
  const month = currentCalendarMonth.getMonth(); // 0-indexed

  const firstDay = new Date(year, month, 1);
  const totalDays = new Date(year, month + 1, 0).getDate();
  const startDayOfWeek = firstDay.getDay();
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

  // Fill next month leading days
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

  const isDaySelectable = (cell: typeof calendarCells[0]) => {
    return cell.isCurrentMonth && cell.dayNum <= 28;
  };

  if (!user || loading) return <PrinterLoader text="Loading Settings..." fullscreen />;

  const preview = getCyclePreview(selectedDay);

  return (
    <>
      <Navbar user={user} />
      <main className="container animate-fade-in max-w-4xl">
        <h1 className="title !text-4xl mb-2">Salary Cycle Settings</h1>
        <p className="text-secondary text-sm mb-8">
          Configure the start day of your monthly payroll cycle to align overtime calculation metrics and reports.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Calendar Picker Card */}
          <div className="glass-card lg:col-span-2 flex flex-col justify-between">
            <div>
              <div className="calendar-header-wrapper mb-4">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  📅 Select Cycle Start Day
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

              <div className="calendar-grid-header" style={{ gap: '4px' }}>
                <div>Sun</div>
                <div>Mon</div>
                <div>Tue</div>
                <div>Wed</div>
                <div>Thu</div>
                <div>Fri</div>
                <div>Sat</div>
              </div>

              <div className="calendar-days-grid mb-6" style={{ gap: '4px' }}>
                {calendarCells.map((cell, idx) => {
                  const selectable = isDaySelectable(cell);
                  const isSelected = selectedDay === cell.dayNum && cell.isCurrentMonth;
                  const isOutOfRange = cell.isCurrentMonth && cell.dayNum > 28;

                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        if (selectable) {
                          setSelectedDay(cell.dayNum);
                        } else if (isOutOfRange) {
                          toast.error("Salary cycles can only start on days 1 to 28 to ensure compatibility across all months.");
                        }
                      }}
                      className={`calendar-day-cell ${!cell.isCurrentMonth ? 'other-month pointer-events-none' : ''} ${cell.isSunday ? 'is-sunday' : ''} ${isSelected ? 'is-selected' : ''} ${isOutOfRange ? 'opacity-30 cursor-not-allowed bg-red-950/10' : ''}`}
                      style={{
                        aspectRatio: '1',
                        padding: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minWidth: '0',
                        minHeight: '36px'
                      }}
                    >
                      <span className="day-number-label" style={{ fontSize: '0.8rem', lineHeight: '1' }}>{cell.dayNum}</span>
                      {isOutOfRange && (
                        <span style={{ fontSize: '7px', color: '#f87171', fontWeight: 'bold', marginTop: '2px', lineHeight: '1' }}>N/A</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex gap-4 pt-4 border-t border-white/5">
              <button
                onClick={() => router.push('/dashboard')}
                className="btn btn-outline flex-grow !text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="btn btn-primary flex-grow !text-sm"
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>

          {/* Visual Preview Card */}
          <div className="glass-card border border-indigo-500/10 bg-indigo-500/[0.01] flex flex-col justify-between">
            <div>
              <h3 className="text-xs text-indigo-400 font-bold uppercase tracking-wider mb-4">
                Cycle Preview
              </h3>
              
              <div className="p-4 bg-white/5 rounded-xl border border-white/5 mb-6 text-center">
                <span className="text-xs text-secondary block font-semibold mb-1">Your Salary Start Day</span>
                <span className="text-4xl font-extrabold text-white drop-shadow">
                  {formatOrdinal(selectedDay)}
                </span>
                <span className="text-xs text-secondary block font-semibold mt-1">of the month</span>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <span className="text-[10px] text-secondary uppercase font-bold tracking-wider">Example cycle ({preview.monthName})</span>
                  <div className="mt-1 font-semibold text-sm text-white flex flex-col gap-1.5">
                    <div className="flex justify-between items-center bg-teal-500/10 border border-teal-500/20 px-3 py-2 rounded-lg">
                      <span className="text-teal-400 text-xs">Start Date</span>
                      <span>{preview.start}</span>
                    </div>
                    <div className="flex justify-between items-center bg-pink-500/10 border border-pink-500/20 px-3 py-2 rounded-lg">
                      <span className="text-pink-400 text-xs">End Date</span>
                      <span>{preview.end}</span>
                    </div>
                  </div>
                </div>

                <div className="text-xs text-secondary leading-relaxed bg-white/5 p-3 rounded-lg border border-white/5">
                  🛡️ <strong>Note:</strong> Limiting cycle starts to the 1st - 28th ensures your payroll periods remain stable and consistent across all months of the year, including February. Days 29, 30, and 31 are disabled.
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
