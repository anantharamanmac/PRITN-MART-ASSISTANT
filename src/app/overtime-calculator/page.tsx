"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import Pagination from '@/components/Pagination';

interface Shift {
  id: string;
  date: string;
  punchIn: string; // HH:MM
  expectedPunchOut: string; // HH:MM (Punch In + 9 hours)
  actualPunchOut: string; // HH:MM
}

export default function OvertimeCalculator() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [shifts, setShifts] = useState<Shift[]>([
    {
      id: '1',
      date: new Date().toISOString().split('T')[0],
      punchIn: '09:00',
      expectedPunchOut: '18:00',
      actualPunchOut: '18:00'
    }
  ]);
  const [overtimeRate, setOvertimeRate] = useState<number>(100);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const unsubscribe = listenToAuthChanges((firebaseUser, appUser) => {
      if (!appUser) {
        router.push('/');
      } else {
        setUser(appUser);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  // Helper to calculate expected punch out (9 hours after punch in)
  const calculateExpectedOut = (punchInStr: string): string => {
    if (!punchInStr) return '';
    const [hrs, mins] = punchInStr.split(':').map(Number);
    if (isNaN(hrs) || isNaN(mins)) return '';

    let endHrs = hrs + 9;
    if (endHrs >= 24) endHrs -= 24;

    return `${String(endHrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  };

  const handlePunchInChange = (id: string, newIn: string) => {
    setShifts(prev => prev.map(s => {
      if (s.id === id) {
        const expected = calculateExpectedOut(newIn);
        return {
          ...s,
          punchIn: newIn,
          expectedPunchOut: expected,
          // Auto-adjust actual punch out to expected if it hasn't been changed yet
          actualPunchOut: s.actualPunchOut === s.expectedPunchOut ? expected : s.actualPunchOut
        };
      }
      return s;
    }));
  };

  const handleFieldChange = (id: string, field: keyof Shift, value: any) => {
    setShifts(prev => prev.map(s => {
      if (s.id === id) {
        return { ...s, [field]: value };
      }
      return s;
    }));
  };

  const ITEMS_PER_PAGE = 10;

  const addShift = () => {
    const lastShift = shifts[shifts.length - 1];
    let nextDate = new Date();
    if (lastShift) {
      const d = new Date(lastShift.date);
      d.setDate(d.getDate() + 1);
      nextDate = d;
    }
    const nextDateStr = nextDate.toISOString().split('T')[0];

    setShifts(prev => [
      ...prev,
      {
        id: String(Date.now()),
        date: nextDateStr,
        punchIn: '09:00',
        expectedPunchOut: '18:00',
        actualPunchOut: '18:00'
      }
    ]);

    // Go to the last page where the new shift will be added
    const newTotalPages = Math.ceil((shifts.length + 1) / ITEMS_PER_PAGE);
    setCurrentPage(newTotalPages);
  };

  const removeShift = (id: string) => {
    if (shifts.length === 1) return;
    setShifts(prev => {
      const updated = prev.filter(s => s.id !== id);
      const newTotalPages = Math.ceil(updated.length / ITEMS_PER_PAGE);
      if (currentPage > newTotalPages) {
        setCurrentPage(Math.max(1, newTotalPages));
      }
      return updated;
    });
  };

  // Calculate stats for a single shift in decimal hours
  const calculateShiftStats = (shift: Shift) => {
    const [inH, inM] = shift.punchIn.split(':').map(Number);
    const [outH, outM] = shift.actualPunchOut.split(':').map(Number);

    if (isNaN(inH) || isNaN(inM) || isNaN(outH) || isNaN(outM)) {
      return { totalHours: 0, overtimeHours: 0 };
    }

    let inMs = (inH * 60 + inM) * 60 * 1000;
    let outMs = (outH * 60 + outM) * 60 * 1000;

    // Handle cross-midnight shifts
    if (outMs < inMs) {
      outMs += 24 * 60 * 60 * 1000;
    }

    const elapsedMs = outMs - inMs;
    const workedHours = elapsedMs / (1000 * 60 * 60);

    // Overtime threshold is standard shift length (9 hours)
    // Any net hours beyond 9 is overtime
    const overtimeHours = workedHours > 9 ? workedHours - 9 : 0;

    return {
      totalHours: workedHours,
      overtimeHours
    };
  };

  // Aggregate stats across all shifts
  const aggregateStats = () => {
    let grandTotalHours = 0;
    let grandOvertimeHours = 0;

    shifts.forEach(s => {
      const stats = calculateShiftStats(s);
      grandTotalHours += stats.totalHours;
      grandOvertimeHours += stats.overtimeHours;
    });

    const overtimePay = grandOvertimeHours * overtimeRate;

    return {
      totalHours: grandTotalHours,
      overtimeHours: grandOvertimeHours,
      overtimePay
    };
  };

  const stats = aggregateStats();

  // Active page bounding
  const totalPages = Math.ceil(shifts.length / ITEMS_PER_PAGE);
  const activePage = Math.min(currentPage, Math.max(1, totalPages));
  const startIndex = (activePage - 1) * ITEMS_PER_PAGE;
  const paginatedShifts = shifts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const formatHrsMins = (decimalHrs: number) => {
    const hrs = Math.floor(decimalHrs);
    const mins = Math.round((decimalHrs - hrs) * 60);
    return `${hrs}h ${mins}m`;
  };

  if (!user || loading) return <PrinterLoader text="Loading Calculator..." fullscreen />;

  return (
    <>
      <Navbar user={user} />
      <main className="container animate-fade-in max-w-5xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="title !text-4xl !mb-2">Overtime Calculator</h1>
            <p className="text-secondary text-sm">
              Perform manual calculations for regular and overtime hours. Standard shift is 9 hours.
            </p>
          </div>
          <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-xl">
            <span className="text-xs text-secondary font-semibold uppercase">Rate:</span>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-secondary">₹</span>
              <input
                type="number"
                className="input-field !py-1 !px-2 !w-20 !text-sm text-center"
                value={overtimeRate}
                onChange={(e) => setOvertimeRate(Math.max(0, Number(e.target.value)))}
                placeholder="Rate"
              />
              <span className="text-xs text-secondary font-semibold">/ hr</span>
            </div>
          </div>
        </div>

        {/* Aggregate Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          <div className="glass-card !p-5 border border-indigo-500/15 bg-indigo-500/[0.02] flex justify-between items-center">
            <div>
              <div className="text-xs text-secondary uppercase font-bold tracking-wider">Total Worked Hours</div>
              <div className="text-3xl font-extrabold text-white mt-1">
                {formatHrsMins(stats.totalHours)}
                <span className="text-xs text-secondary font-normal ml-1">({stats.totalHours.toFixed(2)}h)</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </div>
          </div>

          <div className="glass-card !p-5 border border-pink-500/15 bg-pink-500/[0.02] flex justify-between items-center">
            <div>
              <div className="text-xs text-secondary uppercase font-bold tracking-wider">Overtime Hours</div>
              <div className="text-3xl font-extrabold text-pink-500 mt-1">
                {formatHrsMins(stats.overtimeHours)}
                <span className="text-xs text-secondary font-normal ml-1">({stats.overtimeHours.toFixed(2)}h)</span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-pink-500/10 text-pink-400 flex items-center justify-center border border-pink-500/20">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            </div>
          </div>

          <div className="glass-card !p-5 border border-emerald-500/15 bg-emerald-500/[0.02] flex justify-between items-center">
            <div>
              <div className="text-xs text-secondary uppercase font-bold tracking-wider">Calculated Pay</div>
              <div className="text-3xl font-extrabold text-success mt-1">
                ₹{Math.round(stats.overtimePay).toLocaleString('en-IN')}
              </div>
            </div>
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold border border-emerald-500/20">
              ₹
            </div>
          </div>
        </div>

        {/* Calculator Spreadsheet Panel */}
        <div className="glass-card mb-8">
          <h2 className="subtitle !text-xl !text-white !mb-4">Logged Days</h2>

          {/* Desktop View */}
          <div className="calculator-desktop-view">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/10 text-secondary text-xs uppercase tracking-wider font-bold">
                    <th className="pb-3 pr-4 min-w-[140px]">Date</th>
                    <th className="pb-3 px-4 min-w-[110px]">Punch In</th>
                    <th className="pb-3 px-4 min-w-[140px]">Expected Out (9h)</th>
                    <th className="pb-3 px-4 min-w-[110px]">Actual Punch Out</th>
                    <th className="pb-3 px-4 min-w-[110px]">Worked Hours</th>
                    <th className="pb-3 px-4 min-w-[110px]">Overtime</th>
                    <th className="pb-3 pl-4 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedShifts.map((shift, index) => {
                    const shiftStats = calculateShiftStats(shift);
                    return (
                      <tr key={shift.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.01] transition-colors">
                        {/* Date */}
                        <td className="py-3 pr-4">
                          <input
                            type="date"
                            className="input-field !py-1.5 !px-3 !text-sm w-full"
                            value={shift.date}
                            onChange={(e) => handleFieldChange(shift.id, 'date', e.target.value)}
                          />
                        </td>

                        {/* Punch In */}
                        <td className="py-3 px-4">
                          <input
                            type="time"
                            className="input-field !py-1.5 !px-3 !text-sm w-full"
                            value={shift.punchIn}
                            onChange={(e) => handlePunchInChange(shift.id, e.target.value)}
                          />
                        </td>

                        {/* Expected Out */}
                        <td className="py-3 px-4 text-sm text-secondary font-medium">
                          <span className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 inline-block w-full text-center">
                            {shift.expectedPunchOut || 'N/A'}
                          </span>
                        </td>

                        {/* Actual Out */}
                        <td className="py-3 px-4">
                          <input
                            type="time"
                            className="input-field !py-1.5 !px-3 !text-sm w-full"
                            value={shift.actualPunchOut}
                            onChange={(e) => handleFieldChange(shift.id, 'actualPunchOut', e.target.value)}
                          />
                        </td>

                        {/* Net worked hours */}
                        <td className="py-3 px-4 text-sm font-semibold text-white">
                          {formatHrsMins(shiftStats.totalHours)}
                        </td>

                        {/* Overtime Hours */}
                        <td className="py-3 px-4 text-sm font-bold text-pink-400">
                          {shiftStats.overtimeHours > 0 ? (
                            <span>+{shiftStats.overtimeHours.toFixed(2)}h</span>
                          ) : (
                            <span className="text-secondary font-normal">-</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 pl-4 text-right">
                          <button
                            onClick={() => removeShift(shift.id)}
                            disabled={shifts.length === 1}
                            className="team-btn-cancel !py-1 !px-2.5 !text-xs !height-auto border-red-500/20 hover:border-red-500 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Remove Shift"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <Pagination
              totalItems={shifts.length}
              itemsPerPage={ITEMS_PER_PAGE}
              currentPage={activePage}
              onPageChange={setCurrentPage}
              label="logged days"
            />

            <div className="flex justify-between items-center mt-6 pt-4 border-t border-white/5">
              <button onClick={addShift} className="btn btn-outline !text-xs !py-2 !px-4" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Add Day / Shift
              </button>
              <button
                onClick={() => {
                  setShifts([
                    {
                      id: String(Date.now()),
                      date: new Date().toISOString().split('T')[0],
                      punchIn: '09:00',
                      expectedPunchOut: '18:00',
                      actualPunchOut: '18:00'
                    }
                  ]);
                }}
                className="btn btn-outline border-red-500/25 text-red-400 hover:bg-red-500/5 hover:border-red-500/50 !text-xs !py-2 !px-4"
              >
                Reset Calculator
              </button>
            </div>
          </div>

          {/* Mobile View */}
          <div className="calculator-mobile-view">
            <div className="flex flex-col gap-4">
              {paginatedShifts.map((shift, index) => {
                const shiftStats = calculateShiftStats(shift);
                return (
                  <div key={shift.id} className="mobile-shift-card">
                    {/* Header */}
                    <div className="mobile-shift-card-header">
                      <span className="mobile-shift-card-title">Day / Shift #{startIndex + index + 1}</span>
                      <button
                        onClick={() => removeShift(shift.id)}
                        disabled={shifts.length === 1}
                        className="team-btn-cancel !py-1 !px-2.5 !text-xs !height-auto border-red-500/20 hover:border-red-500 hover:bg-red-500/10 hover:text-red-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Remove Shift"
                      >
                        ✕ Remove
                      </button>
                    </div>

                    {/* Grid */}
                    <div className="mobile-shift-grid">
                      <div className="mobile-shift-field mobile-shift-field-full">
                        <label className="mobile-shift-label">Date</label>
                        <input
                          type="date"
                          className="input-field !py-1.5 !px-3 !text-sm w-full"
                          value={shift.date}
                          onChange={(e) => handleFieldChange(shift.id, 'date', e.target.value)}
                        />
                      </div>

                      <div className="mobile-shift-field">
                        <label className="mobile-shift-label">Punch In</label>
                        <input
                          type="time"
                          className="input-field !py-1.5 !px-3 !text-sm w-full"
                          value={shift.punchIn}
                          onChange={(e) => handlePunchInChange(shift.id, e.target.value)}
                        />
                      </div>

                      <div className="mobile-shift-field">
                        <label className="mobile-shift-label">Actual Punch Out</label>
                        <input
                          type="time"
                          className="input-field !py-1.5 !px-3 !text-sm w-full"
                          value={shift.actualPunchOut}
                          onChange={(e) => handleFieldChange(shift.id, 'actualPunchOut', e.target.value)}
                        />
                      </div>

                      <div className="mobile-shift-field">
                        <label className="mobile-shift-label">Expected Out (9h)</label>
                        <div className="mobile-shift-value-box">
                          {shift.expectedPunchOut || 'N/A'}
                        </div>
                      </div>

                      <div className="mobile-shift-field">
                        <label className="mobile-shift-label">Worked / OT</label>
                        <div className="mobile-shift-value-box total-hours">
                          <span>{formatHrsMins(shiftStats.totalHours)}</span>
                          {shiftStats.overtimeHours > 0 ? (
                            <span className="text-[10px] text-pink-400 font-extrabold mt-0.5">
                              +{shiftStats.overtimeHours.toFixed(2)}h OT
                            </span>
                          ) : (
                            <span className="text-[10px] text-secondary font-normal mt-0.5">-</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <Pagination
              totalItems={shifts.length}
              itemsPerPage={ITEMS_PER_PAGE}
              currentPage={activePage}
              onPageChange={setCurrentPage}
              label="logged days"
            />

            {/* Mobile Actions */}
            <div className="mobile-action-buttons">
              <button onClick={addShift} className="btn btn-outline !text-xs !py-3 !px-4" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', justifyContent: 'center' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                Add Day / Shift
              </button>
              <button
                onClick={() => {
                  setShifts([
                    {
                      id: String(Date.now()),
                      date: new Date().toISOString().split('T')[0],
                      punchIn: '09:00',
                      expectedPunchOut: '18:00',
                      actualPunchOut: '18:00'
                    }
                  ]);
                }}
                className="btn btn-outline border-red-500/25 text-red-400 hover:bg-red-500/5 hover:border-red-500/50 !text-xs !py-3 !px-4"
              >
                Reset Calculator
              </button>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
