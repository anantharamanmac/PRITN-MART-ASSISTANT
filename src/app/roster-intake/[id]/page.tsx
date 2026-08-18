"use client";

import React, { useEffect, useState, useRef, use } from 'react';
import { toast, Toaster } from 'react-hot-toast';
import { OrderRecord, PlayerItem, findOrderByInfoNumber, updateOrder } from '@/lib/db';
import { doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { parseExcelText, parseExcelFile, calculateSizeBreakdown, calculateShortsBreakdown, convertLetterSizeToNumber } from '@/lib/excelParser';

const COLLAR_OPTIONS = [
  'Round Neck',
  'V-Neck',
  'Polo Collar',
  'Chinese Collar',
  'Collar with Button',
  'Sublimation Collar',
  'Custom Collar'
];

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function CustomerRosterIntakePage({ params }: PageProps) {
  const resolvedParams = use(params);
  const rawId = resolvedParams.id;

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);

  // Animated Tutorial Modal State
  const [showTutorial, setShowTutorial] = useState(true);
  const [currentSlide, setCurrentSlide] = useState(0);

  // Form states
  const [players, setPlayers] = useState<PlayerItem[]>([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerNumber, setNewPlayerNumber] = useState('');
  const [newPlayerSize, setNewPlayerSize] = useState('42');
  const [newPlayerSleeve, setNewPlayerSleeve] = useState('F');
  const [newPlayerCollar, setNewPlayerCollar] = useState('Round Neck');
  const [newPlayerShortsSize, setNewPlayerShortsSize] = useState('32');
  const [isNewPlayerGK, setIsNewPlayerGK] = useState(false);

  const [customerNotes, setCustomerNotes] = useState('');
  const [showExcelBox, setShowExcelBox] = useState(false);
  const [excelInputText, setExcelInputText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function loadOrder() {
      setLoading(true);
      try {
        let foundOrder: OrderRecord | null = null;

        // 1. Try public server API endpoint first (unauthenticated friendly)
        try {
          const res = await fetch(`/api/public/roster-intake/${encodeURIComponent(rawId)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.order) {
              foundOrder = data.order as OrderRecord;
            }
          }
        } catch (apiErr) {
          console.warn('Public API order load failed, attempting client fallback:', apiErr);
        }

        // 2. Fallback to client-side multi-strategy lookup if API was unavailable
        if (!foundOrder && rawId) {
          const numVal = Number(rawId);
          foundOrder = await findOrderByInfoNumber(!isNaN(numVal) ? numVal : rawId);
        }

        if (foundOrder) {
          setOrder(foundOrder);
          setNewPlayerCollar(foundOrder.neckType || 'Round Neck');
          
          if (foundOrder.customerRosterDraft && foundOrder.customerRosterDraft.length > 0) {
            setPlayers(foundOrder.customerRosterDraft);
          } else if (foundOrder.players && foundOrder.players.length > 0) {
            setPlayers(foundOrder.players);
          } else {
            const defaultSleeveCode = foundOrder.sleeveType === 'sleeveless' ? 'SL' : foundOrder.sleeveType === 'half' ? 'H' : 'F';
            const initialBlankRows: PlayerItem[] = Array.from({ length: 5 }).map(() => ({
              name: '',
              number: '',
              size: '',
              xxx: 'XXX',
              sleeve: defaultSleeveCode,
              collar: foundOrder.neckType || 'Round Neck',
              isGK: false,
              ...(foundOrder.hasShorts ? { shortsSize: '' } : {})
            }));
            setPlayers(initialBlankRows);
          }
          if (foundOrder.customerNotes) {
            setCustomerNotes(foundOrder.customerNotes);
          }
        }
      } catch (err) {
        console.error('Failed to load order for customer portal:', err);
        toast.error('Unable to load order details. Please verify the link.');
      } finally {
        setLoading(false);
      }
    }

    loadOrder();
  }, [rawId]);

  const defaultSleeveCode = order?.sleeveType === 'sleeveless' ? 'SL' : order?.sleeveType === 'half' ? 'H' : 'F';

  // Add Manual Player
  const handleAddPlayer = () => {
    if (!newPlayerName.trim() && !newPlayerNumber.trim()) {
      toast.error('Please enter Player Name or Jersey Number');
      return;
    }

    const item: PlayerItem = {
      name: newPlayerName.trim().toUpperCase(),
      number: newPlayerNumber.trim(),
      size: convertLetterSizeToNumber(newPlayerSize.trim()),
      sleeve: newPlayerSleeve || defaultSleeveCode,
      collar: newPlayerCollar || order?.neckType || 'Round Neck',
      isGK: isNewPlayerGK,
    };

    if (order?.hasShorts && newPlayerShortsSize.trim()) {
      item.shortsSize = convertLetterSizeToNumber(newPlayerShortsSize.trim());
    }

    setPlayers((prev) => [...prev, item]);
    setNewPlayerName('');
    setNewPlayerNumber('');
    setIsNewPlayerGK(false);
    toast.success(`Added ${item.name || `No. ${item.number}`}!`);
  };

  // Remove Player
  const handleRemovePlayer = (idx: number) => {
    setPlayers((prev) => prev.filter((_, i) => i !== idx));
  };

  // Update Field Inline
  const handleUpdateField = (idx: number, field: keyof PlayerItem, val: any) => {
    setPlayers((prev) =>
      prev.map((p, i) => (i === idx ? { ...p, [field]: val } : p))
    );
  };

  // Parse Excel Text
  const handleParseExcelText = () => {
    if (!excelInputText.trim()) {
      toast.error('Please paste roster text first');
      return;
    }
    const parsed = parseExcelText(excelInputText);
    if (parsed.length === 0) {
      toast.error('Could not detect any valid roster rows.');
      return;
    }

    const updated = parsed.map((p) => ({
      ...p,
      sleeve: p.sleeve || defaultSleeveCode,
      collar: p.collar || order?.neckType || 'Round Neck',
    }));

    setPlayers((prev) => [...prev, ...updated]);
    setExcelInputText('');
    setShowExcelBox(false);
    toast.success(`Imported ${parsed.length} players!`);
  };

  // Parse File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      toast.loading('Reading roster file...', { id: 'file-upload' });
      const parsed = await parseExcelFile(file);
      toast.dismiss('file-upload');
      if (parsed.length === 0) {
        toast.error('No player details found in file.');
        return;
      }

      const updated = parsed.map((p) => ({
        ...p,
        sleeve: p.sleeve || defaultSleeveCode,
        collar: p.collar || order?.neckType || 'Round Neck',
      }));

      setPlayers((prev) => [...prev, ...updated]);
      toast.success(`Imported ${parsed.length} players from ${file.name}!`);
    } catch (err) {
      toast.dismiss('file-upload');
      toast.error('Failed to parse file.');
    }
  };

  // Submit Roster to Admin
  const handleSubmitRoster = async () => {
    if (!order?.id) return;
    if (players.length === 0) {
      toast.error('Please add at least 1 player to submit the roster.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Attempt public API submission first (unauthenticated friendly)
      let submittedViaApi = false;
      try {
        const res = await fetch(`/api/public/roster-intake/${encodeURIComponent(order.id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orderId: order.id,
            players,
            customerNotes: customerNotes.trim(),
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.success) {
            submittedViaApi = true;
          }
        }
      } catch (apiErr) {
        console.warn('API submission failed, falling back to direct Firestore update:', apiErr);
      }

      // 2. Fallback to direct client-side update if API was unreachable
      if (!submittedViaApi) {
        await updateOrder(order.id, {
          customerRosterDraft: players,
          rosterStatus: 'pending_admin_approval',
          customerSubmittedAt: serverTimestamp() as any,
          customerNotes: customerNotes.trim(),
        });
      }

      setSubmittedSuccess(true);
      toast.success('Roster submitted successfully to Print Mart!');
    } catch (err) {
      console.error('Error submitting customer roster:', err);
      toast.error('Failed to submit roster. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const { summaryString } = calculateSizeBreakdown(players);
  const { summaryString: shortsSummaryString } = calculateShortsBreakdown(players);

  // Tutorial Slides Definition
  const tutorialSlides = [
    {
      icon: '👕',
      badge: 'Step 1 of 4: Order Overview',
      title: 'Welcome to Print Mart Roster Entry!',
      description: 'Check your team order specifications (Customer Name, Info No, Item Type, Fabric, Master Neck/Collar & Sleeve defaults) before adding player details.',
      highlightText: `INFO #${order?.infoNumber || 2412} — ${order?.customerName || 'Customer'} (${order?.orderTitle || order?.itemType || 'JERSEY'})`,
      tip: 'Everything is saved safely as a draft until you submit.'
    },
    {
      icon: '✍️',
      badge: 'Step 2 of 4: Add Team Members',
      title: 'Fill Name, Jersey No, Size & Sleeve',
      description: 'Add players 1-by-1 by filling Name, Jersey Number, Shirt Size (34-50), Sleeve Option (Full/Half/Sleeveless), and Collar Style.',
      demoItem: { name: 'JAGAN', number: '9', size: '42', sleeve: 'Full (F)', collar: 'Round Neck' },
      tip: 'Toggle Goal Keeper (+ GK) for Goal Keepers to mark them in red!'
    },
    {
      icon: '📋',
      badge: 'Step 3 of 4: Fast Bulk Import',
      title: 'Copy-Paste from Excel or WhatsApp',
      description: 'Already have a player list? Click "Paste Excel" or "Excel Upload" to import all team members at once with 1 click!',
      tip: 'Supports Excel columns: Name, Size, Number, Sleeve, Collar.'
    },
    {
      icon: '🚀',
      badge: 'Step 4 of 4: Send to Print Mart',
      title: 'Review & Submit to Production',
      description: 'Once all players are added, tap "Submit Roster". Our admin team will verify and approve your specs for production setup!',
      tip: 'You can return and edit your submission anytime using this link.'
    }
  ];

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#18181b', color: '#f4f4f5', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", padding: '1rem' }}>
        <style jsx global>{`
          @keyframes pulseGlow {
            0%, 100% { opacity: 0.7; transform: scale(0.98); }
            50% { opacity: 1; transform: scale(1.05); }
          }
          @keyframes shimmerWave {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
          @keyframes barFill {
            0% { width: 10%; }
            50% { width: 68%; }
            100% { width: 95%; }
          }
          .skeleton-shimmer {
            background: linear-gradient(90deg, #27272a 25%, #3f3f46 50%, #27272a 75%);
            background-size: 200% 100%;
            animation: shimmerWave 1.8s infinite linear;
          }
        `}</style>

        {/* Excel Window Loading Card */}
        <div style={{ width: '100%', maxWidth: '640px', background: '#1e1e1e', borderRadius: '16px', border: '1.5px solid #107c41', boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 35px rgba(16, 124, 65, 0.25)', overflow: 'hidden' }}>
          
          {/* Top Excel Ribbon Bar */}
          <div style={{ background: '#107c41', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '32px', height: '32px', background: '#ffffff', color: '#107c41', borderRadius: '6px', fontWeight: 900, fontSize: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.2)', animation: 'pulseGlow 2s infinite ease-in-out' }}>
              X
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff', letterSpacing: '0.02em' }}>Opening Excel Roster Workbook...</div>
              <div style={{ fontSize: '11px', color: '#a7f3d0' }}>Print Mart Live Roster Sheet</div>
            </div>
          </div>

          {/* Excel Formula Bar Skeleton */}
          <div style={{ background: '#252526', borderBottom: '1px solid #3c3c3c', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#107c41', fontWeight: 900, fontSize: '14px', fontFamily: 'monospace' }}>fx</span>
            <div style={{ width: '1px', height: '16px', background: '#3c3c3c' }} />
            <div className="skeleton-shimmer" style={{ height: '14px', borderRadius: '4px', flex: 1 }} />
          </div>

          {/* Main Skeleton Grid Table */}
          <div style={{ padding: '16px' }}>
            {/* Header Columns Skeleton */}
            <div style={{ display: 'grid', gridTemplateColumns: '40px 2fr 1fr 1fr 1fr 1.2fr', gap: '4px', marginBottom: '8px' }}>
              <div style={{ background: '#2d2d2d', height: '24px', borderRadius: '3px' }} />
              <div style={{ background: '#107c41', color: '#fff', height: '24px', borderRadius: '3px', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>A: NAME</div>
              <div style={{ background: '#2d2d2d', color: '#ccc', height: '24px', borderRadius: '3px', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>B: NO</div>
              <div style={{ background: '#2d2d2d', color: '#ccc', height: '24px', borderRadius: '3px', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>C: XXX</div>
              <div style={{ background: '#2d2d2d', color: '#ccc', height: '24px', borderRadius: '3px', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>D: SIZE</div>
              <div style={{ background: '#2d2d2d', color: '#ccc', height: '24px', borderRadius: '3px', fontSize: '10px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>E: SLEEVE</div>
            </div>

            {/* Skeletons Rows */}
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 2fr 1fr 1fr 1fr 1.2fr', gap: '4px', marginBottom: '4px' }}>
                <div style={{ background: '#2d2d2d', height: '32px', borderRadius: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', color: '#858585', fontWeight: 700 }}>{i + 1}</div>
                <div className="skeleton-shimmer" style={{ height: '32px', borderRadius: '3px' }} />
                <div className="skeleton-shimmer" style={{ height: '32px', borderRadius: '3px' }} />
                <div className="skeleton-shimmer" style={{ height: '32px', borderRadius: '3px' }} />
                <div className="skeleton-shimmer" style={{ height: '32px', borderRadius: '3px' }} />
                <div className="skeleton-shimmer" style={{ height: '32px', borderRadius: '3px' }} />
              </div>
            ))}

            {/* Animated Loading Bar */}
            <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#10b981', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <span>📊</span>
                <span>Fetching Print Mart Team Specifications...</span>
              </div>

              <div style={{ width: '100%', height: '6px', background: '#27272a', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg, #107c41, #10b981)', borderRadius: '3px', animation: 'barFill 2s ease-in-out infinite' }} />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', color: '#f0f6fc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ maxWidth: '420px', width: '100%', textAlign: 'center', background: '#161b22', padding: '2rem 1.5rem', borderRadius: '16px', border: '1px solid #30363d' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔍</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ef4444', marginBottom: '0.5rem' }}>Order Not Found</h2>
          <p style={{ fontSize: '0.875rem', color: '#8b949e', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            We could not find an order matching this link. Please check your link or contact Print Mart support.
          </p>
        </div>
      </div>
    );
  }

  if (submittedSuccess) {
    return (
      <div style={{ minHeight: '100vh', background: '#0d1117', color: '#f0f6fc', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <Toaster position="top-right" />
        <div style={{ maxWidth: '520px', width: '100%', background: '#161b22', padding: '2rem 1.25rem', borderRadius: '20px', border: '1px solid #10b981', textAlign: 'center', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.2)', border: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '2rem', color: '#10b981' }}>
            ✓
          </div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 900, color: '#ffffff', marginBottom: '0.4rem' }}>Roster Submitted!</h2>
          <p style={{ fontSize: '0.875rem', color: '#10b981', fontWeight: 700, marginBottom: '1rem' }}>
            INFO NO. #{order.infoNumber} — {order.customerName} ({order.orderTitle || order.itemType || 'JERSEY'})
          </p>

          <div style={{ background: '#0d1117', padding: '1rem', borderRadius: '12px', border: '1px solid #30363d', marginBottom: '1.5rem', textAlign: 'left', fontSize: '0.825rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
              <span style={{ color: '#8b949e' }}>Total Players Submitted:</span>
              <strong style={{ color: '#ffffff' }}>{players.length} Players</strong>
            </div>
            {summaryString && (
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem' }}>
                <span style={{ color: '#8b949e' }}>Shirt Size Summary:</span>
                <strong style={{ color: '#3b82f6' }}>{summaryString}</strong>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#8b949e' }}>Status:</span>
              <span style={{ background: 'rgba(234, 179, 8, 0.2)', color: '#f59e0b', padding: '0.15rem 0.5rem', borderRadius: '4px', fontWeight: 800, fontSize: '0.75rem' }}>
                Pending Admin Approval
              </span>
            </div>
          </div>

          <p style={{ fontSize: '0.85rem', color: '#8b949e', lineHeight: 1.5, marginBottom: '1.5rem' }}>
            Thank you! Your player roster details have been submitted to Print Mart team for review.
          </p>

          <button
            onClick={() => setSubmittedSuccess(false)}
            style={{ minHeight: '44px', width: '100%', padding: '0.75rem', borderRadius: '12px', border: '1px solid #30363d', background: '#21262d', color: '#f0f6fc', fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}
          >
            ✏️ Edit Submitted Roster
          </button>
        </div>
      </div>
    );
  }

  const handleAddBlankRow = () => {
    const defaultSleeveCode = order?.sleeveType === 'sleeveless' ? 'SL' : order?.sleeveType === 'half' ? 'H' : 'F';
    const item: PlayerItem = {
      name: '',
      number: '',
      size: '42',
      xxx: 'XXX',
      sleeve: defaultSleeveCode,
      collar: order?.neckType || 'Round Neck',
      isGK: false,
    };
    if (order?.hasShorts) {
      item.shortsSize = '32';
    }
    setPlayers((prev) => [...prev, item]);
  };

  const handleApplySleeveToAll = (sleeveVal: string) => {
    setPlayers((prev) => prev.map((p) => ({ ...p, sleeve: sleeveVal })));
    toast.success(`Applied ${sleeveVal === 'F' ? 'Full Sleeve' : sleeveVal === 'H' ? 'Half Sleeve' : 'Sleeveless'} to all players!`);
  };

  const handleApplyCollarToAll = (collarVal: string) => {
    setPlayers((prev) => prev.map((p) => ({ ...p, collar: collarVal })));
    toast.success(`Applied ${collarVal} collar to all players!`);
  };

  const handleClearAllRows = () => {
    if (players.length === 0) return;
    if (window.confirm('Are you sure you want to clear all roster rows?')) {
      setPlayers([]);
      toast.success('Cleared all rows');
    }
  };

  const bottomLabel = order.bottomType === 'track_pant' ? 'Track Pant' : 'Shorts';
  const activeSlideData = tutorialSlides[currentSlide];


  return (
    <div style={{ minHeight: '100vh', background: '#1e1e1e', color: '#d4d4d4', fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", paddingBottom: '6rem' }}>
      <Toaster position="top-right" />

      {/* Excel Sheet CSS & Animation Overrides */}
      <style jsx global>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        .excel-table-grid {
          border-collapse: collapse;
          width: 100%;
          font-size: 13px;
        }

        .excel-table-grid th, .excel-table-grid td {
          border: 1px solid #3c3c3c;
          padding: 0;
        }

        .excel-header-col {
          background: #252526;
          color: #cccccc;
          font-weight: 700;
          font-size: 11px;
          text-align: center;
          padding: 6px 8px !important;
          user-select: none;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .excel-row-num {
          background: #2d2d2d;
          color: #858585;
          font-weight: 700;
          font-size: 11px;
          text-align: center;
          width: 38px;
          user-select: none;
        }

        .excel-cell-input {
          width: 100%;
          height: 36px;
          background: transparent;
          border: none;
          outline: none;
          color: #ffffff;
          font-family: 'Segoe UI', sans-serif;
          font-size: 13px;
          font-weight: 600;
          padding: 4px 8px;
          box-sizing: border-box;
        }

        .excel-cell-input:focus {
          background: rgba(16, 124, 65, 0.15);
          box-shadow: inset 0 0 0 2px #107c41;
        }

        .excel-cell-select {
          width: 100%;
          height: 36px;
          background: transparent;
          border: none;
          outline: none;
          color: #10b981;
          font-weight: 700;
          font-size: 12px;
          padding: 4px;
          cursor: pointer;
        }

        .excel-cell-select option {
          background: #1e1e1e;
          color: #ffffff;
        }

        .excel-ribbon-btn {
          height: 32px;
          padding: 0 10px;
          border-radius: 4px;
          border: 1px solid #3c3c3c;
          background: #2d2d2d;
          color: #ffffff;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          display: inline-flex;
          alignItems: center;
          gap: 5px;
          transition: all 0.15s ease;
        }

        .excel-ribbon-btn:hover {
          background: #107c41;
          border-color: #107c41;
          color: #ffffff;
        }

        @media (max-width: 768px) {
          .excel-sheet-wrapper {
            overflow-x: auto;
          }
        }
      `}</style>

      {/* ── MS EXCEL BRAND TOP RIBBON HEADER ── */}
      <div style={{ background: '#107c41', color: '#ffffff', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ background: '#ffffff', color: '#107c41', fontWeight: 900, fontSize: '14px', width: '28px', height: '28px', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            X
          </div>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>PrintMart_Roster_INFO_#{order.infoNumber}.xlsx</span>
              <span style={{ background: 'rgba(255,255,255,0.2)', padding: '1px 6px', borderRadius: '3px', fontSize: '10px', textTransform: 'uppercase' }}>Spreadsheet Mode</span>
            </div>
            <div style={{ fontSize: '11px', opacity: 0.9 }}>
              Customer: <strong>{order.customerName}</strong> ({order.orderTitle || order.itemType || 'JERSEY'}) — Fabric: {order.clothType || 'SALEENA'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            type="button"
            onClick={() => {
              setCurrentSlide(0);
              setShowTutorial(true);
            }}
            style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#ffffff', padding: '5px 10px', borderRadius: '4px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
          >
            ❓ Help Guide
          </button>
        </div>
      </div>

      {/* ── EXCEL TOOLBAR / RIBBON CONTROLS ── */}
      <div style={{ background: '#2d2d2d', borderBottom: '1px solid #3c3c3c', padding: '6px 12px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="excel-ribbon-btn"
        >
          📁 Upload Excel (.csv / .xlsx)
        </button>
        <input type="file" ref={fileInputRef} accept=".xlsx, .xls, .csv" onChange={handleFileUpload} style={{ display: 'none' }} />

        <button
          type="button"
          onClick={() => setShowExcelBox(!showExcelBox)}
          className="excel-ribbon-btn"
          style={{ background: showExcelBox ? '#107c41' : '#2d2d2d' }}
        >
          📋 {showExcelBox ? 'Close Paste Box' : 'Paste Excel Text'}
        </button>

        <button
          type="button"
          onClick={handleAddBlankRow}
          className="excel-ribbon-btn"
        >
          ➕ Add Blank Row
        </button>

        {/* Quick Sleeve Bulk Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#252526', padding: '2px 6px', borderRadius: '4px', border: '1px solid #3c3c3c' }}>
          <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 700 }}>Sleeve All:</span>
          <button type="button" onClick={() => handleApplySleeveToAll('F')} style={{ background: '#1e1e1e', border: '1px solid #3c3c3c', color: '#fff', fontSize: '10px', padding: '2px 5px', borderRadius: '3px', cursor: 'pointer', fontWeight: 700 }}>Full (F)</button>
          <button type="button" onClick={() => handleApplySleeveToAll('H')} style={{ background: '#1e1e1e', border: '1px solid #3c3c3c', color: '#fff', fontSize: '10px', padding: '2px 5px', borderRadius: '3px', cursor: 'pointer', fontWeight: 700 }}>Half (H)</button>
          <button type="button" onClick={() => handleApplySleeveToAll('SL')} style={{ background: '#1e1e1e', border: '1px solid #3c3c3c', color: '#fff', fontSize: '10px', padding: '2px 5px', borderRadius: '3px', cursor: 'pointer', fontWeight: 700 }}>Sleeveless (SL)</button>
        </div>

        {/* Quick Collar Bulk Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#252526', padding: '2px 6px', borderRadius: '4px', border: '1px solid #3c3c3c' }}>
          <span style={{ fontSize: '11px', color: '#3b82f6', fontWeight: 700 }}>Collar All:</span>
          <select
            onChange={(e) => e.target.value && handleApplyCollarToAll(e.target.value)}
            defaultValue=""
            style={{ background: '#1e1e1e', color: '#ffffff', border: '1px solid #3c3c3c', fontSize: '10px', padding: '2px 4px', borderRadius: '3px' }}
          >
            <option value="" disabled>Apply Collar Style to All Rows...</option>
            {COLLAR_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handleClearAllRows}
          className="excel-ribbon-btn"
          style={{ marginLeft: 'auto', color: '#ef4444', borderColor: 'rgba(239,68,68,0.4)' }}
        >
          🧹 Clear All
        </button>
      </div>

      {/* ── EXCEL FORMULA BAR ── */}
      <div style={{ background: '#252526', borderBottom: '1px solid #3c3c3c', padding: '4px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ color: '#107c41', fontWeight: 900, fontSize: '13px', fontFamily: 'monospace' }}>fx</span>
        <div style={{ width: '1px', height: '16px', background: '#3c3c3c' }} />
        <div style={{ flex: 1, color: '#cccccc', fontSize: '12px', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          =ROSTER_DATA(NAME, NUMBER, XXX, SIZE, SLEEVE, COLLAR) — {players.filter(p => p.name || p.number).length} active player rows
        </div>
      </div>

      {/* Paste Box Area */}
      {showExcelBox && (
        <div style={{ background: '#252526', padding: '12px', borderBottom: '2px solid #107c41', margin: '0 0 10px' }}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#10b981', marginBottom: '4px' }}>
            📋 Paste columns directly from Excel / WhatsApp / CSV (Column Format: NAME, NUMBER, XXX, SIZE):
          </label>
          <textarea
            rows={4}
            placeholder={`NIJU,06,XXX,44\nVISHNU S,5,XXX,40\nVINOD,18,XXX,40\nNISHAD,3,XXX,42\nABHISHEK,7,XXX,38`}
            value={excelInputText}
            onChange={(e) => setExcelInputText(e.target.value)}
            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #3c3c3c', background: '#1e1e1e', color: '#ffffff', fontFamily: 'monospace', fontSize: '12px' }}
          />
          <button
            type="button"
            onClick={handleParseExcelText}
            style={{ marginTop: '6px', padding: '8px 16px', borderRadius: '4px', border: 'none', background: '#107c41', color: '#fff', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
          >
            Import Parsed Rows into Sheet
          </button>
        </div>
      )}

      {/* ── EXCEL SPREADSHEET GRID TABLE ── */}
      <div style={{ padding: '8px' }}>
        <div className="excel-sheet-wrapper" style={{ background: '#1e1e1e', border: '1px solid #3c3c3c', borderRadius: '4px', overflowX: 'auto', minHeight: '380px' }}>
          <table className="excel-table-grid">
            <thead>
              <tr>
                <th className="excel-header-col" style={{ width: '38px' }}></th>
                <th className="excel-header-col" style={{ minWidth: '150px' }}>A: NAME</th>
                <th className="excel-header-col" style={{ width: '90px' }}>B: NUMBER</th>
                <th className="excel-header-col" style={{ width: '80px' }}>C: XXX</th>
                <th className="excel-header-col" style={{ width: '90px' }}>D: SIZE</th>
                <th className="excel-header-col" style={{ width: '120px' }}>E: SLEEVE</th>
                <th className="excel-header-col" style={{ width: '140px' }}>F: COLLAR</th>
                {order.hasShorts && <th className="excel-header-col" style={{ width: '100px', color: '#10b981' }}>G: {bottomLabel}</th>}
                <th className="excel-header-col" style={{ width: '50px' }}>GK</th>
                <th className="excel-header-col" style={{ width: '45px' }}></th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, idx) => {
                const isGK = Boolean(p.isGK);
                return (
                  <tr key={idx} style={{ background: isGK ? 'rgba(239, 68, 68, 0.15)' : (idx % 2 === 0 ? '#1e1e1e' : '#252526') }}>
                    {/* Row Number */}
                    <td className="excel-row-num">{idx + 1}</td>

                    {/* Col A: Name */}
                    <td>
                      <input
                        type="text"
                        placeholder="Player Name"
                        value={p.name}
                        onChange={(e) => handleUpdateField(idx, 'name', e.target.value.toUpperCase())}
                        className="excel-cell-input"
                        style={{ color: isGK ? '#ef4444' : '#ffffff' }}
                      />
                    </td>

                    {/* Col B: Number */}
                    <td>
                      <input
                        type="text"
                        placeholder="No."
                        value={p.number}
                        onChange={(e) => handleUpdateField(idx, 'number', e.target.value)}
                        className="excel-cell-input"
                        style={{ textAlign: 'center', color: '#3b82f6' }}
                      />
                    </td>

                    {/* Col C: XXX */}
                    <td>
                      <input
                        type="text"
                        placeholder="XXX"
                        value={p.xxx || 'XXX'}
                        onChange={(e) => handleUpdateField(idx, 'xxx', e.target.value)}
                        className="excel-cell-input"
                        style={{ textAlign: 'center', color: '#858585' }}
                      />
                    </td>

                    {/* Col D: Size */}
                    <td>
                      <input
                        type="text"
                        placeholder="42"
                        value={p.size}
                        onChange={(e) => handleUpdateField(idx, 'size', e.target.value)}
                        className="excel-cell-input"
                        style={{ textAlign: 'center', fontWeight: 800 }}
                      />
                    </td>

                    {/* Col E: Sleeve */}
                    <td>
                      <select
                        value={p.sleeve || 'F'}
                        onChange={(e) => handleUpdateField(idx, 'sleeve', e.target.value)}
                        className="excel-cell-select"
                      >
                        <option value="F">Full (F)</option>
                        <option value="H">Half (H)</option>
                        <option value="SL">Sleeveless (SL)</option>
                      </select>
                    </td>

                    {/* Col F: Collar */}
                    <td>
                      <select
                        value={p.collar || order.neckType || 'Round Neck'}
                        onChange={(e) => handleUpdateField(idx, 'collar', e.target.value)}
                        className="excel-cell-select"
                        style={{ color: '#ffffff' }}
                      >
                        {COLLAR_OPTIONS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>

                    {/* Col G: Shorts Size (Optional) */}
                    {order.hasShorts && (
                      <td>
                        <input
                          type="text"
                          placeholder="32"
                          value={p.shortsSize || ''}
                          onChange={(e) => handleUpdateField(idx, 'shortsSize', e.target.value)}
                          className="excel-cell-input"
                          style={{ textAlign: 'center', color: '#10b981' }}
                        />
                      </td>
                    )}

                    {/* Col H: Goal Keeper Marker */}
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleUpdateField(idx, 'isGK', !isGK)}
                        style={{
                          width: '28px',
                          height: '24px',
                          borderRadius: '3px',
                          border: isGK ? '1px solid #ef4444' : '1px solid #3c3c3c',
                          background: isGK ? '#ef4444' : 'transparent',
                          color: isGK ? '#ffffff' : '#858585',
                          fontSize: '10px',
                          fontWeight: 800,
                          cursor: 'pointer'
                        }}
                      >
                        {isGK ? 'GK' : '-'}
                      </button>
                    </td>

                    {/* Col I: Action (Delete) */}
                    <td style={{ textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleRemovePlayer(idx)}
                        style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '13px', fontWeight: 800 }}
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

        {/* Add Row Button under table */}
        <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
          <button
            type="button"
            onClick={handleAddBlankRow}
            style={{ padding: '6px 14px', borderRadius: '4px', border: '1px dashed #107c41', background: 'rgba(16, 124, 65, 0.1)', color: '#10b981', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
          >
            + Add Row to Excel Sheet
          </button>
        </div>
      </div>

      {/* ── EXCEL BOTTOM SUMMARY BAR & SHEET TABS ── */}
      <div style={{ background: '#252526', borderTop: '1px solid #3c3c3c', padding: '6px 12px', margin: '8px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ background: '#1e1e1e', border: '1px solid #107c41', color: '#10b981', padding: '3px 10px', borderRadius: '3px', fontWeight: 800 }}>
            📄 Sheet1: Player Roster
          </span>
          <span style={{ color: '#858585' }}>Total Rows: <strong>{players.filter(p => p.name || p.number).length}</strong></span>
        </div>

        {summaryString && (
          <div style={{ color: '#3b82f6', fontWeight: 700 }}>
            👕 Shirt Sizes: {summaryString}
          </div>
        )}
        {order.hasShorts && shortsSummaryString && (
          <div style={{ color: '#10b981', fontWeight: 700 }}>
            🩳 Shorts Sizes: {shortsSummaryString}
          </div>
        )}
      </div>

      {/* Customer Remarks Box */}
      <div style={{ padding: '0 8px', marginBottom: '1rem' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#cccccc', marginBottom: '4px' }}>
          Customer Remarks / Special Instructions (Optional):
        </label>
        <textarea
          rows={2}
          placeholder="e.g. Please ensure Captain jersey #10 has full sleeve and collar logo..."
          value={customerNotes}
          onChange={(e) => setCustomerNotes(e.target.value)}
          style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #3c3c3c', background: '#252526', color: '#ffffff', fontSize: '12px' }}
        />
      </div>

      {/* ── FLOATING SUBMIT ROSTER BAR ── */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#1e1e1e', borderTop: '2px solid #107c41', padding: '10px 16px', backdropFilter: 'blur(10px)', zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 -10px 25px rgba(0,0,0,0.6)' }}>
        <div>
          <span style={{ fontSize: '11px', color: '#858585', display: 'block' }}>INFO #{order.infoNumber} — {order.customerName}</span>
          <strong style={{ fontSize: '14px', color: '#ffffff' }}>{players.filter(p => p.name || p.number).length} Players Ready in Excel Sheet</strong>
        </div>

        <button
          type="button"
          onClick={handleSubmitRoster}
          disabled={submitting || players.filter(p => p.name || p.number).length === 0}
          style={{
            height: '42px',
            padding: '0 24px',
            borderRadius: '6px',
            border: 'none',
            background: '#107c41',
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: 900,
            cursor: submitting || players.filter(p => p.name || p.number).length === 0 ? 'not-allowed' : 'pointer',
            opacity: submitting || players.filter(p => p.name || p.number).length === 0 ? 0.6 : 1,
            boxShadow: '0 4px 14px rgba(16, 124, 65, 0.4)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <span>{submitting ? 'Submitting Excel Sheet...' : '🚀 SUBMIT ROSTER TO PRINT MART'}</span>
        </button>
      </div>

      {/* ── ANIMATED POPUP TUTORIAL MODAL SLIDES ── */}
      {showTutorial && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0, 0, 0, 0.88)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="popup-modal-container" style={{ width: '100%', maxWidth: '500px', background: '#161b22', borderRadius: '24px', border: '1.5px solid #107c41', boxShadow: '0 25px 60px rgba(0,0,0,0.8), 0 0 40px rgba(16, 124, 65, 0.25)', padding: '1.75rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
            
            {/* Top Bar with Skip Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.73rem', fontWeight: 900, color: '#107c41', background: 'rgba(16, 124, 65, 0.15)', padding: '0.25rem 0.65rem', borderRadius: '20px', border: '1px solid rgba(16, 124, 65, 0.3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {activeSlideData.badge}
              </span>

              <button
                type="button"
                onClick={() => setShowTutorial(false)}
                style={{ background: 'transparent', border: 'none', color: '#8b949e', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', padding: '0.25rem 0.5rem', borderRadius: '6px' }}
              >
                Skip ✕
              </button>
            </div>

            {/* Slide Content */}
            <div key={currentSlide} className="slide-animated-content" style={{ minHeight: '240px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {/* Icon Banner */}
              <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(16, 124, 65, 0.15)', border: '2px solid #107c41', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', fontSize: '2.5rem' }}>
                  {activeSlideData.icon}
                </div>
                <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.35rem', fontWeight: 900, color: '#ffffff' }}>
                  {activeSlideData.title}
                </h2>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#c9d1d9', lineHeight: 1.5 }}>
                  {activeSlideData.description}
                </p>
              </div>

              <div style={{ background: 'rgba(16, 124, 65, 0.1)', padding: '0.6rem 0.85rem', borderRadius: '10px', border: '1px solid rgba(16, 124, 65, 0.3)', fontSize: '0.78rem', color: '#10b981', fontWeight: 700, textAlign: 'center' }}>
                💡 {activeSlideData.tip}
              </div>
            </div>

            {/* Slide Dots Progress Indicator */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.4rem', margin: '1.25rem 0 1.25rem' }}>
              {tutorialSlides.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentSlide(idx)}
                  style={{
                    width: currentSlide === idx ? '24px' : '8px',
                    height: '8px',
                    borderRadius: '4px',
                    background: currentSlide === idx ? '#107c41' : '#30363d',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer'
                  }}
                />
              ))}
            </div>

            {/* Navigation Action Buttons */}
            <div style={{ display: 'flex', gap: '0.65rem' }}>
              {currentSlide > 0 ? (
                <button
                  type="button"
                  onClick={() => setCurrentSlide((prev) => Math.max(0, prev - 1))}
                  style={{ flex: 1, minHeight: '44px', borderRadius: '12px', border: '1px solid #30363d', background: '#21262d', color: '#f0f6fc', fontWeight: 800, fontSize: '0.875rem', cursor: 'pointer' }}
                >
                  ⬅ Previous
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTutorial(false)}
                  style={{ flex: 1, minHeight: '44px', borderRadius: '12px', border: '1px solid #30363d', background: '#0d1117', color: '#8b949e', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Skip Guide
                </button>
              )}

              {currentSlide < tutorialSlides.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentSlide((prev) => Math.min(tutorialSlides.length - 1, prev + 1))}
                  style={{ flex: 2, minHeight: '44px', borderRadius: '12px', border: 'none', background: '#107c41', color: '#ffffff', fontWeight: 900, fontSize: '0.9rem', cursor: 'pointer' }}
                >
                  Next Step ➔
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTutorial(false)}
                  style={{ flex: 2, minHeight: '44px', borderRadius: '12px', border: 'none', background: '#107c41', color: '#ffffff', fontWeight: 900, fontSize: '0.9rem', cursor: 'pointer' }}
                >
                  🚀 Open Excel Sheet
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
