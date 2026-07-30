"use client";

import React, { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { OrderRecord } from '@/lib/db';
import { calculateSizeBreakdown, calculateShortsBreakdown } from '@/lib/excelParser';

interface InfoSheetSlipProps {
  order: OrderRecord;
  onClose?: () => void;
}

export default function InfoSheetSlip({ order, onClose }: InfoSheetSlipProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const players = order.players || [];
  const { summaryArray, totalPieces } = calculateSizeBreakdown(players);
  const { summaryArray: shortsSummaryArray } = calculateShortsBreakdown(players);
  const hasShorts = Boolean(order.hasShorts || players.some(p => p.shortsSize && p.shortsSize !== '' && p.shortsSize !== '-'));
  const displayPieces = players.length > 0 ? totalPieces : order.pieces;

  // Format delivery date as DD / MM / YY
  const formatDelivery = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0].slice(2);
      const month = parseInt(parts[1], 10);
      const day = parseInt(parts[2], 10);
      return `${day} / ${month} / ${year}`;
    }
    return dateStr;
  };

  const handlePrint = () => {
    const originalTitle = document.title;
    document.title = String(order.infoNumber || 2412);
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    const fileName = `${order.infoNumber || 2412}.pdf`;

    setDownloadingPdf(true);
    toast.loading(`Generating PDF ${fileName}...`, { id: 'pdf-download' });

    try {
      // Dynamic import html2pdf.js for client-side execution
      // @ts-ignore
      const html2pdfModule = await import('html2pdf.js');
      const html2pdf = html2pdfModule.default || html2pdfModule;

      const element = printRef.current;
      const opt = {
        margin: 2,
        filename: fileName,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
      };

      await html2pdf().set(opt).from(element).save();
      toast.dismiss('pdf-download');
      toast.success(`Downloaded ${fileName}!`);
    } catch (err) {
      toast.dismiss('pdf-download');
      console.error('Error generating PDF:', err);
      toast.error('Failed to generate PDF download.');
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Format cell values: "XXX", "-", "N/A", "NIL" placeholders display as BLANK
  const formatCellValue = (val?: string) => {
    if (!val) return '';
    const trimmed = val.trim();
    const upper = trimmed.toUpperCase();
    if (upper === 'XXX' || upper === '-' || upper === 'N/A' || upper === 'NIL' || upper === 'NONE') {
      return '';
    }
    return trimmed;
  };

  // Adaptive Multi-Column Sub-Table Splitting for Bottom Players Roster
  const numColumns = players.length > 40 ? 4 : players.length > 20 ? 3 : players.length > 10 ? 2 : 1;
  const rowsPerCol = Math.max(1, Math.ceil(players.length / numColumns));

  const playerColumns = Array.from({ length: numColumns }, (_, colIdx) =>
    players.slice(colIdx * rowsPerCol, (colIdx + 1) * rowsPerCol)
  );

  // Dynamic Font Size & Padding for Table Cells - BIGGER FOR STITCHING WORKERS!
  const tableFontSize = numColumns >= 4 ? '11px' : numColumns === 3 ? '13px' : '15px';
  const tablePadding = numColumns >= 3 ? '4px 5px' : '6px 10px';

  return (
    <div className="info-sheet-modal-wrapper" style={{ padding: '1rem', color: '#000000' }}>
      {/* Top Modal Controls (Hidden in Print) */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '1rem' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)' }}>
            Cutting & Fusing Master Info Slip #{order.infoNumber || 2412}
          </h3>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Full Page A4 Fit Sheet ({players.length} players loaded below)
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
            <span>📄</span>
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
            <span>🖨️</span>
            <span>Print A4 Slip</span>
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

      {/* ── PRINTABLE SLIP CONTAINER (FULL A4 PAGE FILL) ── */}
      <div
        ref={printRef}
        className="printable-info-sheet"
        style={{
          background: '#ffffff',
          color: '#000000',
          fontFamily: "'Arial Black', 'Helvetica Neue', Arial, sans-serif",
          padding: '10px',
          border: '3px solid #000000',
          boxSizing: 'border-box',
          width: '100%',
          maxWidth: '880px',
          minHeight: '275mm',
          margin: '0 auto',
          fontSize: '13px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}
      >
        <div>
          {/* Top Header Block */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #000', paddingBottom: '6px', marginBottom: '8px' }}>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 900, textTransform: 'uppercase', color: '#004c80', letterSpacing: '0.01em' }}>
                CUSTOMER : <span style={{ color: '#0070ba' }}>{order.customerName || 'LUCKY'}</span>
              </div>
              <div style={{ fontSize: '14px', fontWeight: 900, color: '#00264d', marginTop: '2px' }}>
                NO. : {order.customerPhone || '+91 8848048733'}
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '20px', fontWeight: 900, textTransform: 'uppercase', color: '#005b96', letterSpacing: '0.04em' }}>
                ORDER: <span style={{ color: '#0084d1' }}>{order.orderTitle || 'SPORTIVATE'}</span>
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '16px', fontWeight: 900, textTransform: 'uppercase', color: '#000' }}>
                INFO NO.: <span style={{ fontSize: '26px', fontWeight: 900, marginLeft: '4px' }}>{order.infoNumber || 2412}</span>
              </div>
            </div>
          </div>

          {/* ── TOP SECTION: COMBINED MOCKUP + SPECS + SIZE SUMMARY ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.3fr 1.1fr', gap: '8px', border: '2px solid #000', background: '#ececec', padding: '8px', marginBottom: '10px' }}>
            {/* BOX 1: COMBINED MOCKUP IMAGE */}
            <div style={{ borderRight: '1.5px solid #000', paddingRight: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 900, color: '#002b66', marginBottom: '6px', textTransform: 'uppercase', textDecoration: 'underline' }}>
                  ITEM: {order.itemType || 'JERSEY'}
                </div>

                {/* Combined Mockup Frame */}
                <div style={{ height: '210px', background: '#fff', border: '2px solid #000', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: '4px' }}>
                  {order.clothImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={order.clothImage} alt="Combined Design Mockup" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#777', fontSize: '12px' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: '4px' }}>👕</div>
                      <div style={{ fontWeight: 900, color: '#000' }}>Combined Front & Back</div>
                      <div>Mockup Image</div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* BOX 2: PRINT & GARMENT SPECS */}
            <div style={{ borderRight: '1.5px solid #000', paddingRight: '8px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                {/* Delivery Date */}
                <div style={{ fontSize: '15px', fontWeight: 900, marginBottom: '8px' }}>
                  Delivery Date : <span style={{ color: '#d92525', textDecoration: 'underline', marginLeft: '4px' }}>{formatDelivery(order.deliveryDate)}</span>
                </div>

                {/* PRINT Section */}
                <div style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 900, marginBottom: '2px' }}>PRINT</div>
                  <div style={{ display: 'flex', gap: '6px', fontSize: '10.5px', fontWeight: 900 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      SUBLIMATION <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '1.5px solid #000', background: order.printMethod === 'sublimation' || !order.printMethod ? '#d92525' : '#fff' }}></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      DFT <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '1.5px solid #000', background: order.printMethod === 'dft' ? '#d92525' : '#fff' }}></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      NORMAL <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '1.5px solid #000', background: order.printMethod === 'normal' ? '#d92525' : '#fff' }}></span>
                    </div>
                  </div>
                </div>

                {/* PRINTING Section */}
                <div style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 900, marginBottom: '2px' }}>PRINTING</div>
                  <div style={{ display: 'flex', gap: '5px', fontSize: '10px', fontWeight: 900 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      FRONT ONLY <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '1.5px solid #000', background: order.printArea === 'front_only' ? '#d92525' : '#fff' }}></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      FRONT BACK <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '1.5px solid #000', background: order.printArea === 'front_back' ? '#d92525' : '#fff' }}></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      FULL <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '1.5px solid #000', background: order.printArea === 'full' || !order.printArea ? '#d92525' : '#fff' }}></span>
                    </div>
                  </div>
                </div>

                {/* SLEEVE Section */}
                <div style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 900, marginBottom: '2px' }}>SLEEVE</div>
                  <div style={{ display: 'flex', gap: '6px', fontSize: '10.5px', fontWeight: 900 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      SLEEVELES <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '1.5px solid #000', background: order.sleeveType === 'sleeveless' ? '#d92525' : '#fff' }}></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      HALF <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '1.5px solid #000', background: order.sleeveType === 'half' ? '#d92525' : '#fff' }}></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      FULL <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '1.5px solid #000', background: order.sleeveType === 'full' || !order.sleeveType ? '#d92525' : '#fff' }}></span>
                    </div>
                  </div>
                </div>

                {/* CLOTH & NECK & SHORTS Specifications */}
                <div style={{ marginTop: '6px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 900, color: '#000' }}>
                    CLOTH : <span style={{ color: '#d92525', textTransform: 'uppercase' }}>{order.clothType || 'SALEENA'}</span>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 900, color: '#000', marginTop: '3px' }}>
                    NECK <span style={{ color: '#d92525', textDecoration: 'underline', marginLeft: '4px', fontSize: '13px', textTransform: 'uppercase' }}>{order.neckType || 'ROUND NECK'}</span>
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 900, color: '#000', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    SHORTS <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '1.5px solid #000', background: hasShorts ? '#d92525' : '#fff' }}></span>
                  </div>
                </div>
              </div>

              {/* Extra Specs Bottom Table */}
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #000', fontSize: '10.5px', background: '#fff', marginTop: '6px' }}>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #000' }}>
                    <td style={{ padding: '3px 6px', fontWeight: 'bold', borderRight: '1.5px solid #000', width: '60%' }}>FULL SLEEVE</td>
                    <td style={{ padding: '3px 6px' }}></td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #000' }}>
                    <td style={{ padding: '3px 6px', fontWeight: 'bold', borderRight: '1.5px solid #000' }}>KIDS</td>
                    <td style={{ padding: '3px 6px' }}></td>
                  </tr>
                  <tr>
                    <td style={{ padding: '3px 6px', fontWeight: 'bold', borderRight: '1.5px solid #000' }}>OVER SIZE</td>
                    <td style={{ padding: '3px 6px' }}></td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* BOX 3: SIZE SUMMARY BREAKDOWN & TOTAL PIECES BOX */}
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 900, color: '#004080', textDecoration: 'underline', marginBottom: '8px' }}>
                  TOTAL : {order.itemType || 'JERSEY'}
                </div>

                {/* Size Summary Breakdown Grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: summaryArray.length > 5 ? '1fr 1fr' : '1fr',
                  gap: '5px 10px',
                  fontSize: summaryArray.length > 8 ? '15px' : '18px',
                  fontWeight: 900,
                  color: '#005b96',
                  letterSpacing: '0.06em'
                }}>
                  {summaryArray.length > 0 ? (
                    summaryArray.map((sumStr, idx) => (
                      <div key={idx}>{sumStr}</div>
                    ))
                  ) : (
                    <div>ALL SIZES : {order.pieces}</div>
                  )}
                </div>

                {/* Shorts Summary Breakdown (if enabled) */}
                {hasShorts && (
                  <div style={{ marginTop: '10px', borderTop: '1.5px dashed #888', paddingTop: '6px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 900, color: '#d92525', textDecoration: 'underline', marginBottom: '4px' }}>
                      SHORTS SUMMARY
                    </div>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: shortsSummaryArray.length > 5 ? '1fr 1fr' : '1fr',
                      gap: '3px 8px',
                      fontSize: '14px',
                      fontWeight: 900,
                      color: '#b91c1c'
                    }}>
                      {shortsSummaryArray.length > 0 ? (
                        shortsSummaryArray.map((sumStr, idx) => (
                          <div key={idx}>{sumStr}</div>
                        ))
                      ) : (
                        <div>ALL SHORTS : {displayPieces}</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Total Pieces Box */}
              <div style={{ border: '2.5px solid #000', padding: '6px 12px', background: '#ffffff', fontWeight: 900, fontSize: '18px', textAlign: 'center', marginTop: '10px' }}>
                TOTAL - {displayPieces}
              </div>
            </div>
          </div>
        </div>

        {/* ── BOTTOM SECTION: PLAYERS DETAILS TABLE BELOW ACROSS FULL PAGE WIDTH ── */}
        <div style={{ border: '2px solid #000', background: '#ffffff', flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Category Bar Header */}
          <div style={{ background: '#d92525', color: '#ffffff', fontWeight: 900, fontSize: '15px', textAlign: 'center', letterSpacing: '0.15em', padding: '5px 0' }}>
            PLAYERS DETAILS ({players.length} TOTAL)
          </div>

          {/* Multi-Column Sub-Tables Container */}
          <div style={{ padding: '6px', background: '#ffffff', flex: 1, display: 'flex' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${numColumns}, 1fr)`, gap: '6px', width: '100%' }}>
              {playerColumns.map((colPlayers, colIdx) => (
                <table key={colIdx} style={{ width: '100%', borderCollapse: 'collapse', fontSize: tableFontSize, background: '#ffffff', tableLayout: 'fixed' }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid #000', background: '#cccccc', fontWeight: 900, fontSize: '12px' }}>
                      <th style={{ textAlign: 'left', padding: tablePadding, borderRight: '1.5px solid #000' }}>NAME</th>
                      <th style={{ textAlign: 'center', padding: tablePadding, width: hasShorts ? '48px' : '55px', borderRight: '1.5px solid #000' }}>SIZE</th>
                      <th style={{ textAlign: 'center', padding: tablePadding, width: '42px', borderRight: '1.5px solid #000', color: '#004c80' }}>SLV</th>
                      {hasShorts && (
                        <th style={{ textAlign: 'center', padding: tablePadding, width: '45px', borderRight: '1.5px solid #000', color: '#b91c1c' }}>SH</th>
                      )}
                      <th style={{ textAlign: 'center', padding: tablePadding, width: '45px' }}>NO.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {colPlayers.length > 0 ? (
                      colPlayers.map((p, idx) => {
                        const nameDisplay = formatCellValue(p.name);
                        const sizeDisplay = formatCellValue(p.size);
                        const sleeveRaw = formatCellValue(p.sleeve);
                        const sleeveCode = (sleeveRaw || (order.sleeveType === 'half' ? 'H' : order.sleeveType === 'sleeveless' ? 'SL' : 'F')).toUpperCase();
                        const shortsDisplay = formatCellValue(p.shortsSize);
                        const numberDisplay = formatCellValue(p.number);
                        return (
                          <tr key={idx} style={{ borderBottom: '1.5px solid #eee', fontWeight: 900, minHeight: '30px' }}>
                            <td style={{ padding: tablePadding, borderRight: '1.5px solid #ddd', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '15px', letterSpacing: '0.02em' }}>
                              {nameDisplay}
                            </td>
                            <td style={{ padding: tablePadding, textAlign: 'center', borderRight: '1.5px solid #ddd', whiteSpace: 'nowrap', fontSize: '16px' }}>
                              {sizeDisplay}
                            </td>
                            <td style={{ padding: tablePadding, textAlign: 'center', borderRight: '1.5px solid #ddd', whiteSpace: 'nowrap', color: '#004c80', fontWeight: 900, fontSize: '15px' }}>
                              {sleeveCode}
                            </td>
                            {hasShorts && (
                              <td style={{ padding: tablePadding, textAlign: 'center', borderRight: '1.5px solid #ddd', whiteSpace: 'nowrap', color: '#b91c1c', fontWeight: 900, fontSize: '16px' }}>
                                {shortsDisplay}
                              </td>
                            )}
                            <td style={{ padding: tablePadding, textAlign: 'center', whiteSpace: 'nowrap', color: '#d92525', fontSize: '16px', fontWeight: 900 }}>
                              {numberDisplay}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      Array.from({ length: 8 }).map((_, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #ddd', height: '24px' }}>
                          <td style={{ borderRight: '1px solid #ddd' }}></td>
                          <td style={{ borderRight: '1px solid #ddd' }}></td>
                          <td style={{ borderRight: '1px solid #ddd' }}></td>
                          {hasShorts && <td style={{ borderRight: '1px solid #ddd' }}></td>}
                          <td></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── EMBEDDED PRINT CSS FOR FULL A4 PORTRAIT PAGE FILL ── */}
      <style jsx global>{`
        @page {
          size: A4 portrait;
          margin: 4mm;
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
          .printable-info-sheet,
          .printable-info-sheet * {
            visibility: visible !important;
          }
          .info-sheet-modal-wrapper,
          .card-glass {
            padding: 0 !important;
            margin: 0 !important;
            background: transparent !important;
            border: none !important;
            box-shadow: none !important;
            max-width: 100% !important;
            max-height: none !important;
            overflow: visible !important;
            position: static !important;
          }
          .printable-info-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: 98vh !important;
            min-height: 280mm !important;
            margin: 0 !important;
            padding: 4mm !important;
            background: #ffffff !important;
            border: 3px solid #000000 !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
          }
          .no-print, .navbar, .mobile-tab-bar {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
