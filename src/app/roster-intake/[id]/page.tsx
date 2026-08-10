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

        const numVal = Number(rawId);
        if (!isNaN(numVal) && numVal > 0) {
          foundOrder = await findOrderByInfoNumber(numVal);
        }

        if (!foundOrder) {
          const docRef = doc(db, 'orders', rawId);
          const snap = await getDoc(docRef);
          if (snap.exists()) {
            foundOrder = { id: snap.id, ...snap.data() } as OrderRecord;
          }
        }

        if (foundOrder) {
          setOrder(foundOrder);
          setNewPlayerCollar(foundOrder.neckType || 'Round Neck');
          
          if (foundOrder.customerRosterDraft && foundOrder.customerRosterDraft.length > 0) {
            setPlayers(foundOrder.customerRosterDraft);
          } else if (foundOrder.players && foundOrder.players.length > 0) {
            setPlayers(foundOrder.players);
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
      await updateOrder(order.id, {
        customerRosterDraft: players,
        rosterStatus: 'pending_admin_approval',
        customerSubmittedAt: serverTimestamp() as any,
        customerNotes: customerNotes.trim(),
      });

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
      <div style={{ minHeight: '100vh', background: '#0d1117', color: '#f0f6fc', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: '44px', height: '44px', border: '3px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
          <p style={{ fontWeight: 600, color: '#8b949e' }}>Loading Order Details...</p>
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

  const bottomLabel = order.bottomType === 'track_pant' ? 'Track Pant' : 'Shorts';
  const activeSlideData = tutorialSlides[currentSlide];

  return (
    <div style={{ minHeight: '100vh', background: '#0d1117', color: '#f0f6fc', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '0.75rem', paddingBottom: '5.5rem' }}>
      <Toaster position="top-right" />

      {/* Animations & Mobile CSS Overrides */}
      <style jsx global>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes popupScaleIn {
          0% { opacity: 0; transform: scale(0.88) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }

        @keyframes slideContentFade {
          0% { opacity: 0; transform: translateX(16px); }
          100% { opacity: 1; transform: translateX(0); }
        }

        @keyframes floatPulse {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }

        .popup-modal-container {
          animation: popupScaleIn 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .slide-animated-content {
          animation: slideContentFade 0.3s ease-out forwards;
        }
        
        .roster-input {
          font-size: 16px !important; /* Prevents iOS auto-zoom on input focus */
          min-height: 44px;
        }

        @media (max-width: 640px) {
          .mobile-stack-header {
            flex-direction: column;
            align-items: flex-start !important;
            gap: 0.5rem;
          }
          .mobile-full-btn {
            width: 100% !important;
            justify-content: center !important;
          }
          .mobile-desktop-table {
            display: none !important;
          }
          .mobile-card-list {
            display: flex !important;
          }
        }

        @media (min-width: 641px) {
          .mobile-card-list {
            display: none !important;
          }
          .mobile-desktop-table {
            display: block !important;
          }
        }
      `}</style>

      {/* ── ANIMATED POPUP TUTORIAL MODAL SLIDES ── */}
      {showTutorial && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0, 0, 0, 0.88)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="popup-modal-container" style={{ width: '100%', maxWidth: '500px', background: '#161b22', borderRadius: '24px', border: '1.5px solid #3b82f6', boxShadow: '0 25px 60px rgba(0,0,0,0.8), 0 0 40px rgba(59, 130, 246, 0.25)', padding: '1.75rem 1.5rem', position: 'relative', overflow: 'hidden' }}>
            
            {/* Top Bar with Skip Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.73rem', fontWeight: 900, color: '#3b82f6', background: 'rgba(59, 130, 246, 0.15)', padding: '0.25rem 0.65rem', borderRadius: '20px', border: '1px solid rgba(59, 130, 246, 0.3)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
            <div key={currentSlide} className="slide-animated-content" style={{ minHeight: '260px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              {/* Icon Banner */}
              <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'rgba(59, 130, 246, 0.15)', border: '2px solid #3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', fontSize: '2.5rem', animation: 'floatPulse 3s ease-in-out infinite' }}>
                  {activeSlideData.icon}
                </div>
                <h2 style={{ margin: '0 0 0.4rem', fontSize: '1.35rem', fontWeight: 900, color: '#ffffff' }}>
                  {activeSlideData.title}
                </h2>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#c9d1d9', lineHeight: 1.5 }}>
                  {activeSlideData.description}
                </p>
              </div>

              {/* Slide Custom Preview Boxes */}
              {activeSlideData.highlightText && (
                <div style={{ background: '#0d1117', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid #30363d', fontSize: '0.825rem', color: '#3b82f6', fontWeight: 800, textAlign: 'center', marginBottom: '0.75rem' }}>
                  📌 Order Info: {activeSlideData.highlightText}
                </div>
              )}

              {activeSlideData.demoItem && (
                <div style={{ background: '#0d1117', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid #30363d', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', color: '#8b949e', fontWeight: 700, marginBottom: '0.3rem', textTransform: 'uppercase' }}>Sample Entry Preview:</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 800, color: '#ffffff' }}>
                    <span>👤 {activeSlideData.demoItem.name}</span>
                    <span style={{ color: '#10b981' }}>No. {activeSlideData.demoItem.number}</span>
                    <span style={{ color: '#3b82f6' }}>Size {activeSlideData.demoItem.size}</span>
                  </div>
                </div>
              )}

              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.6rem 0.85rem', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '0.78rem', color: '#10b981', fontWeight: 700, textAlign: 'center' }}>
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
                    background: currentSlide === idx ? '#3b82f6' : '#30363d',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
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
                  style={{ flex: 1, minHeight: '46px', borderRadius: '12px', border: '1px solid #30363d', background: '#21262d', color: '#f0f6fc', fontWeight: 800, fontSize: '0.875rem', cursor: 'pointer' }}
                >
                  ⬅ Previous
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTutorial(false)}
                  style={{ flex: 1, minHeight: '46px', borderRadius: '12px', border: '1px solid #30363d', background: '#0d1117', color: '#8b949e', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
                >
                  Skip Guide
                </button>
              )}

              {currentSlide < tutorialSlides.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentSlide((prev) => Math.min(tutorialSlides.length - 1, prev + 1))}
                  style={{ flex: 2, minHeight: '46px', borderRadius: '12px', border: 'none', background: '#3b82f6', color: '#ffffff', fontWeight: 900, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)' }}
                >
                  Next Step ➔
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowTutorial(false)}
                  style={{ flex: 2, minHeight: '46px', borderRadius: '12px', border: 'none', background: '#10b981', color: '#ffffff', fontWeight: 900, fontSize: '0.9rem', cursor: 'pointer', boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)' }}
                >
                  🚀 Got It! Start Filling Roster
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div style={{ maxWidth: '880px', margin: '0 auto' }}>
        {/* Mobile-Friendly Header */}
        <header className="mobile-stack-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: '1px solid #30363d', marginBottom: '1rem' }}>
          <div>
            <span style={{ background: '#d92525', color: '#fff', fontSize: '0.7rem', fontWeight: 900, padding: '0.2rem 0.5rem', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Print Mart Assistant
            </span>
            <h1 style={{ margin: '0.25rem 0 0', fontSize: '1.25rem', fontWeight: 900, color: '#ffffff' }}>
              Customer Player Roster Entry
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => {
                setCurrentSlide(0);
                setShowTutorial(true);
              }}
              style={{ padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid #3b82f6', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}
            >
              ❓ Guide Tutorial
            </button>

            <div>
              <span style={{ fontSize: '0.72rem', color: '#8b949e' }}>Ref: </span>
              <strong style={{ fontSize: '1.05rem', color: '#ef4444', fontWeight: 900 }}>INFO #{order.infoNumber}</strong>
            </div>
          </div>
        </header>

        {/* Order Details Banner */}
        <div style={{ background: '#161b22', borderRadius: '14px', border: '1px solid #30363d', padding: '0.85rem 1rem', marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '0.65rem' }}>
          <div>
            <span style={{ fontSize: '0.7rem', color: '#8b949e', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Customer Name</span>
            <strong style={{ fontSize: '0.9rem', color: '#ffffff' }}>{order.customerName}</strong>
          </div>

          <div>
            <span style={{ fontSize: '0.7rem', color: '#8b949e', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Item / Team Title</span>
            <strong style={{ fontSize: '0.9rem', color: '#3b82f6' }}>{order.orderTitle || order.itemType || 'JERSEY'}</strong>
          </div>

          <div>
            <span style={{ fontSize: '0.7rem', color: '#8b949e', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Fabric / Cloth</span>
            <strong style={{ fontSize: '0.9rem', color: '#ffffff' }}>{order.clothType || 'SALEENA'}</strong>
          </div>

          <div>
            <span style={{ fontSize: '0.7rem', color: '#8b949e', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Master Specs</span>
            <strong style={{ fontSize: '0.825rem', color: '#10b981' }}>{order.neckType || 'Round Neck'} ({order.sleeveType?.toUpperCase() || 'FULL'})</strong>
          </div>
        </div>

        {/* Customer Note */}
        <div style={{ background: 'rgba(59, 130, 246, 0.1)', borderLeft: '4px solid #3b82f6', padding: '0.65rem 0.85rem', borderRadius: '8px', fontSize: '0.8rem', color: '#c9d1d9', marginBottom: '1rem', lineHeight: 1.5 }}>
          💡 <strong>Tip for Mobile Users:</strong> Add players 1-by-1 below, or copy-paste from WhatsApp/Excel!
        </div>

        {/* Main Roster Container */}
        <div style={{ background: '#161b22', borderRadius: '16px', border: '1px solid #30363d', padding: '1rem', marginBottom: '1rem' }}>
          {/* Roster Header + Excel Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 900, color: '#ffffff' }}>
              👥 Player Roster ({players.length} Total)
            </h3>

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', width: '100%', justifyContent: 'flex-start' }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mobile-full-btn"
                style={{ flex: 1, minHeight: '40px', padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #10b981', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              >
                📁 Excel Upload
              </button>
              <input type="file" ref={fileInputRef} accept=".xlsx, .xls, .csv" onChange={handleFileUpload} style={{ display: 'none' }} />

              <button
                type="button"
                onClick={() => setShowExcelBox(!showExcelBox)}
                className="mobile-full-btn"
                style={{ flex: 1, minHeight: '40px', padding: '0.4rem 0.75rem', borderRadius: '8px', border: '1px solid #3b82f6', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontSize: '0.78rem', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              >
                {showExcelBox ? 'Hide Paste' : '📋 Paste Excel'}
              </button>
            </div>
          </div>

          {/* Paste Box */}
          {showExcelBox && (
            <div style={{ background: '#0d1117', padding: '0.75rem', borderRadius: '10px', border: '1px solid #3b82f6', marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#8b949e', marginBottom: '0.3rem' }}>
                Paste columns directly from Excel / WhatsApp (Name, Size, Number, Sleeve, Collar):
              </label>
              <textarea
                rows={4}
                placeholder={`Paste lines here, e.g.:\nJAGAN\t42\t9\tF\tRound Neck\nADHI\t40\t3\tH\tV-Neck`}
                value={excelInputText}
                onChange={(e) => setExcelInputText(e.target.value)}
                className="roster-input"
                style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid #30363d', background: '#161b22', color: '#ffffff', fontFamily: 'monospace' }}
              />
              <button
                type="button"
                onClick={handleParseExcelText}
                style={{ width: '100%', minHeight: '42px', marginTop: '0.5rem', borderRadius: '8px', border: 'none', background: '#3b82f6', color: '#fff', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer' }}
              >
                Import Parsed Players
              </button>
            </div>
          )}

          {/* Touch-Friendly Add Player Form Box */}
          <div style={{ background: '#0d1117', padding: '0.85rem', borderRadius: '14px', border: '1px solid #30363d', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#10b981', display: 'block', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              + Add New Player Entry
            </span>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#8b949e', marginBottom: '0.2rem' }}>Player Name</label>
                <input
                  type="text"
                  placeholder="e.g. JAGAN"
                  value={newPlayerName}
                  onChange={(e) => setNewPlayerName(e.target.value)}
                  className="roster-input"
                  style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '8px', border: isNewPlayerGK ? '1.5px solid #ef4444' : '1px solid #30363d', background: '#161b22', color: '#ffffff', fontWeight: 700 }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#8b949e', marginBottom: '0.2rem' }}>Jersey No.</label>
                  <input
                    type="text"
                    placeholder="9"
                    value={newPlayerNumber}
                    onChange={(e) => setNewPlayerNumber(e.target.value)}
                    className="roster-input"
                    style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid #30363d', background: '#161b22', color: '#ffffff', fontWeight: 700, textAlign: 'center' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#8b949e', marginBottom: '0.2rem' }}>Shirt Size</label>
                  <input
                    type="text"
                    placeholder="42"
                    value={newPlayerSize}
                    onChange={(e) => setNewPlayerSize(e.target.value)}
                    className="roster-input"
                    style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid #30363d', background: '#161b22', color: '#ffffff', fontWeight: 700, textAlign: 'center' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#8b949e', marginBottom: '0.2rem' }}>Sleeve</label>
                  <select
                    value={newPlayerSleeve}
                    onChange={(e) => setNewPlayerSleeve(e.target.value)}
                    className="roster-input"
                    style={{ width: '100%', padding: '0.45rem 0.4rem', borderRadius: '8px', border: '1px solid #30363d', background: '#161b22', color: '#3b82f6', fontWeight: 800 }}
                  >
                    <option value="F">Full (F)</option>
                    <option value="H">Half (H)</option>
                    <option value="SL">Sleeveless (SL)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#8b949e', marginBottom: '0.2rem' }}>Collar Style</label>
                  <select
                    value={newPlayerCollar}
                    onChange={(e) => setNewPlayerCollar(e.target.value)}
                    className="roster-input"
                    style={{ width: '100%', padding: '0.45rem 0.4rem', borderRadius: '8px', border: '1px solid #30363d', background: '#161b22', color: '#ffffff' }}
                  >
                    {COLLAR_OPTIONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {order.hasShorts && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#10b981', marginBottom: '0.2rem' }}>{bottomLabel} Size</label>
                  <input
                    type="text"
                    placeholder="32"
                    value={newPlayerShortsSize}
                    onChange={(e) => setNewPlayerShortsSize(e.target.value)}
                    className="roster-input"
                    style={{ width: '100%', padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid #10b981', background: '#161b22', color: '#10b981', fontWeight: 800, textAlign: 'center' }}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.5rem', marginTop: '0.2rem' }}>
                <button
                  type="button"
                  onClick={() => setIsNewPlayerGK(!isNewPlayerGK)}
                  style={{ minHeight: '44px', borderRadius: '8px', border: isNewPlayerGK ? '1.5px solid #ef4444' : '1px solid #30363d', background: isNewPlayerGK ? '#ef4444' : '#161b22', color: isNewPlayerGK ? '#ffffff' : '#8b949e', fontSize: '0.8rem', fontWeight: 900, cursor: 'pointer' }}
                >
                  {isNewPlayerGK ? '✓ GK' : '+ GK'}
                </button>

                <button
                  type="button"
                  onClick={handleAddPlayer}
                  style={{ minHeight: '44px', borderRadius: '8px', border: 'none', background: '#10b981', color: '#ffffff', fontSize: '0.9rem', fontWeight: 900, cursor: 'pointer', boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)' }}
                >
                  + Add Entry
                </button>
              </div>
            </div>
          </div>

          {/* 1. Mobile Cards List View (< 640px) */}
          {players.length > 0 ? (
            <>
              <div className="mobile-card-list" style={{ flexDirection: 'column', gap: '0.65rem' }}>
                {players.map((p, idx) => {
                  const isGK = Boolean(p.isGK);
                  return (
                    <div
                      key={idx}
                      style={{
                        background: isGK ? 'rgba(239, 68, 68, 0.15)' : '#0d1117',
                        border: isGK ? '1.5px solid #ef4444' : '1px solid #30363d',
                        borderRadius: '12px',
                        padding: '0.75rem'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '0.4rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.75rem', color: '#8b949e', fontWeight: 800 }}>#{idx + 1}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateField(idx, 'isGK', !isGK)}
                            style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', border: isGK ? '1px solid #ef4444' : '1px solid #30363d', background: isGK ? '#ef4444' : 'transparent', color: isGK ? '#fff' : '#8b949e', fontSize: '0.7rem', fontWeight: 800 }}
                          >
                            {isGK ? '✓ GK' : '+ GK'}
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemovePlayer(idx)}
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '1.1rem', fontWeight: 900, cursor: 'pointer', padding: '0.2rem 0.5rem' }}
                        >
                          ✕
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.4rem', marginBottom: '0.4rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: '#8b949e' }}>Name</label>
                          <input
                            type="text"
                            value={p.name}
                            onChange={(e) => handleUpdateField(idx, 'name', e.target.value)}
                            className="roster-input"
                            style={{ width: '100%', padding: '0.35rem 0.4rem', borderRadius: '6px', border: '1px solid #30363d', background: '#161b22', color: isGK ? '#ef4444' : '#ffffff', fontWeight: 700 }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: '#8b949e' }}>No.</label>
                          <input
                            type="text"
                            value={p.number}
                            onChange={(e) => handleUpdateField(idx, 'number', e.target.value)}
                            className="roster-input"
                            style={{ width: '100%', padding: '0.35rem 0.4rem', borderRadius: '6px', border: '1px solid #30363d', background: '#161b22', color: '#ffffff', fontWeight: 700, textAlign: 'center' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: '#8b949e' }}>Shirt Size</label>
                          <input
                            type="text"
                            value={p.size}
                            onChange={(e) => handleUpdateField(idx, 'size', e.target.value)}
                            className="roster-input"
                            style={{ width: '100%', padding: '0.35rem 0.4rem', borderRadius: '6px', border: '1px solid #30363d', background: '#161b22', color: '#ffffff', fontWeight: 700, textAlign: 'center' }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: order.hasShorts ? '1fr 1.5fr 1fr' : '1fr 1.5fr', gap: '0.4rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: '#8b949e' }}>Sleeve</label>
                          <select
                            value={p.sleeve || 'F'}
                            onChange={(e) => handleUpdateField(idx, 'sleeve', e.target.value)}
                            className="roster-input"
                            style={{ width: '100%', padding: '0.35rem 0.2rem', borderRadius: '6px', border: '1px solid #3b82f6', background: '#161b22', color: '#3b82f6', fontWeight: 800 }}
                          >
                            <option value="F">F (Full)</option>
                            <option value="H">H (Half)</option>
                            <option value="SL">SL (Sleeveless)</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.68rem', color: '#8b949e' }}>Collar</label>
                          <select
                            value={p.collar || order.neckType || 'Round Neck'}
                            onChange={(e) => handleUpdateField(idx, 'collar', e.target.value)}
                            className="roster-input"
                            style={{ width: '100%', padding: '0.35rem 0.2rem', borderRadius: '6px', border: '1px solid #30363d', background: '#161b22', color: '#ffffff' }}
                          >
                            {COLLAR_OPTIONS.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        </div>

                        {order.hasShorts && (
                          <div>
                            <label style={{ display: 'block', fontSize: '0.68rem', color: '#10b981' }}>{bottomLabel}</label>
                            <input
                              type="text"
                              value={p.shortsSize || ''}
                              onChange={(e) => handleUpdateField(idx, 'shortsSize', e.target.value)}
                              className="roster-input"
                              style={{ width: '100%', padding: '0.35rem 0.4rem', borderRadius: '6px', border: '1px solid #10b981', background: '#161b22', color: '#10b981', fontWeight: 800, textAlign: 'center' }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 2. Desktop Table View (>= 641px) */}
              <div className="mobile-desktop-table" style={{ overflowX: 'auto', border: '1px solid #30363d', borderRadius: '10px', maxHeight: '350px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.825rem', textAlign: 'left' }}>
                  <thead style={{ background: '#21262d', color: '#8b949e', position: 'sticky', top: 0, zIndex: 1 }}>
                    <tr>
                      <th style={{ padding: '8px 10px', width: '30px' }}>#</th>
                      <th style={{ padding: '8px 10px' }}>Player Name</th>
                      <th style={{ padding: '8px 8px', width: '45px', color: '#ef4444', textAlign: 'center' }}>GK</th>
                      <th style={{ padding: '8px 10px', width: '70px' }}>No.</th>
                      <th style={{ padding: '8px 10px', width: '80px' }}>Shirt Size</th>
                      <th style={{ padding: '8px 10px', width: '90px', color: '#3b82f6' }}>Sleeve</th>
                      <th style={{ padding: '8px 10px', width: '130px' }}>Collar / Neck</th>
                      {order.hasShorts && <th style={{ padding: '8px 10px', width: '90px', color: '#10b981' }}>{bottomLabel}</th>}
                      <th style={{ padding: '8px 10px', textAlign: 'right', width: '40px' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map((p, idx) => {
                      const isGK = Boolean(p.isGK);
                      return (
                        <tr key={idx} style={{ borderTop: '1px solid #30363d', background: isGK ? 'rgba(239, 68, 68, 0.15)' : 'transparent' }}>
                          <td style={{ padding: '6px 10px', color: '#8b949e' }}>{idx + 1}</td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              type="text"
                              value={p.name}
                              onChange={(e) => handleUpdateField(idx, 'name', e.target.value)}
                              style={{ width: '100%', padding: '0.3rem 0.4rem', borderRadius: '4px', border: '1px solid #30363d', background: '#0d1117', color: isGK ? '#ef4444' : '#ffffff', fontWeight: 700, fontSize: '0.8rem' }}
                            />
                          </td>
                          <td style={{ padding: '4px 4px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => handleUpdateField(idx, 'isGK', !isGK)}
                              style={{ padding: '0.2rem 0.4rem', borderRadius: '4px', border: isGK ? '1px solid #ef4444' : '1px solid #30363d', background: isGK ? '#ef4444' : 'transparent', color: isGK ? '#fff' : '#8b949e', fontSize: '0.7rem', fontWeight: 800, cursor: 'pointer' }}
                            >
                              {isGK ? 'GK' : '-'}
                            </button>
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              type="text"
                              value={p.number}
                              onChange={(e) => handleUpdateField(idx, 'number', e.target.value)}
                              style={{ width: '100%', padding: '0.3rem 0.4rem', borderRadius: '4px', border: '1px solid #30363d', background: '#0d1117', color: '#ffffff', fontSize: '0.8rem' }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <input
                              type="text"
                              value={p.size}
                              onChange={(e) => handleUpdateField(idx, 'size', e.target.value)}
                              style={{ width: '100%', padding: '0.3rem 0.4rem', borderRadius: '4px', border: '1px solid #30363d', background: '#0d1117', color: '#ffffff', fontSize: '0.8rem' }}
                            />
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <select
                              value={p.sleeve || 'F'}
                              onChange={(e) => handleUpdateField(idx, 'sleeve', e.target.value)}
                              style={{ width: '100%', padding: '0.3rem 0.2rem', borderRadius: '4px', border: '1px solid #3b82f6', background: '#0d1117', color: '#3b82f6', fontSize: '0.8rem', fontWeight: 700 }}
                            >
                              <option value="F">F (Full)</option>
                              <option value="H">H (Half)</option>
                              <option value="SL">SL (Sleeveless)</option>
                            </select>
                          </td>
                          <td style={{ padding: '4px 6px' }}>
                            <select
                              value={p.collar || order.neckType || 'Round Neck'}
                              onChange={(e) => handleUpdateField(idx, 'collar', e.target.value)}
                              style={{ width: '100%', padding: '0.3rem 0.2rem', borderRadius: '4px', border: '1px solid #30363d', background: '#0d1117', color: '#ffffff', fontSize: '0.78rem' }}
                            >
                              {COLLAR_OPTIONS.map((c) => (
                                <option key={c} value={c}>{c}</option>
                              ))}
                            </select>
                          </td>
                          {order.hasShorts && (
                            <td style={{ padding: '4px 6px' }}>
                              <input
                                type="text"
                                value={p.shortsSize || ''}
                                onChange={(e) => handleUpdateField(idx, 'shortsSize', e.target.value)}
                                style={{ width: '100%', padding: '0.3rem 0.4rem', borderRadius: '4px', border: '1px solid #10b981', background: '#0d1117', color: '#10b981', fontWeight: 700, fontSize: '0.8rem' }}
                              />
                            </td>
                          )}
                          <td style={{ padding: '4px 6px', textAlign: 'right' }}>
                            <button
                              type="button"
                              onClick={() => handleRemovePlayer(idx)}
                              style={{ background: 'transparent', border: 'none', color: '#ef4444', fontSize: '1rem', fontWeight: 700, cursor: 'pointer' }}
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
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '1.75rem 1rem', background: '#0d1117', borderRadius: '12px', border: '1px dashed #30363d', color: '#8b949e', fontSize: '0.85rem' }}>
              No players added yet. Use the form above to add your team members.
            </div>
          )}

          {/* Roster Summaries */}
          {summaryString && (
            <div style={{ marginTop: '0.75rem', padding: '0.55rem 0.75rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.3)', fontSize: '0.78rem', color: '#3b82f6', fontWeight: 700 }}>
              👕 Shirt Size Summary: {summaryString}
            </div>
          )}
          {order.hasShorts && shortsSummaryString && (
            <div style={{ marginTop: '0.4rem', padding: '0.55rem 0.75rem', background: 'rgba(16, 185, 129, 0.1)', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.3)', fontSize: '0.78rem', color: '#10b981', fontWeight: 700 }}>
              🩳 {bottomLabel} Summary: {shortsSummaryString}
            </div>
          )}

          {/* Customer Additional Remarks */}
          <div style={{ marginTop: '1rem' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: '#c9d1d9', marginBottom: '0.3rem' }}>
              Customer Remarks / Special Requests (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Captain shirt needs a special star logo or custom sleeve line..."
              value={customerNotes}
              onChange={(e) => setCustomerNotes(e.target.value)}
              className="roster-input"
              style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid #30363d', background: '#0d1117', color: '#ffffff', resize: 'vertical' }}
            />
          </div>
        </div>

        {/* Floating Mobile Bottom Action Bar */}
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#161b22', borderTop: '1px solid #30363d', padding: '0.75rem 1rem', backdropFilter: 'blur(12px)', zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 -10px 25px rgba(0,0,0,0.5)' }}>
          <div>
            <span style={{ fontSize: '0.7rem', color: '#8b949e', display: 'block' }}>INFO #{order.infoNumber}</span>
            <strong style={{ fontSize: '0.9rem', color: '#ffffff' }}>{players.length} Player(s) Added</strong>
          </div>

          <button
            type="button"
            onClick={handleSubmitRoster}
            disabled={submitting || players.length === 0}
            style={{
              minHeight: '44px',
              padding: '0.65rem 1.25rem',
              borderRadius: '10px',
              border: 'none',
              background: '#10b981',
              color: '#ffffff',
              fontSize: '0.9rem',
              fontWeight: 900,
              cursor: submitting || players.length === 0 ? 'not-allowed' : 'pointer',
              opacity: submitting || players.length === 0 ? 0.6 : 1,
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem'
            }}
          >
            <span>{submitting ? 'Submitting...' : '🚀 Submit Roster'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
