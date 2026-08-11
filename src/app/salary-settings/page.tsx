"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { updateSalaryStartDay, getUserAttendanceHistory, get30WorkingDaysSalaryPeriod, AttendanceRecord, WorkingDaysCycle } from '@/lib/db';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';

export default function SalarySettings() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [startDateValue, setStartDateValue] = useState<string>('');
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [currentCalendarMonth, setCurrentCalendarMonth] = useState(new Date());

  const isWeekly = user?.salaryType === 'weekly';

  useEffect(() => {
    const unsubscribe = listenToAuthChanges((firebaseUser, appUser) => {
      if (!appUser) {
        router.push('/');
      } else if (appUser.role === 'pending') {
        router.push('/pending');
      } else {
        setUser(appUser);
        setSelectedDay(appUser.salaryStartDay || 1);
        setStartDateValue(appUser.salaryStartDate || new Date().toISOString().substring(0, 10));
        getUserAttendanceHistory(appUser.uid).then(records => setAttendance(records));
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateSalaryStartDay(user.uid, selectedDay, user.salaryType || 'monthly', isWeekly ? startDateValue : undefined);
      if (isWeekly) {
        toast.success(`30 Working Days Cycle start date updated!`);
      } else {
        toast.success(`Salary start day set to the ${formatOrdinal(selectedDay)} of every month!`);
      }

      setTimeout(() => {
        router.push('/dashboard');
      }, 1000);
    } catch (error) {
      console.error("Error updating salary settings:", error);
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

    // End date is the start day in the next month (inclusive)
    const endDate = new Date(currentYear, currentMonth + 1, day);

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

  const workingCycle = isWeekly ? get30WorkingDaysSalaryPeriod(user, attendance, new Date()) : null;
  const preview = getCyclePreview(selectedDay);

  return (
    <>
      <Navbar user={user} />
      <main className="container animate-fade-in max-w-4xl">
        <h1 className="title !text-4xl mb-2">
          {isWeekly ? 'Weekly (30 Work Days) Cycle Settings' : 'Monthly Salary Cycle Settings'}
        </h1>
        <p className="text-secondary text-sm mb-8">
          {isWeekly
            ? 'Your salary cycle accumulates 30 valid working days starting from your start date. Sundays and leaves are automatically excluded.'
            : 'Configure the start day of your monthly payroll cycle to align overtime calculation metrics and reports.'}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Picker Card */}
          <div className="glass-card lg:col-span-2 flex flex-col justify-between">
            <div>
              {isWeekly ? (
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    Cycle Starting Date
                  </h2>
                  <p className="text-xs text-secondary mb-4 leading-relaxed">
                    Select the initial starting date for your 30-working-day cycle calculations. The cycle will count 30 active working days forward, skipping all Sundays and Leaves.
                  </p>

                  <div className="input-group mb-6">
                    <label className="input-label text-xs font-semibold text-teal-300 uppercase tracking-wider block mb-1">
                      Salary Cycle Start Date
                    </label>
                    <input
                      type="date"
                      className="input-field font-semibold text-white bg-white/5 border-teal-500/30 p-2.5 rounded-xl w-full"
                      value={startDateValue}
                      onChange={(e) => setStartDateValue(e.target.value)}
                    />
                  </div>

                  <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl mb-6">
                    <h4 className="text-xs font-bold text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                      Rules for 30 Working Days Cycle
                    </h4>
                    <ul className="text-xs text-secondary space-y-1.5 list-disc pl-4">
                      <li><strong>Sundays:</strong> Excluded (0 days added to count).</li>
                      <li><strong>Full Leaves:</strong> Excluded (0 days added to count).</li>
                      <li><strong>Half Days:</strong> Counts as 0.5 working day.</li>
                      <li><strong>Present Days:</strong> Counts as 1 full working day.</li>
                    </ul>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="calendar-header-wrapper mb-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                      Select Cycle Start Day
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
              )}
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

          {/* Visual Preview / Progress Card */}
          <div className="glass-card border border-indigo-500/10 bg-indigo-500/[0.01] flex flex-col justify-between">
            <div>
              <h3 className="text-xs text-indigo-400 font-bold uppercase tracking-wider mb-4">
                {isWeekly ? '30 Work Days Cycle Tracker' : 'Cycle Preview'}
              </h3>

              {isWeekly && workingCycle ? (
                <div>
                  <div className="p-4 bg-white/5 rounded-xl border border-white/5 mb-6 text-center">
                    <span className="text-xs text-secondary block font-semibold mb-1">Working Days Completed</span>
                    <span className="text-4xl font-extrabold text-emerald-400 drop-shadow">
                      {workingCycle.workedDaysCount} <span className="text-lg text-secondary font-normal">/ 30</span>
                    </span>
                    <div className="w-full bg-white/10 h-2 rounded-full mt-3 overflow-hidden">
                      <div
                        className="bg-emerald-500 h-full transition-all duration-500"
                        style={{ width: `${Math.min(100, (workingCycle.workedDaysCount / 30) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 mb-6">
                    <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                      <span className="text-[10px] text-secondary uppercase font-bold block mb-1">Sundays Excluded</span>
                      <span className="text-sm font-bold text-pink-400">{workingCycle.excludedSundaysCount} Days</span>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg border border-white/5">
                      <span className="text-[10px] text-secondary uppercase font-bold block mb-1">Leaves Excluded</span>
                      <span className="text-sm font-bold text-red-400">{workingCycle.excludedLeavesCount} Days</span>
                    </div>
                  </div>

                  <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-lg text-xs font-semibold text-teal-300 flex justify-between items-center">
                    <span>Days Remaining:</span>
                    <span className="font-extrabold text-sm text-teal-200">{workingCycle.remainingDays} Days</span>
                  </div>
                </div>
              ) : (
                <div>
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

                    <div className="text-xs text-secondary leading-relaxed bg-white/5 p-3 rounded-lg border border-white/5 flex items-start gap-2">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                      <span><strong>Note:</strong> Limiting cycle starts to the 1st - 28th ensures your payroll periods remain stable across all months.</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
