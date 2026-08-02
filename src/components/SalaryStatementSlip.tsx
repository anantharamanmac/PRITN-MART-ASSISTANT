"use client";

import React, { useRef, useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { AppUser } from '@/lib/auth';
import { AttendanceRecord } from '@/lib/db';

interface SalaryStatementSlipProps {
  user: AppUser;
  cycleRecords: AttendanceRecord[];
  startDate: Date;
  endDate: Date;
  onClose: () => void;
}

export default function SalaryStatementSlip({
  user,
  cycleRecords,
  startDate,
  endDate,
  onClose
}: SalaryStatementSlipProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [base64Logo, setBase64Logo] = useState("");
  const [statementRef, setStatementRef] = useState("");

  // Generate reference number once on mount
  useEffect(() => {
    const periodStr = `${startDate.getFullYear()}${String(startDate.getMonth() + 1).padStart(2, '0')}`;
    const rand = Math.floor(100 + Math.random() * 900);
    const ref = `PM/STMT/${periodStr}/${user.uid.substring(0, 5).toUpperCase()}-${rand}`;
    setStatementRef(ref);
  }, [startDate, user.uid]);

  // Fetch PrintMart Logo and convert it to Base64 for inline inclusion
  useEffect(() => {
    async function loadLogo() {
      try {
        const logoUrl = `${window.location.origin}/logo.png`;
        const logoRes = await fetch(logoUrl);
        if (logoRes.ok) {
          const blob = await logoRes.blob();
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          setBase64Logo(base64);
        }
      } catch (err) {
        console.warn("Could not load logo.png for PDF fallback.", err);
      }
    }
    loadLogo();
  }, []);

  const formatOrdinal = (day: number) => {
    if (day === 11 || day === 12 || day === 13) return `${day}th`;
    const lastDigit = day % 10;
    if (lastDigit === 1) return `${day}st`;
    if (lastDigit === 2) return `${day}nd`;
    if (lastDigit === 3) return `${day}rd`;
    return `${day}th`;
  };

  const formatHours = (decimalHrs: number) => {
    const hrs = Math.floor(decimalHrs);
    const mins = Math.round((decimalHrs - hrs) * 60);
    return `${hrs}h ${mins}m`;
  };

  const totalWorkedHrs = cycleRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0);
  const totalOtHrs = cycleRecords.reduce((sum, r) => sum + (r.overtimeHours || 0), 0);
  const totalOtPay = totalOtHrs * 100;
  const startDay = user.salaryStartDay || 1;

  const periodStartStr = startDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const periodEndStr = endDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = `Salary_Statement_${user.displayName.replace(/\s+/g, '_')}`;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    const fileName = `Salary_Statement_${user.displayName.replace(/\s+/g, '_')}_${startDate.getFullYear()}_${String(startDate.getMonth() + 1).padStart(2, '0')}.pdf`;

    setDownloadingPdf(true);
    toast.loading(`Generating PDF ${fileName}...`, { id: 'pdf-statement-download' });

    try {
      // Dynamic import standalone html2pdf bundle
      // @ts-ignore
      const html2pdfModule = await import('html2pdf.js/dist/html2pdf.bundle.min.js');
      const html2pdf = html2pdfModule.default || html2pdfModule || (window as any).html2pdf;

      const element = printRef.current;
      const opt = {
        margin: [8, 8, 8, 8] as [number, number, number, number],
        filename: fileName,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
      };

      await html2pdf().from(element).set(opt).save();
      toast.dismiss('pdf-statement-download');
      toast.success(`Downloaded ${fileName}!`);
    } catch (err) {
      toast.dismiss('pdf-statement-download');
      console.error('Error generating PDF:', err);
      toast.error('PDF export failed. Opening print dialog...');
      handlePrint();
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="salary-modal-wrapper" style={{ padding: '1rem', color: '#000000' }}>
      {/* Top Controls Bar (Hidden in Print) */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Statement Preview: {user.displayName}
          </h3>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Period: {periodStartStr} - {periodEndStr}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {/* Download PDF Button */}
          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={downloadingPdf}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '8px',
              border: 'none',
              background: '#10b981',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
              opacity: downloadingPdf ? 0.7 : 1
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
            <span>{downloadingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
          </button>

          {/* Print Button */}
          <button
            type="button"
            onClick={handlePrint}
            style={{
              padding: '0.55rem 1.25rem',
              borderRadius: '8px',
              border: 'none',
              background: '#3b82f6',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
            <span>Print Slip</span>
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '0.55rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          )}
        </div>
      </div>

      {/* ── PRINTABLE A4 STATEMENT SHEET ── */}
      <div style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div
          ref={printRef}
          className="printable-salary-sheet"
          style={{
            background: '#ffffff',
            color: '#1e293b',
            fontFamily: "'Outfit', 'Arial', sans-serif",
            padding: '40px',
            border: '1px solid #e2e8f0',
            boxSizing: 'border-box',
            width: '100%',
            maxWidth: '800px',
            minWidth: '600px',
            minHeight: '280mm',
            margin: '0 auto',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between'
          }}
        >
          <div>
            {/* Top Stripe */}
            <div style={{
              height: '8px',
              background: 'linear-gradient(90deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)',
              width: '100%',
              position: 'absolute',
              top: 0,
              left: 0
            }} />

            {/* Watermark */}
            <div style={{
              position: 'absolute',
              top: '52%',
              left: '50%',
              transform: 'translate(-50%, -50%) rotate(-30deg)',
              textAlign: 'center',
              pointerEvents: 'none',
              zIndex: 0,
              opacity: 0.022,
              width: '100%'
            }}>
              <div style={{ fontSize: '80px', fontWeight: 900, letterSpacing: '14px', color: '#6366f1', margin: 0, whiteSpace: 'nowrap' }}>PRINT MART</div>
              <div style={{ fontSize: '20px', fontWeight: 700, letterSpacing: '8px', color: '#8b5cf6', marginTop: '5px', textTransform: 'uppercase' }}>OFFICIAL HOURS STATEMENT</div>
            </div>

            {/* Header Logo + Company Info */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              borderBottom: '2px solid #e2e8f0',
              paddingBottom: '25px',
              marginBottom: '30px',
              marginTop: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {base64Logo ? (
                    <img src={base64Logo} alt="PrintMart Logo" style={{ height: '52px', width: 'auto', objectFit: 'contain' }} />
                  ) : (
                    <div style={{
                      width: '46px',
                      height: '46px',
                      background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                      borderRadius: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '24px',
                      fontWeight: 900,
                      boxShadow: '0 4px 10px rgba(99, 102, 241, 0.3)'
                    }}>P</div>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: '26px', fontWeight: 900, letterSpacing: '-0.04em', color: '#1e1b4b', lineHeight: 1 }}>
                    Print<span style={{ color: '#6366f1' }}>Mart</span>
                  </div>
                  <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.15em', color: '#94a3b8', textTransform: 'uppercase', marginTop: '4px' }}>
                    The Apparel Company
                  </div>
                </div>
              </div>
              
              <div style={{ textAlign: 'right', fontSize: '11px', color: '#475569', lineHeight: '1.6', maxWidth: '320px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e1b4b', marginBottom: '4px', letterSpacing: '-0.01em' }}>Print Mart Apparel Private Ltd.</div>
                <div>Thattarkonam</div>
                <div>Kollam, Kerala 691001</div>
                <div>Email: payroll@printmart.com | Web: www.printmart.com</div>
                <div style={{ fontSize: '9px', color: '#64748b', marginTop: '3px', fontWeight: 500 }}>CIN: U18101TN2024PTC168420 | GSTIN: 33AADCP8420M1Z5</div>
              </div>
            </div>

            {/* Document Title Block */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '25px', position: 'relative', zIndex: 10 }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.02em', color: '#1e1b4b', margin: 0, borderLeft: '4px solid #6366f1', paddingLeft: '12px' }}>
                Employee Salary & Hours Statement
              </h2>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                Generated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            {/* Info Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '16px',
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '14px',
              padding: '18px',
              marginBottom: '30px',
              position: 'relative',
              zIndex: 10
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em' }}>Statement Reference</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#4f46e5', fontFamily: 'monospace' }}>{statementRef}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em' }}>Statement Period</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{periodStartStr} &ndash; {periodEndStr}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '8px' }}>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em' }}>Employee Details</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{user.displayName}</span>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>ID: EMP-{user.uid.substring(0, 8).toUpperCase()} | {user.email}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', marginTop: '8px' }}>
                <span style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em' }}>Designation & Department</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', textTransform: 'capitalize' }}>{user.designation || "Apparel Specialist"}</span>
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>Apparel Production Dept. | Cycle Day: {formatOrdinal(startDay)}</span>
              </div>
            </div>

            {/* Stats Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '30px', position: 'relative', zIndex: 10 }}>
              <div className="stat-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', backgroundColor: '#6366f1' }} />
                <span style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em' }}>Standard Worked Hours</span>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#1e1b4b', marginTop: '4px' }}>{formatHours(totalWorkedHrs - totalOtHrs)}</div>
              </div>
              <div className="stat-card" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', backgroundColor: '#d946ef' }} />
                <span style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em' }}>Overtime Hours</span>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#d946ef', marginTop: '4px' }}>{formatHours(totalOtHrs)}</div>
              </div>
              <div className="stat-card" style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: '12px', padding: '14px 16px', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', backgroundColor: '#10b981' }} />
                <span style={{ fontSize: '9px', textTransform: 'uppercase', fontWeight: 800, color: '#94a3b8', letterSpacing: '0.06em' }}>Est. Overtime Earnings</span>
                <div style={{ fontSize: '18px', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>₹{Math.round(totalOtPay).toLocaleString('en-IN')}</div>
              </div>
            </div>

            {/* Shift Log Table */}
            <h3 style={{ fontSize: '13px', fontWeight: 850, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#1e1b4b', marginBottom: '12px', borderLeft: '3px solid #6366f1', paddingLeft: '8px', position: 'relative', zIndex: 10 }}>
              Detailed Shift Log
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px', position: 'relative', zIndex: 10 }}>
              <thead>
                <tr style={{ textAlign: 'left' }}>
                  <th style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 12px', borderBottom: '2px solid #e2e8f0' }}>Date</th>
                  <th style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 12px', borderBottom: '2px solid #e2e8f0' }}>Status</th>
                  <th style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 12px', borderBottom: '2px solid #e2e8f0' }}>Punch In</th>
                  <th style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 12px', borderBottom: '2px solid #e2e8f0' }}>Punch Out</th>
                  <th style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 12px', borderBottom: '2px solid #e2e8f0' }}>Total Hours</th>
                  <th style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 12px', borderBottom: '2px solid #e2e8f0' }}>Overtime</th>
                  <th style={{ backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 700, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '10px 12px', borderBottom: '2px solid #e2e8f0' }}>Overtime Pay</th>
                </tr>
              </thead>
              <tbody>
                {cycleRecords.map((rec, idx) => {
                  const inStr = rec.punchIn ? new Date(rec.punchIn.toDate()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : "-";
                  const outStr = rec.punchOut ? new Date(rec.punchOut.toDate()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : "-";
                  const otPayVal = (rec.overtimeHours || 0) * 100;

                  // inline badge styles matching original tailwind
                  const badgeStyle: React.CSSProperties = {
                    display: 'inline-block',
                    padding: '2px 7px',
                    fontSize: '9px',
                    fontWeight: 700,
                    borderRadius: '9999px',
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em',
                  };
                  let badgeColors: React.CSSProperties = {};
                  if (rec.status === 'present') {
                    badgeColors = { backgroundColor: '#e6fcf5', color: '#0ca678', border: '1px solid #c3fae8' };
                  } else if (rec.status === 'half-day') {
                    badgeColors = { backgroundColor: '#fff9db', color: '#f08c00', border: '1px solid #fff3bf' };
                  } else {
                    badgeColors = { backgroundColor: '#fff5f5', color: '#e03131', border: '1px solid #ffc9c9' };
                  }

                  return (
                    <tr key={rec.date} style={{ borderBottom: '1px solid #f1f5f9', backgroundColor: idx % 2 === 1 ? '#fafbfc' : 'transparent' }}>
                      <td style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 600, fontFamily: 'monospace' }}>{rec.date}</td>
                      <td style={{ padding: '10px 12px', fontSize: '11px' }}>
                        <span style={{ ...badgeStyle, ...badgeColors }}>{rec.status}</span>
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '11px' }}>{inStr}</td>
                      <td style={{ padding: '10px 12px', fontSize: '11px' }}>{outStr}</td>
                      <td style={{ padding: '10px 12px', fontSize: '11px' }}>{formatHours(rec.totalHours || 0)}</td>
                      <td style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 600, color: rec.overtimeHours > 0 ? '#d946ef' : '#64748b' }}>
                        {rec.overtimeHours > 0 ? `+${formatHours(rec.overtimeHours)}` : '-'}
                      </td>
                      <td style={{ padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: rec.overtimeHours > 0 ? '#10b981' : '#334155' }}>
                        {rec.overtimeHours > 0 ? `₹${Math.round(otPayVal).toLocaleString('en-IN')}` : '₹0'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Signature Block */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '50px',
              paddingTop: '20px',
              position: 'relative',
              zIndex: 10
            }}>
              <div style={{ width: '180px', textAlign: 'center' }}>
                <div style={{ height: '45px' }} />
                <div style={{ borderTop: '1px solid #94a3b8', marginBottom: '6px' }} />
                <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Employee Signature</div>
                <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>Date: ____/____/________</div>
              </div>

              {/* Round Blue Stamp */}
              <div style={{ width: '100px', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  border: '2px dashed rgba(99, 102, 241, 0.35)',
                  borderRadius: '50%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(99, 102, 241, 0.45)',
                  fontSize: '9px',
                  fontWeight: 800,
                  letterSpacing: '0.5px',
                  textAlign: 'center',
                  transform: 'rotate(-12deg)'
                }}>
                  <span>PRINT MART</span>
                  <span style={{ fontSize: '6px', fontWeight: 'normal', margin: '2px 0' }}>* KOLLAM *</span>
                  <span>PAYROLL OFFICE</span>
                </div>
              </div>

              <div style={{ width: '180px', textAlign: 'center' }}>
                <div style={{ height: '45px', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontSize: '11px', fontWeight: 'bold', color: 'rgba(99, 102, 241, 0.6)', marginBottom: '2px' }}>
                  PrintMart HR Dept
                </div>
                <div style={{ borderTop: '1px solid #94a3b8', marginBottom: '6px' }} />
                <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>HR Payroll Administrator</div>
                <div style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>Print Mart Apparel Private Ltd.</div>
              </div>
            </div>
          </div>

          {/* Footer Developer Credits */}
          <div style={{
            marginTop: '45px',
            borderTop: '1px solid #e2e8f0',
            paddingTop: '12px',
            fontSize: '9px',
            color: '#94a3b8',
            textAlign: 'center',
            lineHeight: '1.5',
            position: 'relative',
            zIndex: 10
          }}>
            <strong>Verification Statement:</strong> This is a computer-generated statement summarizing recorded biometric punch schedules and approved leaves. Signatures verify accuracy of hours logged.
            <br />
            Generated on PrintMart Core ERP System. Confidential.
            <br />
            <span style={{ display: 'block', marginTop: '6px', fontWeight: 600, color: '#6366f1' }}>Developed by Gforx Production | Contact: 8848347162 | Email: anantharamanmac@gmail.com | Discord: https://discord.gg/42RkQ545</span>
          </div>
        </div>
      </div>

      {/* Global CSS Overrides for print styles */}
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 8mm;
        }
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          html, body {
            width: 100% !important;
            height: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            overflow: visible !important;
          }
          body * {
            visibility: hidden !important;
          }
          .printable-salary-sheet,
          .printable-salary-sheet * {
            visibility: visible !important;
          }
          .salary-modal-wrapper {
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
          }
          .printable-salary-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: 282mm !important;
            margin: 0 !important;
            padding: 8mm !important;
            background: #ffffff !important;
            border: none !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
          }
          .no-print, .navbar, .mobile-tab-bar {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
