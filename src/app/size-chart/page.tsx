"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import Navbar from '@/components/Navbar';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import {
  SizeChartData,
  DEFAULT_SIZE_CHART,
  PRESET_TEMPLATES,
  getActiveLocalChart,
  setActiveLocalChart,
  saveSizeChartToFirestore,
  fetchAllSizeCharts,
  deleteSizeChartFromStorage,
} from '@/lib/sizeChart';
import { SizeChartSlip } from '@/components/SizeChartSlip';

export default function SizeChartPage() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Core state
  const [chart, setChart] = useState<SizeChartData>(DEFAULT_SIZE_CHART);
  const [activeSectionId, setActiveSectionId] = useState<string>('body');
  const [activeTab, setActiveTab] = useState<'editor' | 'preview'>('editor');
  const [showSettings, setShowSettings] = useState(false);
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [savedCharts, setSavedCharts] = useState<SizeChartData[]>([]);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [savingCloud, setSavingCloud] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  // Authentication check
  useEffect(() => {
    const unsubscribe = listenToAuthChanges(async (authUser, appUserData) => {
      if (!authUser || !appUserData) {
        router.push('/');
        return;
      }
      if (appUserData.role === 'pending') {
        router.push('/pending');
        return;
      }
      setUser(appUserData);

      const cached = getActiveLocalChart();
      if (cached) {
        setChart(cached);
        if (cached.sections.length > 0) {
          setActiveSectionId(cached.sections[0].id);
        }
      }

      try {
        const list = await fetchAllSizeCharts();
        setSavedCharts(list);
      } catch (err) {
        console.warn('Error loading charts:', err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Sync state to local storage
  const updateChart = (updater: (prev: SizeChartData) => SizeChartData) => {
    setChart((prev) => {
      const next = updater(prev);
      setActiveLocalChart(next);
      return next;
    });
  };

  const activeSection = chart.sections.find((s) => s.id === activeSectionId) || chart.sections[0];

  // Cell editing
  const handleCellChange = (rowIndex: number, colIndex: number, val: string) => {
    if (!activeSection) return;
    const newRows = [...activeSection.rows];
    if (!newRows[rowIndex]) {
      newRows[rowIndex] = Array(activeSection.columns.length).fill('');
    }
    newRows[rowIndex] = [...newRows[rowIndex]];
    newRows[rowIndex][colIndex] = val;

    updateChart((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === activeSection.id ? { ...s, rows: newRows } : s
      ),
    }));
  };

  // Add row
  const handleAddRow = () => {
    if (!activeSection) return;
    const newRow = Array(activeSection.columns.length).fill('');
    updateChart((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === activeSection.id ? { ...s, rows: [...s.rows, newRow] } : s
      ),
    }));
  };

  // Delete row
  const handleDeleteRow = (rowIndex: number) => {
    if (!activeSection) return;
    if (activeSection.rows.length <= 1) {
      toast.error('Table must have at least one row');
      return;
    }
    const newRows = activeSection.rows.filter((_, idx) => idx !== rowIndex);
    updateChart((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === activeSection.id ? { ...s, rows: newRows } : s
      ),
    }));
  };

  // Add new table section
  const handleAddSection = () => {
    const title = prompt('Enter table title (e.g. SHORTS, COLLAR, TRACK PANTS):', 'NEW TABLE');
    if (!title) return;
    const newId = `section_${Date.now()}`;
    const newSec = {
      id: newId,
      title: title.trim().toUpperCase(),
      columns: ['SIZE', 'WIDTH', 'HEIGHT'],
      rows: [
        ['S', '18', '26'],
        ['M', '20', '28'],
        ['L', '22', '30'],
        ['XL', '24', '32'],
      ],
      enabled: true,
    };
    updateChart((prev) => ({
      ...prev,
      sections: [...prev.sections, newSec],
    }));
    setActiveSectionId(newId);
    toast.success(`Added table "${title}"`);
  };

  // Delete section
  const handleDeleteSection = (secId: string) => {
    if (chart.sections.length <= 1) {
      toast.error('At least one table is required');
      return;
    }
    if (!confirm('Delete this table section?')) return;
    updateChart((prev) => {
      const filtered = prev.sections.filter((s) => s.id !== secId);
      if (activeSectionId === secId && filtered.length > 0) {
        setActiveSectionId(filtered[0].id);
      }
      return { ...prev, sections: filtered };
    });
    toast.success('Table removed');
  };

  // Print Action
  const handlePrint = async () => {
    if (activeTab !== 'preview') {
      setActiveTab('preview');
      await new Promise((r) => setTimeout(r, 300));
    }
    const originalTitle = document.title;
    const safeTitle = `${(chart.companyName || 'Print_Mart').replace(/[^a-zA-Z0-9]/g, '_')}_Size_Chart`;
    document.title = safeTitle;
    window.print();
    setTimeout(() => {
      document.title = originalTitle;
    }, 1000);
  };

  // Download PDF Action
  const handleDownloadPDF = async () => {
    const safeTitle = `${(chart.companyName || 'Print_Mart').replace(/[^a-zA-Z0-9]/g, '_')}_Size_Chart`;
    const fileName = `${safeTitle}.pdf`;

    setDownloadingPdf(true);
    const toastId = toast.loading(`Generating PDF: ${fileName}...`);

    try {
      // Switch to preview tab so the sheet is fully visible and rendered in the DOM for html2canvas
      if (activeTab !== 'preview') {
        setActiveTab('preview');
        await new Promise((r) => setTimeout(r, 350));
      }

      const element = printRef.current || (document.getElementById('printable-size-chart') as HTMLDivElement);

      if (!element) {
        throw new Error('Printable sheet element not found in DOM');
      }

      // Dynamic import standalone html2pdf bundle
      // @ts-expect-error html2pdf bundle lacks strict typescript definition
      const html2pdfModule = await import('html2pdf.js/dist/html2pdf.bundle.min.js');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const html2pdf = html2pdfModule.default || html2pdfModule || (window as any).html2pdf;

      if (!html2pdf) {
        throw new Error('html2pdf engine not loaded');
      }

      const isLandscape = chart.orientation === 'landscape';

      const opt = {
        margin: [4, 4, 4, 4] as [number, number, number, number],
        filename: fileName,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          scrollX: 0,
          scrollY: 0,
          logging: false,
          windowWidth: isLandscape ? 1150 : 850,
        },
        jsPDF: {
          unit: 'mm' as const,
          format: 'a4' as const,
          orientation: chart.orientation,
        },
      };

      await html2pdf().from(element).set(opt).save();

      toast.dismiss(toastId);
      toast.success(`Downloaded ${fileName}!`);
    } catch (err) {
      toast.dismiss(toastId);
      console.error('PDF error:', err);
      toast.error('Direct download failed. Opening Print dialog to Save as PDF...');
      handlePrint();
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Save to cloud
  const handleSaveToCloud = async () => {
    const name = prompt('Name for this Size Chart template:', chart.name || 'Standard Garment Chart');
    if (!name) return;
    setSavingCloud(true);
    toast.loading('Saving chart...', { id: 'sc-save' });
    try {
      const updated = { ...chart, name: name.trim() };
      await saveSizeChartToFirestore(updated);
      setChart(updated);
      const list = await fetchAllSizeCharts();
      setSavedCharts(list);
      toast.dismiss('sc-save');
      toast.success('Saved to templates!');
    } catch (err) {
      toast.dismiss('sc-save');
      console.error(err);
      toast.error('Failed to save chart');
    } finally {
      setSavingCloud(false);
    }
  };

  // Load preset
  const handleLoadPreset = (key: string) => {
    const preset = PRESET_TEMPLATES[key];
    if (!preset) return;
    if (!confirm(`Reset to "${preset.name}"?`)) return;
    const fullChart: SizeChartData = {
      ...DEFAULT_SIZE_CHART,
      ...preset,
      id: `chart_${Date.now()}`,
    };
    updateChart(() => fullChart);
    if (fullChart.sections.length > 0) {
      setActiveSectionId(fullChart.sections[0].id);
    }
    toast.success('Loaded preset');
  };

  // Delete saved chart
  const handleDeleteSavedChart = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this template?')) return;
    try {
      await deleteSizeChartFromStorage(id);
      setSavedCharts((prev) => prev.filter((c) => c.id !== id));
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  if (loading || !user) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0f1d', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#ea580c', fontWeight: 800, fontSize: '1rem' }}>Loading Size Chart Studio...</div>
      </div>
    );
  }

  return (
    <div className="size-chart-page">
      <Navbar user={user} />

      <main className="sc-main">
        {/* ── TOP HEADER ── */}
        <header className="sc-header">
          <div className="sc-title-area">
            <div className="sc-badge">APPAREL SPEC STUDIO</div>
            <h1 className="sc-title">
              Size Chart <span>Manager</span>
            </h1>
            <p className="sc-sub">
              {chart.companyName} • {chart.category} ({chart.unit.toUpperCase()})
            </p>
          </div>

          <div className="sc-top-actions">
            <button
              type="button"
              className="sc-btn sc-btn-secondary"
              onClick={() => setShowSettings(!showSettings)}
            >
              ⚙️ Settings
            </button>

            <button
              type="button"
              className="sc-btn sc-btn-secondary"
              onClick={() => setShowSavedModal(true)}
            >
              📂 Saved ({savedCharts.length})
            </button>

            <button
              type="button"
              className="sc-btn sc-btn-secondary"
              onClick={handleSaveToCloud}
              disabled={savingCloud}
            >
              💾 {savingCloud ? 'Saving...' : 'Save'}
            </button>

            <button
              type="button"
              className="sc-btn sc-btn-primary"
              onClick={handleDownloadPDF}
              disabled={downloadingPdf}
            >
              📥 {downloadingPdf ? 'Exporting...' : 'Download PDF'}
            </button>

            <button
              type="button"
              className="sc-btn sc-btn-dark"
              onClick={handlePrint}
            >
              🖨️ Print
            </button>
          </div>
        </header>

        {/* ── SETTINGS DRAWER ── */}
        {showSettings && (
          <div className="sc-card sc-settings-box">
            <div className="sc-box-header">
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#ffffff' }}>
                Chart Configuration & Branding
              </h3>
              <button
                type="button"
                className="sc-close-btn"
                onClick={() => setShowSettings(false)}
              >
                ✕
              </button>
            </div>

            <div className="sc-grid-inputs">
              <div className="sc-input-group">
                <label>Company Name</label>
                <input
                  type="text"
                  value={chart.companyName}
                  onChange={(e) => updateChart((prev) => ({ ...prev, companyName: e.target.value }))}
                />
              </div>

              <div className="sc-input-group">
                <label>Chart Title</label>
                <input
                  type="text"
                  value={chart.name}
                  onChange={(e) => updateChart((prev) => ({ ...prev, name: e.target.value }))}
                />
              </div>

              <div className="sc-input-group">
                <label>Category / Subtitle</label>
                <input
                  type="text"
                  value={chart.category}
                  onChange={(e) => updateChart((prev) => ({ ...prev, category: e.target.value }))}
                />
              </div>

              <div className="sc-input-group">
                <label>Tolerance</label>
                <input
                  type="text"
                  value={chart.tolerance}
                  onChange={(e) => updateChart((prev) => ({ ...prev, tolerance: e.target.value }))}
                />
              </div>
            </div>

            <div className="sc-settings-footer">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700 }}>Accent Color:</span>
                <input
                  type="color"
                  value={chart.accentColor}
                  onChange={(e) => updateChart((prev) => ({ ...prev, accentColor: e.target.value }))}
                  style={{ width: '32px', height: '32px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'transparent' }}
                />
                <span style={{ fontSize: '0.8rem', color: '#ea580c', fontWeight: 800, fontFamily: 'monospace' }}>
                  {chart.accentColor}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="sc-btn sc-btn-secondary"
                  onClick={() => handleLoadPreset('standard_garment')}
                  style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem' }}
                >
                  Reload Default Sample
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── MAIN SEGMENTED NAVIGATION (TABLES VS A4 PREVIEW) ── */}
        <div className="sc-nav-bar">
          <div className="sc-tabs-group">
            <button
              type="button"
              className={`sc-tab-btn ${activeTab === 'editor' ? 'active' : ''}`}
              onClick={() => setActiveTab('editor')}
            >
              📊 Size Tables ({chart.sections.length})
            </button>
            <button
              type="button"
              className={`sc-tab-btn ${activeTab === 'preview' ? 'active' : ''}`}
              onClick={() => setActiveTab('preview')}
            >
              📄 A4 PDF Preview
            </button>
          </div>

          <div className="sc-specs-pills">
            <button
              type="button"
              className="sc-pill-toggle"
              onClick={() =>
                updateChart((prev) => ({
                  ...prev,
                  orientation: prev.orientation === 'landscape' ? 'portrait' : 'landscape',
                }))
              }
            >
              {chart.orientation === 'landscape' ? 'Landscape (3-Col)' : 'Portrait'}
            </button>

            <button
              type="button"
              className="sc-pill-toggle"
              onClick={() =>
                updateChart((prev) => ({
                  ...prev,
                  unit: prev.unit === 'inches' ? 'cm' : 'inches',
                }))
              }
            >
              {chart.unit === 'inches' ? 'Unit: INCHES' : 'Unit: CM'}
            </button>
          </div>
        </div>

        {/* ── TAB 1: CLEAN SIZE TABLE EDITOR ── */}
        {activeTab === 'editor' && (
          <div className="sc-editor-view">
            {/* Table Selector Tabs (BODY, HALF SLEEVE, FULL SLEEVE) */}
            <div className="sc-section-bar">
              <div className="sc-section-pills">
                {chart.sections.map((sec) => {
                  const isSelected = activeSectionId === sec.id;
                  return (
                    <div key={sec.id} className="sc-sec-item">
                      <button
                        type="button"
                        className={`sc-sec-btn ${isSelected ? 'active' : ''}`}
                        onClick={() => setActiveSectionId(sec.id)}
                      >
                        <span>{sec.title}</span>
                        <span className="sc-sec-count">{sec.rows.length}</span>
                      </button>
                      {chart.sections.length > 1 && (
                        <button
                          type="button"
                          className="sc-sec-del"
                          onClick={() => handleDeleteSection(sec.id)}
                          title="Delete Table"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                type="button"
                className="sc-btn sc-btn-secondary sc-add-table-btn"
                onClick={handleAddSection}
              >
                + New Table
              </button>
            </div>

            {/* Active Table Container */}
            {activeSection && (
              <div className="sc-card sc-table-card">
                <div className="sc-table-header-strip">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 700 }}>Table Name:</span>
                    <input
                      type="text"
                      value={activeSection.title}
                      onChange={(e) =>
                        updateChart((prev) => ({
                          ...prev,
                          sections: prev.sections.map((s) =>
                            s.id === activeSection.id ? { ...s, title: e.target.value.toUpperCase() } : s
                          ),
                        }))
                      }
                      className="sc-title-input"
                    />
                  </div>

                  <span style={{ fontSize: '0.8rem', color: '#ea580c', fontWeight: 800 }}>
                    {activeSection.rows.length} Sizes
                  </span>
                </div>

                {/* THE CLEAN SPREADSHEET TABLE */}
                <div className="sc-table-wrapper">
                  <table className="sc-table">
                    <thead>
                      <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>#</th>
                        {activeSection.columns.map((col, idx) => (
                          <th key={idx} style={{ textAlign: 'center' }}>
                            {col}
                          </th>
                        ))}
                        <th style={{ width: '50px', textAlign: 'center' }}>Del</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeSection.rows.map((row, rIdx) => (
                        <tr key={rIdx}>
                          <td className="sc-td-num">{rIdx + 1}</td>
                          {activeSection.columns.map((_, cIdx) => (
                            <td key={cIdx}>
                              <input
                                type="text"
                                inputMode={cIdx > 0 ? 'decimal' : 'text'}
                                value={row[cIdx] || ''}
                                onChange={(e) => handleCellChange(rIdx, cIdx, e.target.value)}
                                className={`sc-cell-input ${cIdx === 0 ? 'sc-cell-size' : ''}`}
                                placeholder="—"
                              />
                            </td>
                          ))}
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="sc-row-del-btn"
                              onClick={() => handleDeleteRow(rIdx)}
                              title="Delete Row"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Table Footer Controls */}
                <div className="sc-table-footer">
                  <button
                    type="button"
                    className="sc-btn sc-btn-add-row"
                    onClick={handleAddRow}
                  >
                    <span>➕</span> Add Next Size Row
                  </button>
                </div>
              </div>
            )}

            {/* Quality & Tailoring Guidelines */}
            <div className="sc-card sc-notes-card">
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', fontWeight: 800, color: '#f1f5f9' }}>
                📝 Measurement Instructions & Tailoring Notes
              </h4>
              <textarea
                rows={3}
                value={chart.notes}
                onChange={(e) => updateChart((prev) => ({ ...prev, notes: e.target.value }))}
                className="sc-textarea"
                placeholder="Enter measurement instructions..."
              />
            </div>
          </div>
        )}

        {/* ── TAB 2: A4 VECTOR PDF PREVIEW & PRINTABLE SLIP ── */}
        {activeTab === 'preview' && (
          <div className="sc-preview-view">
            <div className="sc-card sc-preview-card">
              <div className="sc-preview-toolbar">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span className="sc-pulse-dot" />
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff' }}>
                    A4 Print Slip ({chart.orientation.toUpperCase()})
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="sc-btn sc-btn-primary"
                    onClick={handleDownloadPDF}
                    disabled={downloadingPdf}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                  >
                    📥 {downloadingPdf ? 'Exporting...' : 'Download PDF'}
                  </button>
                  <button
                    type="button"
                    className="sc-btn sc-btn-dark"
                    onClick={handlePrint}
                    style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                  >
                    🖨️ Print
                  </button>
                </div>
              </div>

              {/* Scrollable container for mobile & desktop */}
              <div className="sc-slip-container">
                <SizeChartSlip ref={printRef} chart={chart} />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ── MOBILE FIXED BOTTOM ACTION BAR ── */}
      <div className="sc-mobile-dock">
        <button
          type="button"
          className="sc-dock-btn"
          onClick={() => setActiveTab(activeTab === 'editor' ? 'preview' : 'editor')}
        >
          {activeTab === 'editor' ? '📄 View Slip' : '✏️ Edit Table'}
        </button>

        <button
          type="button"
          className="sc-dock-btn sc-dock-primary"
          onClick={handleDownloadPDF}
          disabled={downloadingPdf}
        >
          📥 {downloadingPdf ? 'Exporting...' : 'Download PDF'}
        </button>

        <button
          type="button"
          className="sc-dock-btn sc-dock-dark"
          onClick={handlePrint}
          title="Print"
        >
          🖨️
        </button>
      </div>

      {/* ── SAVED CHARTS MODAL ── */}
      {showSavedModal && (
        <div className="sc-modal-overlay">
          <div className="sc-modal-card">
            <div className="sc-modal-header">
              <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#ffffff' }}>
                📂 Saved Size Chart Templates
              </h3>
              <button
                type="button"
                className="sc-close-btn"
                onClick={() => setShowSavedModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="sc-modal-body">
              {savedCharts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8', fontSize: '0.85rem' }}>
                  No saved templates yet. Click &quot;Save&quot; to store custom templates!
                </div>
              ) : (
                savedCharts.map((item) => (
                  <div
                    key={item.id}
                    className="sc-saved-item"
                    onClick={() => {
                      updateChart(() => item);
                      if (item.sections.length > 0) setActiveSectionId(item.sections[0].id);
                      setShowSavedModal(false);
                      toast.success(`Loaded "${item.name}"`);
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#ffffff' }}>
                        {item.name}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                        {item.companyName} • {item.sections.length} tables • {item.orientation}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span className="sc-badge-pill">Load</span>
                      {item.id !== 'pm_standard_garment' && (
                        <button
                          type="button"
                          className="sc-saved-del-btn"
                          onClick={(e) => handleDeleteSavedChart(item.id || '', e)}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="sc-modal-footer">
              <button
                type="button"
                className="sc-btn sc-btn-secondary"
                onClick={() => handleLoadPreset('standard_garment')}
                style={{ fontSize: '0.75rem' }}
              >
                Reset Default Preset
              </button>
              <button
                type="button"
                className="sc-btn sc-btn-dark"
                onClick={() => setShowSavedModal(false)}
                style={{ fontSize: '0.75rem' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── GUARANTEED PROFESSIONAL SCOPED STYLES ── */}
      <style jsx>{`
        .size-chart-page {
          min-height: 100vh;
          background: #060913;
          color: #f1f5f9;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Inter', sans-serif;
          padding-bottom: 90px;
        }

        .sc-main {
          max-width: 1080px;
          margin: 0 auto;
          padding: 1rem 0.75rem;
        }

        @media (min-width: 768px) {
          .sc-main {
            padding: 1.5rem 1rem;
          }
        }

        /* ── HEADER ── */
        .sc-header {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 1.25rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        @media (min-width: 768px) {
          .sc-header {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
          }
        }

        .sc-badge {
          display: inline-block;
          font-size: 0.65rem;
          font-weight: 900;
          letter-spacing: 0.08em;
          color: #ea580c;
          background: rgba(234, 88, 12, 0.15);
          border: 1px solid rgba(234, 88, 12, 0.3);
          padding: 2px 8px;
          border-radius: 6px;
          margin-bottom: 0.25rem;
        }

        .sc-title {
          margin: 0;
          font-size: 1.5rem;
          font-weight: 900;
          color: #ffffff;
          letter-spacing: -0.02em;
        }

        .sc-title span {
          color: #ea580c;
        }

        .sc-sub {
          margin: 0.2rem 0 0 0;
          font-size: 0.78rem;
          color: #94a3b8;
          font-weight: 600;
        }

        .sc-top-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        /* ── BUTTON SYSTEM ── */
        .sc-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.55rem 1rem;
          border-radius: 10px;
          font-size: 0.82rem;
          font-weight: 800;
          cursor: pointer;
          border: none;
          transition: all 0.15s ease;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .sc-btn:active {
          transform: scale(0.96);
        }

        .sc-btn-primary {
          background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
          color: #ffffff;
          box-shadow: 0 4px 16px rgba(234, 88, 12, 0.4);
        }

        .sc-btn-primary:hover {
          background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
        }

        .sc-btn-secondary {
          background: rgba(255, 255, 255, 0.08);
          color: #f1f5f9;
          border: 1px solid rgba(255, 255, 255, 0.15);
        }

        .sc-btn-secondary:hover {
          background: rgba(255, 255, 255, 0.14);
        }

        .sc-btn-dark {
          background: #1e293b;
          color: #ffffff;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .sc-btn-dark:hover {
          background: #334155;
        }

        /* ── CARDS ── */
        .sc-card {
          background: rgba(15, 23, 42, 0.75);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
          padding: 1rem;
          backdrop-filter: blur(12px);
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
          margin-bottom: 1rem;
        }

        /* ── SETTINGS BOX ── */
        .sc-settings-box {
          margin-bottom: 1.25rem;
          background: rgba(15, 23, 42, 0.95);
        }

        .sc-box-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          margin-bottom: 0.75rem;
        }

        .sc-close-btn {
          background: transparent;
          border: none;
          color: #94a3b8;
          font-weight: 800;
          font-size: 1rem;
          cursor: pointer;
        }

        .sc-grid-inputs {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 0.75rem;
        }

        .sc-input-group label {
          display: block;
          font-size: 0.72rem;
          font-weight: 800;
          color: #94a3b8;
          margin-bottom: 0.25rem;
          text-transform: uppercase;
        }

        .sc-input-group input {
          width: 100%;
          padding: 0.5rem 0.65rem;
          background: #030712;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          color: #ffffff;
          font-size: 0.82rem;
          font-weight: 700;
          outline: none;
          box-sizing: border-box;
        }

        .sc-input-group input:focus {
          border-color: #ea580c;
        }

        .sc-settings-footer {
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 0.5rem;
        }

        /* ── SEGMENTED NAV BAR ── */
        .sc-nav-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          background: rgba(15, 23, 42, 0.85);
          padding: 0.35rem 0.5rem;
          border-radius: 14px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }

        .sc-tabs-group {
          display: flex;
          gap: 0.25rem;
          background: #030712;
          padding: 0.25rem;
          border-radius: 10px;
        }

        .sc-tab-btn {
          padding: 0.45rem 0.85rem;
          border-radius: 8px;
          border: none;
          background: transparent;
          color: #94a3b8;
          font-size: 0.78rem;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .sc-tab-btn.active {
          background: #ea580c;
          color: #ffffff;
          box-shadow: 0 2px 8px rgba(234, 88, 12, 0.4);
        }

        .sc-specs-pills {
          display: flex;
          align-items: center;
          gap: 0.4rem;
        }

        .sc-pill-toggle {
          padding: 0.4rem 0.75rem;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.05);
          color: #e2e8f0;
          font-size: 0.72rem;
          font-weight: 800;
          cursor: pointer;
        }

        .sc-pill-toggle:hover {
          background: rgba(255, 255, 255, 0.1);
        }

        /* ── SECTION TABS (BODY, HALF SLEEVE, FULL SLEEVE) ── */
        .sc-section-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
          overflow-x: auto;
          padding-bottom: 0.25rem;
        }

        .sc-section-pills {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          overflow-x: auto;
        }

        .sc-sec-item {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }

        .sc-sec-btn {
          display: flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.5rem 0.85rem;
          border-radius: 10px 0 0 10px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-right: none;
          background: rgba(15, 23, 42, 0.9);
          color: #94a3b8;
          font-size: 0.78rem;
          font-weight: 900;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
        }

        .sc-sec-btn.active {
          background: #ea580c;
          color: #ffffff;
          border-color: #ea580c;
          box-shadow: 0 4px 12px rgba(234, 88, 12, 0.35);
        }

        .sc-sec-count {
          font-size: 0.68rem;
          background: rgba(0, 0, 0, 0.3);
          padding: 1px 5px;
          border-radius: 6px;
          font-family: monospace;
        }

        .sc-sec-del {
          padding: 0.5rem 0.5rem;
          border-radius: 0 10px 10px 0;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(15, 23, 42, 0.9);
          color: #f43f5e;
          font-size: 0.75rem;
          font-weight: 900;
          cursor: pointer;
        }

        .sc-sec-del:hover {
          background: rgba(244, 63, 94, 0.2);
        }

        .sc-add-table-btn {
          font-size: 0.72rem;
          padding: 0.45rem 0.75rem;
          white-space: nowrap;
          flex-shrink: 0;
        }

        /* ── SPREADSHEET TABLE CARD ── */
        .sc-table-card {
          padding: 0.75rem;
          overflow: hidden;
        }

        .sc-table-header-strip {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 0.5rem;
          margin-bottom: 0.5rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .sc-title-input {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 6px;
          color: #ffffff;
          font-size: 0.85rem;
          font-weight: 900;
          text-transform: uppercase;
          padding: 0.2rem 0.5rem;
          outline: none;
          width: 140px;
        }

        .sc-table-wrapper {
          overflow-x: auto;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 10px;
          background: #030712;
        }

        .sc-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.82rem;
        }

        .sc-table th {
          background: #1e293b;
          color: #f1f5f9;
          font-weight: 900;
          padding: 0.6rem 0.4rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.15);
          text-transform: uppercase;
          font-size: 0.75rem;
          letter-spacing: 0.05em;
        }

        .sc-table td {
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          padding: 0.35rem 0.4rem;
          vertical-align: middle;
        }

        .sc-td-num {
          text-align: center;
          font-family: monospace;
          color: #64748b;
          font-weight: 700;
          font-size: 0.75rem;
          background: rgba(255, 255, 255, 0.02);
        }

        .sc-cell-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: #ffffff;
          padding: 0.45rem 0.35rem;
          font-size: 0.85rem;
          font-weight: 800;
          text-align: center;
          outline: none;
          box-sizing: border-box;
          transition: border-color 0.15s ease;
        }

        .sc-cell-input:focus {
          border-color: #ea580c;
          background: rgba(234, 88, 12, 0.1);
        }

        .sc-cell-size {
          font-weight: 900;
          color: #38bdf8;
          text-align: center;
        }

        .sc-row-del-btn {
          background: transparent;
          border: none;
          color: #f43f5e;
          font-size: 0.85rem;
          cursor: pointer;
          padding: 0.2rem 0.4rem;
          border-radius: 4px;
        }

        .sc-row-del-btn:hover {
          background: rgba(244, 63, 94, 0.15);
        }

        .sc-table-footer {
          margin-top: 0.75rem;
          display: flex;
          justify-content: flex-end;
        }

        .sc-btn-add-row {
          background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
          color: #ffffff;
          font-size: 0.8rem;
          padding: 0.5rem 1rem;
        }

        /* ── NOTES CARD ── */
        .sc-notes-card {
          margin-top: 1rem;
        }

        .sc-textarea {
          width: 100%;
          background: #030712;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 8px;
          color: #cbd5e1;
          font-size: 0.78rem;
          padding: 0.5rem;
          outline: none;
          font-family: inherit;
          box-sizing: border-box;
          resize: vertical;
        }

        /* ── PREVIEW VIEW ── */
        .sc-preview-card {
          padding: 0.75rem;
          background: #030712;
        }

        .sc-preview-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 0.5rem;
          margin-bottom: 0.75rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .sc-pulse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #10b981;
          display: inline-block;
          box-shadow: 0 0 8px #10b981;
        }

        .sc-scale-btn {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          font-weight: 800;
          font-size: 0.85rem;
          cursor: pointer;
        }

        .sc-slip-container {
          width: 100%;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          display: flex;
          justify-content: flex-start;
          align-items: flex-start;
          padding: 0.5rem 0;
        }

        @media (min-width: 1100px) {
          .sc-slip-container {
            justify-content: center;
          }
        }

        /* ── MOBILE FIXED DOCK ── */
        .sc-mobile-dock {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          padding: 0.5rem 0.75rem;
          background: rgba(6, 9, 19, 0.95);
          backdrop-filter: blur(16px);
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          z-index: 50;
        }

        @media (min-width: 768px) {
          .sc-mobile-dock {
            display: none;
          }
          .size-chart-page {
            padding-bottom: 2rem;
          }
        }

        .sc-dock-btn {
          flex: 1;
          padding: 0.65rem 0.5rem;
          border-radius: 10px;
          font-size: 0.8rem;
          font-weight: 800;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: rgba(255, 255, 255, 0.08);
          color: #ffffff;
          cursor: pointer;
          text-align: center;
        }

        .sc-dock-primary {
          flex: 1.4;
          background: linear-gradient(135deg, #ea580c 0%, #c2410c 100%);
          border-color: #ea580c;
        }

        .sc-dock-dark {
          flex: 0.5;
          background: #1e293b;
        }

        /* ── MODAL ── */
        .sc-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          z-index: 100;
        }

        .sc-modal-card {
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 16px;
          width: 100%;
          max-width: 480px;
          padding: 1.25rem;
          box-shadow: 0 25px 50px rgba(0, 0, 0, 0.7);
        }

        .sc-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          margin-bottom: 0.75rem;
        }

        .sc-modal-body {
          max-height: 280px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .sc-saved-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          cursor: pointer;
        }

        .sc-saved-item:hover {
          border-color: #ea580c;
          background: rgba(234, 88, 12, 0.05);
        }

        .sc-badge-pill {
          font-size: 0.7rem;
          font-weight: 800;
          color: #ea580c;
          background: rgba(234, 88, 12, 0.15);
          padding: 3px 8px;
          border-radius: 6px;
        }

        .sc-saved-del-btn {
          background: transparent;
          border: none;
          color: #f43f5e;
          font-size: 0.85rem;
          cursor: pointer;
          padding: 0.2rem 0.4rem;
        }

        .sc-modal-footer {
          margin-top: 0.75rem;
          padding-top: 0.75rem;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
      `}</style>
    </div>
  );
}
