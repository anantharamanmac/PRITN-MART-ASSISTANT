"use client";

import React, { useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import { OrderRecord } from '@/lib/db';
import { calculateSizeBreakdown, calculateShortsBreakdown, exportPlayersToCSV } from '@/lib/excelParser';

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
  const hasShorts = order.hasShorts !== undefined ? Boolean(order.hasShorts) : players.some(p => p.shortsSize && p.shortsSize !== '' && p.shortsSize !== '-');
  const bottomType = order.bottomType || 'shorts';
  const bottomLabel = bottomType === 'track_pant' ? 'TRACK PANT' : 'SHORTS';
  const bottomHeaderCode = bottomType === 'track_pant' ? 'PT' : 'SH';
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
      // Dynamic import standalone html2pdf bundle to prevent Next.js ChunkLoadError
      // @ts-ignore
      const html2pdfModule = await import('html2pdf.js/dist/html2pdf.bundle.min.js');
      const html2pdf = html2pdfModule.default || html2pdfModule || (window as any).html2pdf;

      const element = printRef.current;
      const opt = {
        margin: 2,
        filename: fileName,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true, logging: false },
        jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const }
      };

      await html2pdf().from(element).set(opt).save();
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
  const numColumns = players.length > 42 ? 4 : players.length > 20 ? 3 : players.length > 10 ? 2 : 1;
  const rowsPerCol = Math.max(1, Math.ceil(players.length / numColumns));

  const playerColumns = Array.from({ length: numColumns }, (_, colIdx) =>
    players.slice(colIdx * rowsPerCol, (colIdx + 1) * rowsPerCol)
  );

  // Dynamic Font Size & Padding for Table Cells - Fits A4 Page Perfectly
  const tableFontSize = numColumns >= 4 ? '11px' : numColumns === 3 ? '12px' : '13.5px';
  const tablePadding = rowsPerCol > 16 ? '2px 4px' : rowsPerCol > 10 ? '3px 5px' : '4px 6px';

  // Helper for dynamic player name font sizing & wrapping so NO player name is truncated!
  const getPlayerNameStyle = (nameStr: string, colsCount: number) => {
    const len = nameStr.length;
    let fontSize = '14px';
    let letterSpacing = '0.01em';
    let lineHeight = '1.1';

    if (colsCount >= 4) {
      if (len > 20) { fontSize = '8.5px'; letterSpacing = '-0.04em'; }
      else if (len > 15) { fontSize = '9.5px'; letterSpacing = '-0.03em'; }
      else if (len > 10) { fontSize = '11px'; letterSpacing = '-0.01em'; }
      else { fontSize = '12px'; }
    } else if (colsCount === 3) {
      if (len > 22) { fontSize = '9px'; letterSpacing = '-0.04em'; }
      else if (len > 16) { fontSize = '10.5px'; letterSpacing = '-0.02em'; }
      else if (len > 11) { fontSize = '12px'; }
      else { fontSize = '13.5px'; }
    } else if (colsCount === 2) {
      if (len > 25) { fontSize = '10.5px'; letterSpacing = '-0.02em'; }
      else if (len > 18) { fontSize = '12px'; }
      else { fontSize = '14px'; }
    } else {
      if (len > 25) { fontSize = '12.5px'; }
      else { fontSize = '15px'; }
    }

    return {
      fontSize,
      letterSpacing,
      lineHeight,
      textTransform: 'uppercase' as const,
      fontWeight: 900,
      wordBreak: 'break-word' as const,
      overflowWrap: 'anywhere' as const,
      whiteSpace: 'normal' as const,
    };
  };

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
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
            <span>{downloadingPdf ? 'Generating PDF...' : 'Download PDF'}</span>
          </button>

          {/* Export Excel CSV Button */}
          <button
            type="button"
            onClick={() => exportPlayersToCSV(players, `INFO-${order.infoNumber || 2412}`, hasShorts)}
            disabled={players.length === 0}
            title="Export roster list into Excel CSV file (Name, Number, Size)"
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '8px',
              border: 'none',
              background: '#eab308',
              color: '#000000',
              fontWeight: 700,
              fontSize: '0.875rem',
              cursor: players.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 4px 12px rgba(234, 179, 8, 0.3)',
              opacity: players.length === 0 ? 0.6 : 1
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            <span>Export Excel CSV</span>
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
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
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
                    <img src={order.clothImage} crossOrigin="anonymous" alt="Combined Design Mockup" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#777', fontSize: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px', opacity: 0.5 }}>
                        <svg viewBox="0 0 100 100" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="M 35,10 C 45,18 55,18 65,10 L 78,10 L 92,24 L 84,32 L 76,26 L 76,85 L 24,85 L 24,26 L 16,32 L 8,24 L 22,10 Z" /></svg>
                      </div>
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

                {/* LABEL Section (Stitching Master Notice) */}
                <div style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 900, marginBottom: '2px' }}>STITCHING LABEL</div>
                  <div style={{ display: 'flex', gap: '6px', fontSize: '10.5px', fontWeight: 900 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      NEW LABEL <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '1.5px solid #000', background: order.labelType === 'new' || !order.labelType ? '#d92525' : '#fff' }}></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      OLD LABEL <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '1.5px solid #000', background: order.labelType === 'old' ? '#d92525' : '#fff' }}></span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                      NO LABEL <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '1.5px solid #000', background: order.labelType === 'none' ? '#d92525' : '#fff' }}></span>
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
                    {bottomLabel} <span style={{ display: 'inline-block', width: '12px', height: '12px', border: '1.5px solid #000', background: hasShorts ? '#d92525' : '#fff' }}></span>
                  </div>
                </div>

                {/* STITCHING MASTER NOTICE BOX */}
                <div style={{
                  marginTop: '6px',
                  padding: '3px 6px',
                  border: '1.5px solid #000',
                  background: order.labelType === 'old' ? '#fef3c7' : order.labelType === 'none' ? '#f3f4f6' : '#dcfce7',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontWeight: 900,
                  fontSize: '11px',
                  color: '#000'
                }}>
                  <span>STITCHING MASTER NOTE:</span>
                  <span style={{
                    fontSize: '11.5px',
                    fontWeight: 900,
                    color: order.labelType === 'old' ? '#b45309' : order.labelType === 'none' ? '#4b5563' : '#15803d',
                    textTransform: 'uppercase'
                  }}>
                    {order.labelType === 'old' ? '⚠️ USE OLD LABEL' : order.labelType === 'none' ? '🚫 NO LABEL' : '✓ USE NEW LABEL'}
                  </span>
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

                {/* Shorts / Track Pant Summary Breakdown (if enabled) */}
                {hasShorts && (
                  <div style={{ marginTop: '10px', borderTop: '1.5px dashed #888', paddingTop: '6px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 900, color: '#d92525', textDecoration: 'underline', marginBottom: '4px' }}>
                      {bottomLabel} SUMMARY
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
                        <div>ALL {bottomLabel}S : {displayPieces}</div>
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
        <div style={{ border: '2.5px solid #000', background: '#ffffff', flex: 1, display: 'flex', flexDirection: 'column', marginTop: '4px' }}>
          {/* Category Bar Header */}
          <div style={{ background: '#d92525', color: '#ffffff', fontWeight: 900, fontSize: '15px', textAlign: 'center', letterSpacing: '0.15em', padding: '4px 0', borderBottom: '2px solid #000' }}>
            PLAYERS DETAILS ({players.length} TOTAL)
          </div>

          {/* Multi-Column Sub-Tables Container with Column Separator Dividers */}
          <div style={{ padding: '4px', background: '#ffffff', flex: 1, display: 'flex' }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${numColumns}, 1fr)`, gap: '8px', width: '100%' }}>
              {playerColumns.map((colPlayers, colIdx) => (
                <div
                  key={colIdx}
                  style={{
                    borderRight: colIdx < numColumns - 1 ? '2.5px solid #000000' : 'none',
                    paddingRight: colIdx < numColumns - 1 ? '6px' : '0',
                    display: 'flex',
                    flexDirection: 'column'
                  }}
                >
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: tableFontSize, background: '#ffffff', tableLayout: 'fixed', border: '1.5px solid #000' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid #000', background: '#d0d0d0', fontWeight: 900, fontSize: '11.5px' }}>
                        <th style={{ textAlign: 'left', padding: tablePadding, borderRight: '1.5px solid #000' }}>NAME</th>
                        <th style={{ textAlign: 'center', padding: tablePadding, width: hasShorts ? '32px' : '36px', borderRight: '1.5px solid #000' }}>SIZE</th>
                        <th style={{ textAlign: 'center', padding: tablePadding, width: '26px', borderRight: '1.5px solid #000', color: '#004c80' }}>SLV</th>
                        {hasShorts && (
                          <th style={{ textAlign: 'center', padding: tablePadding, width: '32px', borderRight: '1.5px solid #000', color: '#b91c1c' }}>{bottomHeaderCode}</th>
                        )}
                        <th style={{ textAlign: 'center', padding: tablePadding, width: '30px' }}>NO.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {colPlayers.length > 0 ? (
                        colPlayers.map((p, idx) => {
                          const nameRaw = formatCellValue(p.name);
                          const isGK = Boolean(p.isGK || /\b(GK|G\.K|GOAL\s*KEEPER|KEEPER)\b/i.test(p.name));
                          const hasGKInName = /\b(GK|G\.K)\b/i.test(nameRaw);
                          const nameDisplay = isGK && !hasGKInName && nameRaw ? `${nameRaw} (GK)` : nameRaw;
                          const sizeDisplay = formatCellValue(p.size);
                          const sleeveRaw = formatCellValue(p.sleeve);
                          const sleeveCode = (sleeveRaw || (order.sleeveType === 'half' ? 'H' : order.sleeveType === 'sleeveless' ? 'SL' : 'F')).toUpperCase();
                          const shortsDisplay = formatCellValue(p.shortsSize);
                          const numberDisplay = formatCellValue(p.number);
                          const nameStyle = getPlayerNameStyle(nameDisplay, numColumns);

                          return (
                            <tr
                              key={idx}
                              style={{
                                borderBottom: '1.5px solid #000000',
                                fontWeight: 900,
                                background: isGK ? '#fee2e2' : idx % 2 === 1 ? '#f5f7fa' : '#ffffff'
                              }}
                            >
                              <td
                                style={{
                                  padding: tablePadding,
                                  borderRight: '1.5px solid #000',
                                  ...nameStyle,
                                  color: isGK ? '#d92525' : '#000000'
                                }}
                              >
                                {nameDisplay}
                              </td>
                              <td
                                style={{
                                  padding: tablePadding,
                                  textAlign: 'center',
                                  borderRight: '1.5px solid #000',
                                  whiteSpace: 'nowrap',
                                  fontSize: rowsPerCol > 14 ? '13px' : '15px',
                                  color: isGK ? '#d92525' : '#000000'
                                }}
                              >
                                {sizeDisplay}
                              </td>
                              <td
                                style={{
                                  padding: tablePadding,
                                  textAlign: 'center',
                                  borderRight: '1.5px solid #000',
                                  whiteSpace: 'nowrap',
                                  color: isGK ? '#d92525' : '#004c80',
                                  fontWeight: 900,
                                  fontSize: rowsPerCol > 14 ? '12px' : '14px'
                                }}
                              >
                                {sleeveCode}
                              </td>
                              {hasShorts && (
                                <td
                                  style={{
                                    padding: tablePadding,
                                    textAlign: 'center',
                                    borderRight: '1.5px solid #000',
                                    whiteSpace: 'nowrap',
                                    color: isGK ? '#d92525' : '#b91c1c',
                                    fontWeight: 900,
                                    fontSize: rowsPerCol > 14 ? '13px' : '15px'
                                  }}
                                >
                                  {shortsDisplay}
                                </td>
                              )}
                              <td
                                style={{
                                  padding: tablePadding,
                                  textAlign: 'center',
                                  whiteSpace: 'nowrap',
                                  color: '#d92525',
                                  fontSize: rowsPerCol > 14 ? '13px' : '15px',
                                  fontWeight: 900
                                }}
                              >
                                {numberDisplay}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        Array.from({ length: 6 }).map((_, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #000', height: '22px' }}>
                            <td style={{ borderRight: '1px solid #000' }}></td>
                            <td style={{ borderRight: '1px solid #000' }}></td>
                            <td style={{ borderRight: '1px solid #000' }}></td>
                            {hasShorts && <td style={{ borderRight: '1px solid #000' }}></td>}
                            <td></td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
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
