"use client";

import React, { forwardRef } from 'react';
import { SizeChartData } from '@/lib/sizeChart';

interface SizeChartSlipProps {
  chart: SizeChartData;
}

export const SizeChartSlip = forwardRef<HTMLDivElement, SizeChartSlipProps>(({ chart }, ref) => {
  const isLandscape = chart.orientation === 'landscape';
  const enabledSections = chart.sections.filter((s) => s.enabled);

  return (
    <div
      ref={ref}
      id="printable-size-chart"
      className="printable-size-chart-sheet"
      style={{
        backgroundColor: '#ffffff',
        color: '#111827',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        padding: isLandscape ? '16px 20px' : '22px 24px',
        boxSizing: 'border-box',
        width: isLandscape ? '1050px' : '780px',
        minHeight: isLandscape ? '740px' : '1050px',
        margin: '0 auto',
        border: '1px solid #e5e7eb',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        borderRadius: '4px',
      }}
    >
      {/* ── HEADER BANNER ── */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '3px solid #111827',
            paddingBottom: '10px',
            marginBottom: '14px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  display: 'inline-block',
                  backgroundColor: chart.accentColor || '#e65100',
                  color: '#ffffff',
                  fontWeight: 900,
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                }}
              >
                OFFICIAL APPAREL SPEC
              </span>
              <h1
                style={{
                  margin: 0,
                  fontSize: '24px',
                  fontWeight: 900,
                  letterSpacing: '0.04em',
                  color: '#111827',
                  textTransform: 'uppercase',
                }}
              >
                {chart.companyName || 'PRINT MART'}
              </h1>
            </div>
            <div
              style={{
                fontSize: '12.5px',
                fontWeight: 800,
                color: '#4b5563',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                marginTop: '2px',
              }}
            >
              {chart.name || 'STANDARD GARMENT SIZE SPECIFICATION SHEET'}
              {chart.category ? ` • ${chart.category}` : ''}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              borderLeft: '2px solid #e5e7eb',
              paddingLeft: '14px',
            }}
          >
            {/* Visual garment indicator icon */}
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: '#f3f4f6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: chart.accentColor || '#e65100',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={chart.accentColor || '#e65100'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" />
              </svg>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Measurement Unit
              </div>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 900,
                  color: chart.accentColor || '#e65100',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                }}
              >
                {chart.unit === 'cm' ? 'Centimeters (CM)' : 'Inches (IN)'}
              </div>
              <div
                style={{
                  fontSize: '10.5px',
                  color: '#4b5563',
                  fontWeight: 600,
                }}
              >
                Tolerance: {chart.tolerance || '± 0.5″'}
              </div>
            </div>
          </div>
        </div>

        {/* ── TABLES CONTAINER (FLEXBOX FOR 100% HTML2CANVAS COMPATIBILITY) ── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: isLandscape ? '14px' : '18px',
            alignItems: 'flex-start',
            marginTop: '6px',
            width: '100%',
          }}
        >
          {enabledSections.map((section, sIdx) => (
            <div
              key={section.id}
              style={{
                flex: sIdx === 0 && enabledSections.length === 3 ? '1.2 1 0%' : '1 1 0%',
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Section Header Title (Matching the bold orange title from photo) */}
              <div
                style={{
                  textAlign: 'center',
                  fontSize: '18px',
                  fontWeight: 900,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: chart.accentColor || '#e65100',
                  padding: '4px 0 6px 0',
                  borderBottom: `2.5px solid ${chart.accentColor || '#e65100'}`,
                  marginBottom: '6px',
                }}
              >
                {section.title}
              </div>

              {/* Table */}
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  border: '2px solid #000000',
                  fontSize: isLandscape ? '12px' : '13px',
                }}
              >
                <thead>
                  <tr style={{ backgroundColor: '#ffffff' }}>
                    {section.columns.map((col, idx) => (
                      <th
                        key={idx}
                        style={{
                          border: '1px solid #000000',
                          padding: '5px 4px',
                          textAlign: 'center',
                          fontWeight: 900,
                          fontSize: isLandscape ? '13px' : '14px',
                          letterSpacing: '0.04em',
                          color: '#000000',
                          backgroundColor: '#f8fafc',
                          textTransform: 'uppercase',
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {section.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      style={{
                        backgroundColor: rIdx % 2 === 0 ? '#ffffff' : '#fafafa',
                      }}
                    >
                      {section.columns.map((_, cIdx) => (
                        <td
                          key={cIdx}
                          style={{
                            border: '1px solid #000000',
                            padding: isLandscape ? '3.5px 4px' : '5px 6px',
                            textAlign: 'center',
                            fontWeight: cIdx === 0 ? 800 : 700,
                            color: '#000000',
                            whiteSpace: 'nowrap',
                            fontSize: isLandscape ? '12.5px' : '13.5px',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {row[cIdx] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      {/* ── FOOTER GUIDELINES & SPECIFICATION BAR ── */}
      <div
        style={{
          marginTop: '14px',
          paddingTop: '10px',
          borderTop: '2px dashed #9ca3af',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
          width: '100%',
        }}
      >
        <div style={{ flex: '1 1 auto', fontSize: '10.5px', color: '#374151', lineHeight: 1.5 }}>
          <div
            style={{
              fontWeight: 900,
              fontSize: '11px',
              textTransform: 'uppercase',
              color: '#111827',
              marginBottom: '3px',
              letterSpacing: '0.04em',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>📐</span> Measurement & Tailoring Standards:
          </div>
          <div style={{ whiteSpace: 'pre-line' }}>{chart.notes}</div>
        </div>

        <div
          style={{
            flex: '0 0 220px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            padding: '8px 10px',
            backgroundColor: '#f9fafb',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: '10px',
              fontWeight: 800,
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Approved Manufacturing Sheet
          </div>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 900,
              color: chart.accentColor || '#e65100',
              marginTop: '2px',
            }}
          >
            {chart.companyName || 'PRINT MART'}
          </div>
          <div style={{ fontSize: '9.5px', color: '#9ca3af', marginTop: '2px' }}>
            Generated {new Date().toLocaleDateString('en-GB')} • Official Specification
          </div>
        </div>
      </div>

      {/* ── EMBEDDED PRINT MEDIA STYLES ── */}
      <style jsx global>{`
        @page {
          size: ${chart.orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait'};
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

          #printable-size-chart,
          #printable-size-chart * {
            visibility: visible !important;
          }

          #printable-size-chart {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: 98vh !important;
            margin: 0 !important;
            padding: 4mm !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            border: none !important;
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            transform: none !important;
          }

          .no-print,
          .navbar-fixed-container,
          .navbar,
          .mobile-tab-bar,
          .sc-mobile-dock {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
});

SizeChartSlip.displayName = 'SizeChartSlip';
