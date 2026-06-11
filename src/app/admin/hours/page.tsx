"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { getAllUsers, getAttendanceForDateRange, AttendanceRecord, getBreakTimeMs, getTodayDateString, getUserAttendanceHistory } from '@/lib/db';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';
import Pagination from '@/components/Pagination';
import { toast } from 'react-hot-toast';

interface SalaryCycleOption {
  label: string;
  startDate: Date;
  endDate: Date;
  key: string;
}

const getRecentSalaryCycles = (startDay: number): SalaryCycleOption[] => {
  const options: SalaryCycleOption[] = [];
  const today = new Date();
  
  for (let i = 0; i < 6; i++) {
    const tempDate = new Date(today.getFullYear(), today.getMonth() - i, startDay);
    const startDate = new Date(tempDate.getFullYear(), tempDate.getMonth() - 1, startDay);
    const endDate = new Date(tempDate.getFullYear(), tempDate.getMonth(), startDay);
    
    const label = `${startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} - ${endDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    const key = `${startDate.getFullYear()}-${String(startDate.getMonth()).padStart(2, '0')}`;
    
    options.push({
      label,
      startDate,
      endDate,
      key
    });
  }
  return options;
};

export default function AdminHours() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [allUsers, setAllUsers] = useState<AppUser[]>([]);
  const [allAttendance, setAllAttendance] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchName, setSearchName] = useState('');
  const [now, setNow] = useState(new Date());

  // Sorting states
  const [sortBy, setSortBy] = useState<'name' | 'totalHours' | 'overtimeHours' | 'pay' | 'salaryStartDay' | 'periodStartDate' | 'periodEndDate'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Export PDF states
  const [selectedUserForExport, setSelectedUserForExport] = useState<AppUser | null>(null);
  const [selectedCycleIndex, setSelectedCycleIndex] = useState<number>(0);
  const [showExportModal, setShowExportModal] = useState(false);

  const handleOpenExportModal = (user: AppUser) => {
    setSelectedUserForExport(user);
    setSelectedCycleIndex(0);
    setShowExportModal(true);
  };

  const handleExportSalaryPDF = async (user: AppUser, cycleIdx: number) => {
    const toastId = toast.loading("Generating professional PDF...");

    try {
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

      const startDay = user.salaryStartDay || 1;
      const cycles = getRecentSalaryCycles(startDay);
      const selectedCycle = cycles[cycleIdx];
      const startDate = selectedCycle.startDate;
      const endDate = selectedCycle.endDate;

      const cycleRecords = history.filter(rec => {
        const recDate = new Date(rec.date);
        return recDate >= startDate && recDate <= endDate;
      }).sort((a, b) => a.date.localeCompare(b.date));

      if (cycleRecords.length === 0) {
        toast.dismiss(toastId);
        toast.error("No attendance records found for the selected cycle.");
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
            
            .letterhead {
              width: 800px;
              margin: 0 auto;
              padding: 40px;
              box-sizing: border-box;
              position: relative;
              background: #ffffff;
              overflow: hidden;
            }
            
            .top-stripe {
              height: 8px;
              background: linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #ec4899 100%);
              width: 100%;
              position: absolute;
              top: 0;
              left: 0;
            }
            
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
            <div class="top-stripe"></div>
            <div class="watermark-container">
              <div class="watermark-text">PRINT MART</div>
              <div class="watermark-sub">OFFICIAL HOURS STATEMENT</div>
            </div>
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
            
            <div class="doc-title-block">
              <h2 class="doc-title">Employee Salary & Hours Statement</h2>
              <div class="doc-date">Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
            </div>
            
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

        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();

          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
        }, 500);
      }

      toast.dismiss(toastId);
      toast.success("Professional PDF statement generated!");
      setShowExportModal(false);
    } catch (error) {
      console.error("Export failed:", error);
      toast.dismiss(toastId);
      toast.error("Failed to generate PDF summary.");
    }
  };
  const formatHrsMins = (decimalHrs: number) => {
    const hrs = Math.floor(decimalHrs);
    const mins = Math.round((decimalHrs - hrs) * 60);
    return `${hrs}h ${mins}m`;
  };

  const getInitialDates = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = d.getMonth();
    const firstDay = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDayDate = new Date(y, m + 1, 0);
    const lastDay = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDayDate.getDate()).padStart(2, '0')}`;
    return { firstDay, lastDay };
  };
  const { firstDay, lastDay } = getInitialDates();
  const [startDateFilter, setStartDateFilter] = useState(firstDay);
  const [endDateFilter, setEndDateFilter] = useState(lastDay);

  // Pagination State
  const [reportPage, setReportPage] = useState(1);

  // Reset page when filters change
  useEffect(() => {
    setTimeout(() => {
      setReportPage(1);
    }, 0);
  }, [searchName, startDateFilter, endDateFilter, sortBy, sortOrder]);

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

  const loadData = async (start: string, end: string) => {
    await Promise.resolve();
    setLoading(true);
    try {
      const [usersList, attendanceList] = await Promise.all([
        getAllUsers(),
        getAttendanceForDateRange(start, end)
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

  useEffect(() => {
    if (!currentUser) return;
    const t = setTimeout(() => {
      loadData(startDateFilter, endDateFilter);
    }, 0);
    return () => clearTimeout(t);
  }, [currentUser, startDateFilter, endDateFilter]);

  useEffect(() => {
    if (!currentUser) return;

    // Silent background refresh every 1 minute
    const interval = setInterval(() => {
      loadData(startDateFilter, endDateFilter);
    }, 60000);

    return () => clearInterval(interval);
  }, [currentUser, startDateFilter, endDateFilter]);

  if (!currentUser || loading) return <PrinterLoader text="Loading Employee Reports..." fullscreen type="tshirt" />;

  // Filter users by search query
  const filteredUsers = allUsers.filter(u =>
    u.displayName.toLowerCase().includes(searchName.toLowerCase())
  );



  const formatOrdinal = (day: number) => {
    if (day === 11 || day === 12 || day === 13) return `${day}th`;
    const lastDigit = day % 10;
    if (lastDigit === 1) return `${day}st`;
    if (lastDigit === 2) return `${day}nd`;
    if (lastDigit === 3) return `${day}rd`;
    return `${day}th`;
  };

  const userStatsList = filteredUsers.map(user => {
    const records = allAttendance.filter(a =>
      a.userId === user.uid &&
      a.date >= startDateFilter &&
      a.date <= endDateFilter
    );

    const presentDays = records.filter(r => r.status === 'present').length;
    const halfDays = records.filter(r => r.status === 'half-day').length;
    const leaveDays = records.filter(r => r.status === 'leave').length;
    const workingDays = presentDays + halfDays;

    const totalHours = records.reduce((sum, r) => {
      if (r.punchOut) return sum + (r.totalHours || 0);
      if (!r.punchIn) return sum;
      
      // Past unclosed sessions do not calculate live active hours
      if (r.date !== getTodayDateString()) return sum;

      const inTime = typeof r.punchIn.toDate === 'function' ? r.punchIn.toDate().getTime() : new Date(r.punchIn as unknown as string).getTime();
      const breakMs = getBreakTimeMs(r.breaks, now.getTime());
      const activeHrs = Math.max(0, (now.getTime() - inTime - breakMs) / (1000 * 60 * 60));
      return sum + activeHrs;
    }, 0);

    const overtimeHours = records.reduce((sum, r) => {
      if (r.punchOut) return sum + (r.overtimeHours || 0);
      if (!r.punchIn) return sum;
      
      // Past unclosed sessions do not calculate live overtime hours
      if (r.date !== getTodayDateString()) return sum;

      const inTime = typeof r.punchIn.toDate === 'function' ? r.punchIn.toDate().getTime() : new Date(r.punchIn as unknown as string).getTime();
      const breakMs = getBreakTimeMs(r.breaks, now.getTime());
      const activeHrs = Math.max(0, (now.getTime() - inTime - breakMs) / (1000 * 60 * 60));
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

  // Sort user stats
  const sortedUserStatsList = [...userStatsList].sort((a, b) => {
    let comparison = 0;
    if (sortBy === 'name') {
      comparison = a.user.displayName.localeCompare(b.user.displayName);
    } else if (sortBy === 'totalHours') {
      comparison = a.totalHours - b.totalHours;
    } else if (sortBy === 'overtimeHours') {
      comparison = a.overtimeHours - b.overtimeHours;
    } else if (sortBy === 'pay') {
      comparison = a.overtimeHours - b.overtimeHours; // directly proportional
    } else if (sortBy === 'salaryStartDay' || sortBy === 'periodStartDate' || sortBy === 'periodEndDate') {
      comparison = (a.user.salaryStartDay || 1) - (b.user.salaryStartDay || 1);
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  // Calculate cumulative stats for all matching users
  const totalHoursLogged = userStatsList.reduce((sum, u) => sum + u.totalHours, 0);
  const totalOvertimeLogged = userStatsList.reduce((sum, u) => sum + u.overtimeHours, 0);

  const ITEMS_PER_PAGE = 10;
  const totalReportPages = Math.ceil(sortedUserStatsList.length / ITEMS_PER_PAGE);
  const activeReportPage = Math.min(reportPage, Math.max(1, totalReportPages));
  const startIndex = (activeReportPage - 1) * ITEMS_PER_PAGE;
  const paginatedUserStatsList = sortedUserStatsList.slice(startIndex, startIndex + ITEMS_PER_PAGE);

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
                  <div className="text-xs font-bold text-pink-400 mt-1">
                    Est. Overtime Pay: ₹{Math.round(totalOvertimeLogged * 100).toLocaleString('en-IN')}
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
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xs text-white font-semibold uppercase tracking-wider">Report Controls</h2>
                <a
                  href="/overtime-calculator"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="open-calendar-trigger !py-1 !px-2.5 !text-xs"
                >
                  🧮 Calculator Tool
                </a>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
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
                  <label className="text-xs text-secondary mb-1 block">Start Date</label>
                  <input
                    type="date"
                    className="input-field w-full !py-1.5 !px-3 !text-sm"
                    value={startDateFilter}
                    onChange={(e) => setStartDateFilter(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-secondary mb-1 block">End Date</label>
                  <input
                    type="date"
                    className="input-field w-full !py-1.5 !px-3 !text-sm"
                    value={endDateFilter}
                    onChange={(e) => setEndDateFilter(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-secondary mb-1 block">Sort Employees By</label>
                  <select
                    className="input-field w-full !py-1.5 !px-3 !text-sm"
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'name' | 'totalHours' | 'overtimeHours' | 'pay' | 'salaryStartDay' | 'periodStartDate' | 'periodEndDate')}
                  >
                    <option value="name">Name</option>
                    <option value="totalHours">Total Hours Worked</option>
                    <option value="overtimeHours">Overtime Hours</option>
                    <option value="pay">Estimated Pay</option>
                    <option value="periodStartDate">Period Start Date</option>
                    <option value="periodEndDate">Period End Date</option>
                    <option value="salaryStartDay">Salary Cycle Day</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-secondary mb-1 block">Sort Order</label>
                  <select
                    className="input-field w-full !py-1.5 !px-3 !text-sm"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
                  >
                    <option value="asc">Ascending 📈</option>
                    <option value="desc">Descending 📉</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Hours list panel */}
            <div className="glass-card">
              <h2 className="subtitle !text-xl !text-white !mb-4">Work Hours & Days Report</h2>
              {sortedUserStatsList.length === 0 ? (
                <p className="text-secondary text-sm">No employees match your search criteria.</p>
              ) : (
                <>
                  <div className="flex flex-col gap-4 max-h-[600px] overflow-y-auto pr-2 mb-2">
                    {paginatedUserStatsList.map(({ user, workingDays, presentDays, halfDays, leaveDays, totalHours, overtimeHours }) => {
                      // Compute periods range dates
                      const startDay = user.salaryStartDay || 1;
                      const [y, mVal] = startDateFilter.split('-').map(Number);
                      const m = mVal - 1; // 0-indexed
                      const sDate = new Date(y, m, startDay);
                      const eDate = new Date(y, m + 1, startDay);
                      const formatOption: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
                      const periodRangeStr = `${sDate.toLocaleDateString('en-US', formatOption)} - ${eDate.toLocaleDateString('en-US', formatOption)}`;

                      return (
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
                          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4 flex-1 md:flex-none justify-items-start md:justify-items-end text-sm items-center">
                            <div>
                              <div className="text-[10px] text-secondary uppercase font-bold">Salary Cycle</div>
                              <div className="font-semibold text-purple-400 mt-0.5 text-xs flex flex-col items-start md:items-end">
                                <span>{periodRangeStr}</span>
                                <span className="text-[9px] text-secondary">Start: {formatOrdinal(startDay)}</span>
                              </div>
                            </div>
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
                                {formatHrsMins(totalHours)} <span className="text-[10px] text-secondary font-normal font-sans">({totalHours.toFixed(1)}h)</span>
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-secondary uppercase font-bold">Overtime</div>
                              <div className={`font-semibold mt-0.5 ${overtimeHours > 0 ? 'text-pink-500 font-extrabold' : 'text-secondary'}`}>
                                {formatHrsMins(overtimeHours)} <span className="text-[10px] opacity-75 font-normal font-sans">({overtimeHours.toFixed(1)}h)</span>
                              </div>
                              {overtimeHours > 0 && (
                                <div className="text-[10px] text-pink-400 font-semibold mt-0.5">
                                  Est. Pay: ₹{Math.round(overtimeHours * 100).toLocaleString('en-IN')}
                                </div>
                              )}
                            </div>
                            <div className="col-span-2 sm:col-span-1 flex items-center justify-end w-full">
                              <button
                                onClick={() => handleOpenExportModal(user)}
                                className="btn btn-primary !py-1.5 !px-3.5 !text-xs"
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', width: 'auto' }}
                              >
                                <span>📄 Export</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <Pagination
                    totalItems={sortedUserStatsList.length}
                    itemsPerPage={ITEMS_PER_PAGE}
                    currentPage={activeReportPage}
                    onPageChange={setReportPage}
                    label="employees"
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Export Modal Overlay */}
      {showExportModal && selectedUserForExport && (
        <div className="welcome-modal-overlay" style={{ zIndex: 10000 }}>
          <div className="welcome-modal-card animate-scale-up" style={{ maxWidth: '480px', width: '90%', background: 'var(--bg-surface)' }}>
            <div className="welcome-modal-grid-pattern" />
            <div className="welcome-modal-orb welcome-modal-orb-1" />
            <div className="welcome-modal-orb welcome-modal-orb-2" />
            <div className="welcome-modal-accent" style={{ background: 'linear-gradient(90deg, var(--sapphire), var(--sapphire-light))' }} />

            {/* Close Button */}
            <button 
              onClick={() => setShowExportModal(false)} 
              className="welcome-modal-close"
              aria-label="Close export dialog"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>

            {/* Title */}
            <h3 className="welcome-modal-title" style={{ fontSize: '1.4rem', marginBottom: '0.5rem', textAlign: 'left' }}>
              Export Salary Statement
            </h3>
            <p className="text-secondary text-xs mb-6">
              Generate a professional, branded PDF statement showing detailed shift records and overtime summaries.
            </p>

            {/* Employee info */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '1rem', marginBottom: '1.25rem', textAlign: 'left' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Selected Employee</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginTop: '0.25rem' }}>
                {selectedUserForExport.displayName}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.1rem' }}>
                {selectedUserForExport.email}
              </div>
            </div>

            {/* Cycle Selector */}
            <div className="input-group" style={{ marginBottom: '1.5rem', textAlign: 'left' }}>
              <label className="input-label text-xs font-semibold">Select Salary Cycle</label>
              <select
                className="input-field"
                value={selectedCycleIndex}
                onChange={(e) => setSelectedCycleIndex(Number(e.target.value))}
              >
                {getRecentSalaryCycles(selectedUserForExport.salaryStartDay || 1).map((cycle, idx) => (
                  <option key={cycle.key} value={idx}>
                    {cycle.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
              <button 
                onClick={() => handleExportSalaryPDF(selectedUserForExport, selectedCycleIndex)}
                className="btn btn-primary flex-grow"
              >
                📄 Generate & Export
              </button>
              <button 
                onClick={() => setShowExportModal(false)}
                className="btn btn-outline"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
