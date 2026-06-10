"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { getTodayAttendance, punchIn, punchOut, submitWorkTask, applyForLeave, AttendanceRecord, getTodayDateString, fillMissingLeaves, getOfficeSettings, pauseWork, resumeWork, getBreakTimeMs, getUserAttendanceHistory } from '@/lib/db';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';
import WelcomeModal from '@/components/WelcomeModal';
import SalaryNotificationModal from '@/components/SalaryNotificationModal';
import AIChatbot from '@/components/AIChatbot';

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
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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

const playErrorSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;
    const playTone = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.linearRampToValueAtTime(freq * 0.9, start + duration);
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };
    playTone(150, now, 0.15);
    playTone(150, now + 0.2, 0.25);
  } catch (e) {
    console.warn("Web Audio API blocked or not supported", e);
  }
};

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) *
    Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // returns distance in meters
};

const getCoordinates = (): Promise<GeolocationPosition> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      reject(new Error("Geolocation is not supported by your browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });
  });
};

export default function WorkerDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRecord | null>(null);
  const [taskText, setTaskText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isPolishing, setIsPolishing] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [particles, setParticles] = useState<Particle[]>([]);
  const [verifyingLocation, setVerifyingLocation] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const formatOrdinal = (day: number) => {
    if (day === 11 || day === 12 || day === 13) return `${day}th`;
    const lastDigit = day % 10;
    if (lastDigit === 1) return `${day}st`;
    if (lastDigit === 2) return `${day}nd`;
    if (lastDigit === 3) return `${day}rd`;
    return `${day}th`;
  };

  const handleExportSalaryPDF = async () => {
    if (!user) return;

    // Create loading toast reference
    const toastId = toast.loading("Generating professional PDF...");

    try {
      // Fetch PrintMart Logo and convert it to Base64 for inline inclusion
      let base64Logo = "";
      try {
        const logoUrl = `${window.location.origin}/logo.png`;
        const logoRes = await fetch(logoUrl);
        if (logoRes.ok) {
          const blob = await logoRes.blob();
          base64Logo = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
      } catch (err) {
        console.warn("Could not load logo.png for PDF. Using fallback.", err);
      }

      const history = await getUserAttendanceHistory(user.uid);

      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth();
      const startDay = user.salaryStartDay || 1;

      const startDate = new Date(currentYear, currentMonth - 1, startDay);
      const endDate = new Date(currentYear, currentMonth, startDay);

      const cycleRecords = history.filter(rec => {
        const recDate = new Date(rec.date);
        return recDate >= startDate && recDate <= endDate;
      }).sort((a, b) => a.date.localeCompare(b.date));

      if (cycleRecords.length === 0) {
        toast.dismiss(toastId);
        toast.error("No attendance records found for the completed cycle.");
        return;
      }

      const totalWorkedHrs = cycleRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0);
      const totalOtHrs = cycleRecords.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
      const totalOtPay = totalOtHrs * 100;
      const statementRef = `PM/STMT/${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, '0')}/${user.uid.substring(0, 5).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

      const formatHours = (decimalHrs: number) => {
        const hrs = Math.floor(decimalHrs);
        const mins = Math.round((decimalHrs - hrs) * 60);
        return `${hrs}h ${mins}m`;
      };

      const periodStartStr = startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const periodEndStr = endDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

      // Generate HTML for the printable invoice/letterpad
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>PrintMart Salary Statement - ${user.displayName}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&display=swap');
            
            body {
              font-family: 'Outfit', sans-serif;
              color: #1e293b;
              margin: 0;
              padding: 0;
              background-color: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            
            /* Letterhead container */
            .letterhead {
              width: 800px;
              margin: 0 auto;
              padding: 40px;
              box-sizing: border-box;
              position: relative;
              background: #ffffff;
              overflow: hidden;
            }
            
            /* Decorative Top Bar */
            .top-stripe {
              height: 8px;
              background: linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
              width: 100%;
              position: absolute;
              top: 0;
              left: 0;
            }
            
            /* Header */
            .header {
              display: flex;
              justify-content: space-between;
              align-items: flex-start;
              border-bottom: 2px solid #e2e8f0;
              padding-bottom: 25px;
              margin-bottom: 30px;
              margin-top: 10px;
            }
            
            .logo-area {
              display: flex;
              align-items: center;
              gap: 14px;
            }
            
            .logo-img-wrapper {
              display: flex;
              align-items: center;
              justify-content: center;
            }
            
            .logo-fallback {
              width: 46px;
              height: 46px;
              background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%);
              border-radius: 12px;
              display: flex;
              align-items: center;
              justify-content: center;
              color: white;
              font-size: 24px;
              font-weight: 900;
              box-shadow: 0 4px 10px rgba(99, 102, 241, 0.3);
            }
            
            .logo-text-group {
              display: flex;
              flex-direction: column;
            }
            
            .logo-text {
              font-size: 26px;
              font-weight: 900;
              letter-spacing: -0.04em;
              color: #1e1b4b;
              line-height: 1;
            }
            
            .logo-text span {
              color: #6366f1;
            }
            
            .logo-subtext {
              font-size: 9px;
              font-weight: 700;
              letter-spacing: 0.15em;
              color: #94a3b8;
              text-transform: uppercase;
              margin-top: 4px;
            }
            
            .company-info {
              text-align: right;
              font-size: 11px;
              color: #475569;
              line-height: 1.6;
              max-width: 320px;
            }
            
            .company-title {
              font-size: 13px;
              font-weight: 800;
              color: #1e1b4b;
              margin-bottom: 4px;
              letter-spacing: -0.01em;
            }
            
            .company-reg {
              font-size: 9px;
              color: #64748b;
              margin-top: 3px;
              font-weight: 500;
            }
            
            /* Watermark */
            .watermark-container {
              position: absolute;
              top: 52%;
              left: 50%;
              transform: translate(-50%, -50%) rotate(-30deg);
              text-align: center;
              pointer-events: none;
              z-index: 0;
              opacity: 0.022;
              width: 100%;
            }
            
            .watermark-text {
              font-size: 80px;
              font-weight: 900;
              letter-spacing: 14px;
              color: #6366f1;
              margin: 0;
              white-space: nowrap;
            }
            
            .watermark-sub {
              font-size: 20px;
              font-weight: 700;
              letter-spacing: 8px;
              color: #8b5cf6;
              margin-top: 5px;
              text-transform: uppercase;
            }
            
            /* Document title block */
            .doc-title-block {
              display: flex;
              justify-content: space-between;
              align-items: flex-end;
              margin-bottom: 25px;
              position: relative;
              z-index: 10;
            }
            
            .doc-title {
              font-size: 20px;
              font-weight: 800;
              letter-spacing: -0.02em;
              color: #1e1b4b;
              margin: 0;
              border-left: 4px solid #6366f1;
              padding-left: 12px;
            }
            
            .doc-date {
              font-size: 11px;
              color: #64748b;
              font-weight: 500;
            }
            
            /* Information Grid */
            .info-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 16px;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 14px;
              padding: 18px;
              margin-bottom: 30px;
              position: relative;
              z-index: 10;
            }
            
            .info-item {
              display: flex;
              flex-direction: column;
              gap: 3px;
            }
            
            .info-label {
              font-size: 9px;
              text-transform: uppercase;
              font-weight: 800;
              color: #94a3b8;
              letter-spacing: 0.06em;
            }
            
            .info-value {
              font-size: 13px;
              font-weight: 600;
              color: #1e293b;
            }
            
            .status-pill {
              display: inline-flex;
              align-items: center;
              gap: 4px;
              color: #059669;
              font-weight: 700;
            }
            
            /* Stats Summary row */
            .stats-row {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 16px;
              margin-bottom: 30px;
              position: relative;
              z-index: 10;
            }
            
            .stat-card {
              background: #ffffff;
              border: 1px solid #e2e8f0;
              border-radius: 12px;
              padding: 14px 16px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.02);
              position: relative;
              overflow: hidden;
            }
            
            .stat-card::before {
              content: '';
              position: absolute;
              left: 0;
              top: 0;
              bottom: 0;
              width: 4px;
              background-color: #cbd5e1;
            }
            
            .stat-card.blue::before {
              background-color: #6366f1;
            }
            
            .stat-card.pink::before {
              background-color: #d946ef;
            }
            
            .stat-card.green::before {
              background-color: #10b981;
            }
            
            .stat-card.highlighted {
              background: #f5f3ff;
              border-color: #ddd6fe;
            }
            
            .stat-card .info-value {
              font-size: 18px;
              font-weight: 800;
              color: #1e1b4b;
              margin-top: 4px;
            }
            
            /* Table formatting */
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 40px;
              position: relative;
              z-index: 10;
            }
            
            thead {
              display: table-header-group;
            }
            
            th {
              background-color: #f1f5f9;
              color: #475569;
              font-weight: 700;
              font-size: 10px;
              text-transform: uppercase;
              letter-spacing: 0.06em;
              padding: 10px 12px;
              border-bottom: 2px solid #e2e8f0;
              text-align: left;
            }
            
            td {
              padding: 10px 12px;
              border-bottom: 1px solid #f1f5f9;
              font-size: 11px;
              color: #334155;
            }
            
            tr {
              page-break-inside: avoid;
            }
            
            tr:nth-child(even) td {
              background-color: #fafbfc;
            }
            
            .badge {
              display: inline-block;
              padding: 2px 7px;
              font-size: 9px;
              font-weight: 700;
              border-radius: 9999px;
              text-transform: uppercase;
              letter-spacing: 0.02em;
            }
            
            .badge-present {
              background-color: #e6fcf5;
              color: #0ca678;
              border: 1px solid #c3fae8;
            }
            
            .badge-half-day {
              background-color: #fff9db;
              color: #f08c00;
              border: 1px solid #fff3bf;
            }
            
            .badge-leave {
              background-color: #fff5f5;
              color: #e03131;
              border: 1px solid #ffc9c9;
            }
            
            /* Signature section */
            .signature-section {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-top: 50px;
              padding-top: 20px;
              position: relative;
              z-index: 10;
              page-break-inside: avoid;
            }
            
            .signature-block {
              width: 180px;
              text-align: center;
            }
            
            .signature-line {
              border-top: 1px solid #94a3b8;
              margin-bottom: 6px;
            }
            
            .signature-label {
              font-size: 10px;
              color: #64748b;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.04em;
            }
            
            .signature-sub {
              font-size: 9px;
              color: #94a3b8;
              margin-top: 2px;
            }
            
            .stamp-box {
              width: 100px;
              height: 100px;
              display: flex;
              align-items: center;
              justify-content: center;
            }
            
            .stamp-circle {
              width: 80px;
              height: 80px;
              border: 2px dashed rgba(99, 102, 241, 0.35);
              border-radius: 50%;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              color: rgba(99, 102, 241, 0.45);
              font-size: 9px;
              font-weight: 800;
              letter-spacing: 0.5px;
              text-align: center;
              transform: rotate(-12deg);
            }
            
            .stamp-circle span {
              display: block;
            }
            
            .footer-note {
              margin-top: 45px;
              border-top: 1px solid #e2e8f0;
              padding-top: 12px;
              font-size: 9px;
              color: #94a3b8;
              text-align: center;
              line-height: 1.5;
              position: relative;
              z-index: 10;
              page-break-inside: avoid;
            }
            
            /* Page break rules for print */
            @media print {
              body {
                background: none;
                background-color: #ffffff;
              }
              .letterhead {
                width: 100%;
                padding: 0;
                margin: 0;
              }
              @page {
                size: A4;
                margin: 15mm;
              }
            }
          </style>
        </head>
        <body>
          <div class="letterhead">
            <!-- Top Stripe -->
            <div class="top-stripe"></div>

            <!-- Watermark -->
            <div class="watermark-container">
              <div class="watermark-text">PRINT MART</div>
              <div class="watermark-sub">OFFICIAL HOURS STATEMENT</div>
            </div>

            <!-- Header -->
            <div class="header">
              <div class="logo-area">
                <div class="logo-img-wrapper">
                  ${base64Logo
          ? `<img src="${base64Logo}" alt="PrintMart Logo" style="height: 52px; width: auto; object-fit: contain;" />`
          : `<div class="logo-fallback">P</div>`
        }
                </div>
                <div class="logo-text-group">
                  <div class="logo-text">Print<span>Mart</span></div>
                  <div class="logo-subtext">The Apparel Company</div>
                </div>
              </div>
              <div class="company-info">
                <div class="company-title">Print Mart Apparel Private Ltd.</div>
                <div>Thattarkonam</div>
                <div>Kollam, Kerala 691001</div>
                <div>Email: payroll@printmart.com | Web: www.printmart.com</div>
                <div class="company-reg">CIN: U18101TN2024PTC168420 | GSTIN: 33AADCP8420M1Z5</div>
              </div>
            </div>
            
            <!-- Document Title -->
            <div class="doc-title-block">
              <h2 class="doc-title">Employee Salary & Hours Statement</h2>
              <div class="doc-date">Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            
            <!-- Info Grid -->
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">Statement Reference</span>
                <span class="info-value" style="font-family: monospace; font-size: 14px; color: #4f46e5;">${statementRef}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Statement Period</span>
                <span class="info-value">${periodStartStr} &ndash; ${periodEndStr}</span>
              </div>
              <div class="info-item" style="margin-top: 8px;">
                <span class="info-label">Employee Details</span>
                <span class="info-value">${user.displayName}</span>
                <span style="font-size: 11px; color:#64748b; font-weight:500;">ID: EMP-${user.uid.substring(0, 8).toUpperCase()} | ${user.email}</span>
              </div>
              <div class="info-item" style="margin-top: 8px;">
                <span class="info-label">Designation & Department</span>
                <span class="info-value" style="text-transform: capitalize;">${user.designation || "Apparel Specialist"}</span>
                <span style="font-size: 11px; color:#64748b; font-weight:500;">Apparel Production Dept. | Cycle Day: ${formatOrdinal(startDay)}</span>
              </div>
            </div>
            
            <!-- Stats -->
            <div class="stats-row">
              <div class="stat-card blue">
                <span class="info-label">Standard Worked Hours</span>
                <div class="info-value">${formatHours(totalWorkedHrs - totalOtHrs)}</div>
              </div>
              <div class="stat-card pink">
                <span class="info-label">Overtime Hours</span>
                <div class="info-value" style="color: #d946ef;">${formatHours(totalOtHrs)}</div>
              </div>
              <div class="stat-card highlighted green">
                <span class="info-label">Est. Overtime Earnings</span>
                <div class="info-value" style="color: #10b981;">₹${Math.round(totalOtPay).toLocaleString('en-IN')}</div>
              </div>
            </div>
            
            <!-- Table -->
            <h3 style="font-size: 13px; font-weight: 850; text-transform: uppercase; letter-spacing: 0.05em; color: #1e1b4b; margin-bottom: 12px; border-left: 3px solid #6366f1; padding-left: 8px;">Detailed Shift Log</h3>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Punch In</th>
                  <th>Punch Out</th>
                  <th>Total Hours</th>
                  <th>Overtime</th>
                  <th>Overtime Pay</th>
                </tr>
              </thead>
              <tbody>
                ${cycleRecords.map(rec => {
          const inStr = rec.punchIn ? new Date(rec.punchIn.toDate()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : "-";
          const outStr = rec.punchOut ? new Date(rec.punchOut.toDate()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : "-";
          const otPayVal = (rec.overtimeHours || 0) * 100;
          const badgeClass = rec.status === 'present' ? 'badge-present' : rec.status === 'half-day' ? 'badge-half-day' : 'badge-leave';

          return `
                    <tr>
                      <td style="font-weight: 600; font-family: monospace;">${rec.date}</td>
                      <td><span class="badge ${badgeClass}">${rec.status}</span></td>
                      <td>${inStr}</td>
                      <td>${outStr}</td>
                      <td>${formatHours(rec.totalHours || 0)}</td>
                      <td style="font-weight: 600; color: ${rec.overtimeHours > 0 ? '#d946ef' : '#64748b'};">${rec.overtimeHours > 0 ? '+' + formatHours(rec.overtimeHours) : '-'}</td>
                      <td style="font-weight: 700; color: ${rec.overtimeHours > 0 ? '#10b981' : '#334155'};">${rec.overtimeHours > 0 ? '₹' + Math.round(otPayVal).toLocaleString('en-IN') : '₹0'}</td>
                    </tr>
                  `;
        }).join('')}
              </tbody>
            </table>
            
            <!-- Signatures -->
            <div class="signature-section">
              <div class="signature-block">
                <div style="height: 45px;"></div>
                <div class="signature-line"></div>
                <div class="signature-label">Employee Signature</div>
                <div class="signature-sub">Date: ____/____/________</div>
              </div>
              
              <div class="stamp-box">
                <div class="stamp-circle">
                  <span>PRINT MART</span>
                  <span style="font-size: 6px; font-weight: normal; margin: 2px 0;">* KOLLAM *</span>
                  <span>PAYROLL OFFICE</span>
                </div>
              </div>

              <div class="signature-block">
                <div style="height: 45px; display: flex; align-items: flex-end; justify-content: center; font-family: 'Outfit'; font-size: 11px; font-weight: bold; color: rgba(99, 102, 241, 0.6); margin-bottom: 2px;">
                  PrintMart HR Dept
                </div>
                <div class="signature-line"></div>
                <div class="signature-label">HR Payroll Administrator</div>
                <div class="signature-sub">Print Mart Apparel Private Ltd.</div>
              </div>
            </div>

            <!-- Footer Note -->
            <div class="footer-note">
              <strong>Verification Statement:</strong> This is a computer-generated statement summarizing recorded biometric punch schedules and approved leaves. Signatures verify accuracy of hours logged.
              <br />
              Generated on PrintMart Core ERP System. Confidential.
              <br />
              <span style="display: block; margin-top: 6px; font-weight: 600; color: #6366f1;">Developed by Gforx Production | Contact: 8848347162 | Email: anantharamanmac@gmail.com | Discord: https://discord.gg/42RkQ545</span>
            </div>
          </div>
        </body>
        </html>
      `;

      // Render the iframe for clean printing
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "0";
      iframe.style.height = "0";
      iframe.style.border = "0";

      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(htmlContent);
        doc.close();

        // Wait for styles/fonts/images to load, then print
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();

          // Cleanup iframe after printing dialog opens
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
        }, 500);
      }

      toast.dismiss(toastId);
      toast.success("Professional PDF statement generated!");
    } catch (error) {
      console.error("Export failed:", error);
      toast.dismiss(toastId);
      toast.error("Failed to generate PDF summary.");
    }
  };

  const triggerShake = () => {
    setIsShaking(true);
    playErrorSound();
    setTimeout(() => setIsShaking(false), 500);
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

  useEffect(() => {
    if (!attendance || !attendance.punchIn || attendance.punchOut) return;
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, [attendance]);

  const getLiveHours = () => {
    if (!attendance || !attendance.punchIn) return '0h 00m 00s';
    const punchInTime = typeof attendance.punchIn.toDate === 'function'
      ? attendance.punchIn.toDate().getTime()
      : new Date(attendance.punchIn as unknown as string).getTime();
    const breakMs = getBreakTimeMs(attendance.breaks, currentTime.getTime());
    const diffMs = Math.max(0, currentTime.getTime() - punchInTime - breakMs);
    const diffHrs = Math.max(0, diffMs / (1000 * 60 * 60));
    const hrs = Math.floor(diffHrs);
    const mins = Math.floor((diffHrs % 1) * 60);
    const secs = Math.floor((((diffHrs % 1) * 60) % 1) * 60);
    return `${hrs}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  };

  const getLiveBreakTime = () => {
    if (!attendance || !attendance.breaks || attendance.breaks.length === 0) return '';
    const lastBreak = attendance.breaks[attendance.breaks.length - 1];
    if (lastBreak.end !== null) return '';
    const breakStartTime = typeof lastBreak.start.toDate === 'function'
      ? lastBreak.start.toDate().getTime()
      : new Date(lastBreak.start as unknown as string).getTime();
    const diffMs = currentTime.getTime() - breakStartTime;
    const diffHrs = Math.max(0, diffMs / (1000 * 60 * 60));
    const hrs = Math.floor(diffHrs);
    const mins = Math.floor((diffHrs % 1) * 60);
    const secs = Math.floor((((diffHrs % 1) * 60) % 1) * 60);
    if (hrs > 0) {
      return `${hrs}h ${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
    }
    return `${mins}m ${String(secs).padStart(2, '0')}s`;
  };


  const formatHrsMins = (decimalHrs: number) => {
    const hrs = Math.floor(decimalHrs);
    const mins = Math.round((decimalHrs - hrs) * 60);
    return `${hrs}h ${mins}m`;
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

    let locationData: { latitude: number; longitude: number; accuracy?: number } | undefined = undefined;

    setVerifyingLocation(true);
    try {
      // If user is assigned to work in office, we must fetch and verify coordinates
      if (user.workMode !== 'remote') {
        let position: GeolocationPosition;
        try {
          position = await getCoordinates();
          locationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
        } catch (geoError) {
          console.error("GPS Error:", geoError);
          triggerShake();
          toast.error("Location access is required to punch in for Office shifts. Please enable location services.");
          setVerifyingLocation(false);
          return;
        }

        // Fetch office settings from database
        const officeSettings = await getOfficeSettings();
        const distance = calculateDistance(
          locationData.latitude,
          locationData.longitude,
          officeSettings.latitude,
          officeSettings.longitude
        );

        if (distance > officeSettings.radius) {
          const distStr = distance >= 1000
            ? `${(distance / 1000).toFixed(2)} km`
            : `${Math.round(distance)}m`;
          const radStr = officeSettings.radius >= 1000
            ? `${(officeSettings.radius / 1000).toFixed(2)} km`
            : `${officeSettings.radius}m`;

          triggerShake();
          toast.error(
            `Access Denied: You are ${distStr} away from the office. Office punch-in is only allowed within ${radStr}.`,
            { duration: 6000 }
          );
          setVerifyingLocation(false);
          return;
        }
      } else {
        // Remote user: optionally attempt to log coordinates but don't enforce
        try {
          const position = await getCoordinates();
          locationData = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
          };
        } catch {
          // Ignore location error for remote users
          console.log("Remote worker location not shared or failed.");
        }
      }

      await punchIn(user.uid, user.workMode || 'office', locationData);
      await loadAttendance(user.uid);
      playCheckInSound();
      triggerBurst(clientX, clientY, ['#34d399', '#059669', '#10b981', '#6ee7b7', '#a7f3d0']);
      toast.success("Successfully punched in!");
    } catch (error) {
      console.error("Error punching in:", error);
      toast.error("Error punching in.");
    } finally {
      setVerifyingLocation(false);
    }
  };

  const handlePunchOut = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!user) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX || (rect.left + rect.width / 2);
    const clientY = e.clientY || (rect.top + rect.height / 2);

    let locationData: { latitude: number; longitude: number; accuracy?: number } | undefined = undefined;

    setVerifyingLocation(true);
    try {
      // Attempt to get location for logs, don't block punch out even if GPS fails
      try {
        const position = await getCoordinates();
        locationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
      } catch {
        console.log("Punch out location not recorded.");
      }

      await punchOut(user.uid, locationData);
      await loadAttendance(user.uid);
      playCheckOutSound();
      triggerBurst(clientX, clientY, ['#f87171', '#ef4444', '#dc2626', '#fca5a5', '#fb7185']);
      toast.success("Successfully punched out!");
    } catch (error) {
      console.error("Error punching out:", error);
      toast.error("Error punching out.");
    } finally {
      setVerifyingLocation(false);
    }
  };

  const handlePauseWork = async () => {
    if (!user) return;
    try {
      await pauseWork(user.uid);
      await loadAttendance(user.uid);
      toast.success("Work paused. Have a nice break!");
    } catch (error) {
      console.error("Error pausing work:", error);
      toast.error("Error pausing work.");
    }
  };

  const handleResumeWork = async () => {
    if (!user) return;
    try {
      await resumeWork(user.uid);
      await loadAttendance(user.uid);
      toast.success("Welcome back! Work resumed.");
    } catch (error) {
      console.error("Error resuming work:", error);
      toast.error("Error resuming work.");
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
    } catch {
      toast.error("Error applying for leave.");
    }
  };

  const handlePolishTask = async () => {
    if (!taskText.trim()) return;
    setIsPolishing(true);
    const toastId = toast.loading("AI is refining your task log...");
    try {
      const response = await fetch('/api/ai/polish-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskText: taskText.trim() }),
      });
      const data = await response.json();
      if (data.polishedText) {
        setTaskText(data.polishedText);
        toast.success("Task descriptions refined by AI!", { id: toastId });
      } else {
        toast.error(data.error || "Failed to refine task log.", { id: toastId });
      }
    } catch (error) {
      console.error("AI polish failed:", error);
      toast.error("Error connecting to AI service.", { id: toastId });
    } finally {
      setIsPolishing(false);
    }
  };

  const handleTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !taskText.trim()) return;

    try {
      await submitWorkTask(user.uid, taskText.trim());
      setTaskText('');
      toast.success("Task submitted successfully!");
    } catch {
      toast.error("Error submitting task.");
    }
  };

  if (!user || loading) return <PrinterLoader text="Loading Workspace..." fullscreen />;

  const isLeave = attendance && attendance.status === 'leave' && !attendance.punchIn;
  const isPunchedIn = attendance && attendance.punchIn && !attendance.punchOut;
  const isPunchedOut = attendance && attendance.punchOut;
  const isOnBreak = !!(attendance && attendance.breaks && attendance.breaks.some(b => b.end === null));

  const todayDay = new Date().getDate();
  const isSalaryDate = todayDay === (user.salaryStartDay || 1);

  // Helper to calculate days remaining until the next occurrence of salaryStartDay
  const getDaysUntilSalaryDay = (today: Date, salaryStartDay: number): number => {
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDate = today.getDate();

    let targetDate: Date;
    if (currentDate <= salaryStartDay) {
      targetDate = new Date(currentYear, currentMonth, salaryStartDay);
    } else {
      targetDate = new Date(currentYear, currentMonth + 1, salaryStartDay);
    }

    const d1 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const d2 = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());

    const diffMs = d2.getTime() - d1.getTime();
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
  };

  const getSalaryEndDate = (today: Date, salaryStartDay: number): Date => {
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDate = today.getDate();

    if (currentDate <= salaryStartDay) {
      return new Date(currentYear, currentMonth, salaryStartDay);
    } else {
      return new Date(currentYear, currentMonth + 1, salaryStartDay);
    }
  };

  const daysUntilSalary = user.salaryStartDay !== undefined ? getDaysUntilSalaryDay(new Date(), user.salaryStartDay) : -1;
  const showReminder = user.salaryStartDay !== undefined && daysUntilSalary > 0 && daysUntilSalary <= 2;
  const salaryEndDate = user.salaryStartDay !== undefined ? getSalaryEndDate(new Date(), user.salaryStartDay) : null;
  const formattedSalaryEndDate = salaryEndDate ? salaryEndDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

  return (
    <>
      <WelcomeModal displayName={user.displayName} photoURL={user.photoURL} />
      <SalaryNotificationModal salaryStartDay={user.salaryStartDay} />
      <Navbar user={user} />
      <main className={`container animate-fade-in ${isShaking ? 'animate-shake' : ''}`}>
        <h1 className="title !text-4xl mb-8">Worker Dashboard</h1>

        {/* Salary Cycle Ending Reminder Banner */}
        {showReminder && (
          <div className="glass-card mb-8 border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-yellow-500/10 shadow-[0_0_30px_rgba(245,158,11,0.15)] flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 relative overflow-hidden group">
            {/* Visual ambient light shapes */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-orange-500/10 rounded-full blur-2xl pointer-events-none" />

            <style dangerouslySetInnerHTML={{
              __html: `
              @keyframes float-slow-banner-key {
                0%, 100% { transform: translateY(0px) scale(1); }
                50% { transform: translateY(-6px) scale(1.05); }
              }
            ` }} />

            <div className="flex gap-4 items-start text-left relative z-10">
              <div
                className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500/20 to-orange-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 text-3xl flex-shrink-0 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                style={{ animation: 'float-slow-banner-key 3s ease-in-out infinite' }}
              >
                🔔
              </div>
              <div>
                <h3 className="text-xl font-bold text-white mb-1 tracking-tight">
                  Salary Cycle Ending Soon!
                </h3>
                <p className="text-sm text-secondary leading-relaxed max-w-xl">
                  Your salary cycle ends {daysUntilSalary === 1 ? 'tomorrow' : `in ${daysUntilSalary} days`} on <strong className="text-amber-300 font-extrabold">{formattedSalaryEndDate}</strong>. Please ensure all your tasks are logged and attendance records are up to date.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Salary Date Export Summary Banner */}
        {isSalaryDate && (
          <div className="glass-card mb-8 border border-indigo-500/30 bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-pink-500/10 shadow-[0_0_30px_rgba(99,102,241,0.15)] flex flex-col md:flex-row md:items-center justify-between gap-6 p-6 relative overflow-hidden group">
            {/* Visual ambient light shapes */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-pink-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex gap-4 items-start text-left relative z-10">
              <div
                className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500/20 to-purple-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 text-3xl flex-shrink-0 shadow-[0_0_15px_rgba(99,102,241,0.2)] animate-float-slow-banner"
                style={{ animation: 'float-slow-banner-key 3s ease-in-out infinite' }}
              >
                📅
              </div>
              <div>
                <style dangerouslySetInnerHTML={{
                  __html: `
                  @keyframes float-slow-banner-key {
                    0%, 100% { transform: translateY(0px) scale(1); }
                    50% { transform: translateY(-6px) scale(1.05); }
                  }
                  .salary-export-btn {
                    position: relative;
                    z-index: 10;
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 12px 24px;
                    font-family: var(--font-sans);
                    font-weight: 800;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.1em;
                    color: #ffffff !important;
                    background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #ec4899 100%) !important;
                    border: none !important;
                    border-radius: 12px !important;
                    box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4) !important;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    overflow: hidden;
                    white-space: nowrap;
                  }
                  .salary-export-btn:hover {
                    transform: translateY(-2px) scale(1.02);
                    box-shadow: 0 8px 25px rgba(236, 72, 153, 0.6) !important;
                    filter: brightness(1.1);
                  }
                  .salary-export-btn:active {
                    transform: translateY(0px) scale(0.98);
                  }
                  .salary-export-btn::after {
                    content: '';
                    position: absolute;
                    top: -50%;
                    left: -60%;
                    width: 30%;
                    height: 200%;
                    background: rgba(255, 255, 255, 0.3);
                    transform: rotate(30deg);
                    transition: none;
                  }
                  .salary-export-btn:hover::after {
                    left: 130%;
                    transition: all 0.6s ease-in-out;
                  }
                ` }} />
                <h3 className="text-xl font-bold text-white mb-1 tracking-tight">
                  Salary Cycle Completed!
                </h3>
                <p className="text-sm text-secondary leading-relaxed max-w-xl">
                  Today is your configured salary cycle day (<strong className="text-indigo-300 font-extrabold">{formatOrdinal(user.salaryStartDay || 1)}</strong>). Export your professional, branded letterhead PDF statement showing detailed shift records and overtime summaries for the completed cycle.
                </p>
              </div>
            </div>
            <button
              onClick={handleExportSalaryPDF}
              className="salary-export-btn self-start md:self-center"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mr-0.5 animate-bounce" style={{ animationDuration: '2s' }}>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export Cycle PDF
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

          {/* Attendance Card */}
          <div className="glass-card flex flex-col items-center text-center">
            <h2 className="subtitle !text-xl !text-white !mb-2">Time Tracking</h2>
            <div className="flex gap-2 items-center mb-8 justify-center">
              <p className="text-sm text-secondary">{getTodayDateString()}</p>
              <span className="w-1 h-1 rounded-full bg-white/30" />
              <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${user.workMode === 'remote'
                ? 'text-pink-400 bg-pink-500/10 border border-pink-500/20'
                : 'text-teal-400 bg-teal-500/10 border border-teal-500/20'
                }`}>
                {user.workMode === 'remote' ? 'Remote Shift' : 'Office Shift'}
              </span>
            </div>

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
                  <span className={`badge ${attendance.status === 'present' ? 'badge-worker' :
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
                <div className={isPunchedIn ? (isOnBreak ? "pulse-glowing-ring-amber animate-fade-in" : "pulse-glowing-ring animate-fade-in") : "pulse-glowing-ring-green animate-fade-in"}>
                  <button
                    onClick={(e) => isPunchedIn ? handlePunchOut(e) : handlePunchIn(e)}
                    disabled={verifyingLocation}
                    className={`w-48 h-48 rounded-full flex flex-col items-center justify-center text-center overflow-hidden text-xl font-bold transition-all duration-300 ${verifyingLocation
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600 opacity-80 cursor-not-allowed shadow-[0_0_30px_rgba(99,102,241,0.4)] border-4 border-purple-400'
                      : isPunchedIn
                        ? 'bg-gradient-to-br from-orange-500 to-red-600 shadow-[0_0_30px_rgba(239,68,68,0.4)] hover:shadow-[0_0_50px_rgba(239,68,68,0.6)] border-4 border-red-400'
                        : 'bg-gradient-to-br from-teal-400 to-emerald-600 shadow-[0_0_30px_rgba(16,185,129,0.4)] hover:shadow-[0_0_50px_rgba(16,185,129,0.6)] border-4 border-emerald-400'
                      }`}
                  >
                    <span className="text-white drop-shadow-md leading-tight px-4">
                      {verifyingLocation ? 'LOCATING...' : (isPunchedIn ? 'PUNCH OUT' : 'PUNCH IN')}
                    </span>
                    {isPunchedIn && (
                      <div className="flex flex-col items-center mt-1">
                        <span className="text-xs font-semibold text-amber-300 animate-pulse">
                          {getLiveHours()} {isOnBreak ? '(Paused)' : ''}
                        </span>
                        <span className="text-[10px] font-normal mt-1 text-white/90 bg-black/20 px-2 py-0.5 rounded-full">
                          In: {new Date(attendance.punchIn.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                  </button>
                </div>

                {isPunchedIn && user.workMode === 'remote' && (
                  <div className="flex flex-col items-center mt-6">
                    <button
                      onClick={isOnBreak ? handleResumeWork : handlePauseWork}
                      className={`btn ${isOnBreak ? 'btn-resume' : 'btn-pause'}`}
                    >
                      {isOnBreak ? (
                        <>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                          </svg>
                          Resume Work
                        </>
                      ) : (
                        <>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="6" y="4" width="4" height="16"></rect>
                            <rect x="14" y="4" width="4" height="16"></rect>
                          </svg>
                          Pause Break
                        </>
                      )}
                    </button>
                    {isOnBreak && (
                      <p className="mt-3 text-sm font-semibold text-amber-400 animate-pulse bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                        Break Time: {getLiveBreakTime()}
                      </p>
                    )}
                  </div>
                )}

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

                <a
                  href="/overtime-calculator"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-6 text-xs font-semibold text-indigo-400 hover:text-white underline transition-colors flex items-center gap-1.5 justify-center"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <line x1="9" y1="9" x2="15" y2="9" />
                    <line x1="9" y1="13" x2="15" y2="13" />
                    <line x1="9" y1="17" x2="15" y2="17" />
                  </svg>
                  Open Overtime Calculator
                </a>

                <a
                  href="/salary-settings"
                  className="mt-3 text-xs font-semibold text-purple-400 hover:text-white underline transition-colors flex items-center gap-1.5 justify-center"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  Salary Cycle Settings
                </a>
              </>
            )}
          </div>

          {/* Task Submission Card */}
          <div className="glass-card">
            <h2 className="subtitle !text-xl !text-white !mb-6">Log Work Task</h2>
            <form onSubmit={handleTaskSubmit} className="flex flex-col h-full">
              <div className="input-group flex-grow">
                <div className="flex justify-between items-center mb-2">
                  <label className="input-label mb-0">What did you work on today?</label>
                  {taskText.trim() && (
                    <button
                      type="button"
                      onClick={handlePolishTask}
                      disabled={isPolishing}
                      className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/25"
                    >
                      {isPolishing ? (
                        <>
                          <svg className="animate-spin h-3 w-3 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Polishing...
                        </>
                      ) : (
                        <>✨ AI Refine</>
                      )}
                    </button>
                  )}
                </div>
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
      {/* Floating AI Assistant Chatbot */}
      <AIChatbot user={user} />
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
