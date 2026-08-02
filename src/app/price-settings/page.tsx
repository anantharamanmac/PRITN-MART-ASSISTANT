"use client";

import React, { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { getPricingRates, savePricingRates, PricingRates, DEFAULT_PRICING_RATES } from '@/lib/pricing';

export default function PriceSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rates, setRates] = useState<PricingRates>(DEFAULT_PRICING_RATES);
  const [activeTab, setActiveTab] = useState<'sublimation' | 'dtf'>('sublimation');

  // New item input states
  const [newMaterialName, setNewMaterialName] = useState('');
  const [newMaterialRate, setNewMaterialRate] = useState<number | ''>('');

  const [newNeckName, setNewNeckName] = useState('');
  const [newNeckRate, setNewNeckRate] = useState<number | ''>('');

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

      try {
        const fetchedRates = await getPricingRates();
        setRates(fetchedRates);
      } catch (err) {
        console.error('Failed to load rates:', err);
        toast.error('Failed to load pricing rates');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleSaveRates = async () => {
    setSaving(true);
    toast.loading('Saving pricing rates...', { id: 'save-pricing' });

    try {
      await savePricingRates(rates);
      toast.dismiss('save-pricing');
      toast.success('Pricing rates saved successfully!');
    } catch (err) {
      toast.dismiss('save-pricing');
      console.error('Error saving pricing rates:', err);
      toast.error('Failed to save pricing rates.');
    } finally {
      setSaving(false);
    }
  };

  const handleMaterialChange = (mat: string, value: number) => {
    if (activeTab === 'sublimation') {
      setRates((prev) => ({
        ...prev,
        materials: {
          ...prev.materials,
          [mat]: value,
        },
      }));
    } else {
      setRates((prev) => ({
        ...prev,
        dtfMaterials: {
          ...(prev.dtfMaterials || {}),
          [mat]: value,
        },
      }));
    }
  };

  const handleRemoveMaterial = (mat: string) => {
    if (activeTab === 'sublimation') {
      setRates((prev) => {
        const updated = { ...prev.materials };
        delete updated[mat];
        const updatedShorts = { ...(prev.shortsMaterials || {}) };
        delete updatedShorts[mat];
        return { ...prev, materials: updated, shortsMaterials: updatedShorts };
      });
    } else {
      setRates((prev) => {
        const updated = { ...(prev.dtfMaterials || {}) };
        delete updated[mat];
        return { ...prev, dtfMaterials: updated };
      });
    }
  };

  const handleAddMaterial = () => {
    if (!newMaterialName.trim()) {
      toast.error('Please enter a material name');
      return;
    }
    const val = typeof newMaterialRate === 'number' ? newMaterialRate : (activeTab === 'sublimation' ? 250 : 180);
    if (activeTab === 'sublimation') {
      setRates((prev) => ({
        ...prev,
        materials: {
          ...prev.materials,
          [newMaterialName.trim()]: val,
        },
        shortsMaterials: {
          ...(prev.shortsMaterials || {}),
          [newMaterialName.trim()]: 120,
        },
      }));
    } else {
      setRates((prev) => ({
        ...prev,
        dtfMaterials: {
          ...(prev.dtfMaterials || {}),
          [newMaterialName.trim()]: val,
        },
      }));
    }
    setNewMaterialName('');
    setNewMaterialRate('');
    toast.success(`Added ${newMaterialName.trim()} rate ₹${val}!`);
  };

  const handleDtfRateChange = (key: string, value: number) => {
    setRates((prev) => ({
      ...prev,
      dtfRates: {
        ...(prev.dtfRates || {}),
        [key]: value,
      },
    }));
  };

  const handleSleeveChange = (sleeve: string, value: number) => {
    setRates((prev) => ({
      ...prev,
      sleeves: {
        ...prev.sleeves,
        [sleeve]: value,
      },
    }));
  };

  const handleNeckChange = (neck: string, value: number) => {
    setRates((prev) => ({
      ...prev,
      necks: {
        ...prev.necks,
        [neck]: value,
      },
    }));
  };

  const handleRemoveNeck = (neck: string) => {
    setRates((prev) => {
      const updated = { ...prev.necks };
      delete updated[neck];
      return { ...prev, necks: updated };
    });
  };

  const handleAddNeck = () => {
    if (!newNeckName.trim()) {
      toast.error('Please enter a neck/collar type');
      return;
    }
    const val = typeof newNeckRate === 'number' ? newNeckRate : 0;
    setRates((prev) => ({
      ...prev,
      necks: {
        ...prev.necks,
        [newNeckName.trim()]: val,
      },
    }));
    setNewNeckName('');
    setNewNeckRate('');
    toast.success(`Added ${newNeckName.trim()} rate adjustment ₹${val}!`);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
        <div style={{ fontWeight: 800, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h2M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
          Loading Pricing Settings...
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', paddingBottom: '3rem' }}>
      <Navbar user={user} />

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        {/* Page Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
              Receptionist Pricing Rate Settings
            </h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Configure base prices for materials, sleeve adjustments, neck/collar types, and shorts for automatic order amount calculation.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSaveRates}
            disabled={saving}
            style={{
              padding: '0.65rem 1.4rem',
              borderRadius: '10px',
              border: 'none',
              background: '#10b981',
              color: '#ffffff',
              fontWeight: 800,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
              opacity: saving ? 0.7 : 1
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
            <span>{saving ? 'Saving...' : 'Save All Pricing Rates'}</span>
          </button>
        </div>

        {/* Sub-Nav Toggle for Mobile & Quick Switch */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', background: 'var(--bg-surface)', padding: '0.25rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => router.push('/billing')}
            style={{ flex: 1, padding: '0.45rem', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
          >
            📄 Receptionist Billing Hub
          </button>
          <button
            type="button"
            onClick={() => router.push('/price-settings')}
            style={{ flex: 1, padding: '0.45rem', borderRadius: '8px', border: 'none', background: 'var(--sapphire-primary)', color: '#fff', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
          >
            ⚙ Material Price Rates
          </button>
        </div>

        {/* Tab Selection Bar */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', background: 'var(--bg-surface)', padding: '0.25rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setActiveTab('sublimation')}
            style={{
              flex: 1,
              padding: '0.55rem',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'sublimation' ? 'var(--sapphire-primary)' : 'transparent',
              color: activeTab === 'sublimation' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem'
            }}
          >
            👕 Jersey Sublimation Pricing
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dtf')}
            style={{
              flex: 1,
              padding: '0.55rem',
              borderRadius: '8px',
              border: 'none',
              background: activeTab === 'dtf' ? '#ec4899' : 'transparent',
              color: activeTab === 'dtf' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: 800,
              fontSize: '0.85rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem'
            }}
          >
            🎨 Jersey DTF Pricing
          </button>
        </div>

        {/* ── PRICING GRID SECTIONS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>

          {activeTab === 'sublimation' ? (
            <>
              {/* 1. CLOTH / MATERIAL BASE RATES */}
              <div className="card-glass" style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', fontWeight: 800, color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 0-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" /></svg>
                  1. Fabric / Material Base Rate (₹/pc)
                </h3>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Standard base cost per piece for each cloth quality.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
                  {Object.entries(rates.materials).map(([mat, rate]) => (
                    <div key={mat} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', background: 'var(--bg-main)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{mat}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)' }}>₹</span>
                        <input
                          type="number"
                          value={rate}
                          onChange={(e) => handleMaterialChange(mat, Number(e.target.value))}
                          style={{ width: '85px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: '#3b82f6', fontWeight: 800, fontSize: '0.85rem', textAlign: 'right' }}
                        />
                        {mat !== 'Custom / Other' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMaterial(mat)}
                            title="Delete material"
                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.1rem', opacity: 0.7 }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add New Material Bar */}
                <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '0.75rem', display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="text"
                    placeholder="New fabric name..."
                    value={newMaterialName}
                    onChange={(e) => setNewMaterialName(e.target.value)}
                    style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                  />
                  <input
                    type="number"
                    placeholder="Rate (₹)..."
                    value={newMaterialRate}
                    onChange={(e) => setNewMaterialRate(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{ width: '80px', padding: '0.4rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                  />
                  <button
                    type="button"
                    onClick={handleAddMaterial}
                    style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* 2. SLEEVE TYPE ADJUSTMENTS */}
              <div className="card-glass" style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', fontWeight: 800, color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 0-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" /></svg>
                  2. Sleeve Type Adjustment (₹/pc)
                </h3>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Extra charge or discount added per piece based on sleeve option.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', background: 'var(--bg-main)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Full Sleeve (F)</span>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Extra charge for full sleeve fabric</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)' }}>₹</span>
                      <input
                        type="number"
                        value={rates.sleeves.full ?? 30}
                        onChange={(e) => handleSleeveChange('full', Number(e.target.value))}
                        style={{ width: '85px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: '#10b981', fontWeight: 800, fontSize: '0.85rem', textAlign: 'right' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', background: 'var(--bg-main)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Half Sleeve (H)</span>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Standard base sleeve rate</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)' }}>₹</span>
                      <input
                        type="number"
                        value={rates.sleeves.half ?? 0}
                        onChange={(e) => handleSleeveChange('half', Number(e.target.value))}
                        style={{ width: '85px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: '#10b981', fontWeight: 800, fontSize: '0.85rem', textAlign: 'right' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', background: 'var(--bg-main)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <div>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>Sleeveless (SL)</span>
                      <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Discount / deduction for sleeveless</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)' }}>₹</span>
                      <input
                        type="number"
                        value={rates.sleeves.sleeveless ?? -10}
                        onChange={(e) => handleSleeveChange('sleeveless', Number(e.target.value))}
                        style={{ width: '85px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: '#10b981', fontWeight: 800, fontSize: '0.85rem', textAlign: 'right' }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. NECK & COLLAR ADJUSTMENTS */}
              <div className="card-glass" style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', fontWeight: 800, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" /></svg>
                  3. Neck & Collar Type Adjustment (₹/pc)
                </h3>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Extra charge added for Collar, V-Neck, Chinese Collar, etc.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
                  {Object.entries(rates.necks).map(([nk, rate]) => (
                    <div key={nk} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', background: 'var(--bg-main)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{nk}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)' }}>₹</span>
                        <input
                          type="number"
                          value={rate}
                          onChange={(e) => handleNeckChange(nk, Number(e.target.value))}
                          style={{ width: '85px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: '#f59e0b', fontWeight: 800, fontSize: '0.85rem', textAlign: 'right' }}
                        />
                        {nk !== 'Round Neck' && nk !== 'Custom / Other' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveNeck(nk)}
                            title="Delete neck type"
                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.1rem', opacity: 0.7 }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add New Neck Type Bar */}
                <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '0.75rem', display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="text"
                    placeholder="New neck/collar name..."
                    value={newNeckName}
                    onChange={(e) => setNewNeckName(e.target.value)}
                    style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                  />
                  <input
                    type="number"
                    placeholder="Rate (₹)..."
                    value={newNeckRate}
                    onChange={(e) => setNewNeckRate(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{ width: '80px', padding: '0.4rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                  />
                  <button
                    type="button"
                    onClick={handleAddNeck}
                    style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', background: '#f59e0b', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* 4. SHORTS ADD-ON RATE */}
              <div className="card-glass" style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', fontWeight: 800, color: '#ec4899', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v18h16V2H4zm2 2h4v12H6V4zm12 12h-4V4h4v12z" /></svg>
                  4. Shorts / Pant Add-On Rate (₹/pc)
                </h3>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Extra rate per piece added when Shorts are included in the order, varying by material.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
                  {Object.entries(rates.materials).map(([mat, _]) => {
                    const shortsRateVal = rates.shortsMaterials?.[mat] ?? rates.shortsRate ?? 120;
                    return (
                      <div key={`shorts-${mat}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', background: 'var(--bg-main)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{mat}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)' }}>₹</span>
                          <input
                            type="number"
                            value={shortsRateVal}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setRates((prev) => ({
                                ...prev,
                                shortsMaterials: {
                                  ...(prev.shortsMaterials || {}),
                                  [mat]: val,
                                },
                              }));
                            }}
                            style={{ width: '85px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: '#ec4899', fontWeight: 800, fontSize: '0.85rem', textAlign: 'right' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* General Fallback Rate */}
                <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', background: 'var(--bg-main)', padding: '0.75rem 1rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  <div>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>Default Shorts Rate</span>
                    <span style={{ display: 'block', fontSize: '0.73rem', color: 'var(--text-secondary)' }}>Fallback rate if material matches none of the above</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-secondary)' }}>₹</span>
                    <input
                      type="number"
                      value={rates.shortsRate}
                      onChange={(e) => setRates((prev) => ({ ...prev, shortsRate: Number(e.target.value) }))}
                      style={{ width: '95px', padding: '0.45rem 0.6rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: '#ec4899', fontWeight: 900, fontSize: '0.95rem', textAlign: 'right' }}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* 1. DTF CLOTH / MATERIAL BASE RATES */}
              <div className="card-glass" style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', fontWeight: 800, color: '#ec4899', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 0-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z" /></svg>
                  1. DTF Fabric / Material Base Rate (₹/pc)
                </h3>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Standard base cost per piece for each cloth quality in DTF orders.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1rem' }}>
                  {Object.entries(rates.dtfMaterials || DEFAULT_PRICING_RATES.dtfMaterials || {}).map(([mat, rate]) => (
                    <div key={`dtf-${mat}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', background: 'var(--bg-main)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{mat}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)' }}>₹</span>
                        <input
                          type="number"
                          value={rate}
                          onChange={(e) => handleMaterialChange(mat, Number(e.target.value))}
                          style={{ width: '85px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: '#ec4899', fontWeight: 800, fontSize: '0.85rem', textAlign: 'right' }}
                        />
                        {mat !== 'Custom / Other' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMaterial(mat)}
                            title="Delete material"
                            style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.1rem', opacity: 0.7 }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add New DTF Material Bar */}
                <div style={{ borderTop: '1px dashed var(--border)', paddingTop: '0.75rem', display: 'flex', gap: '0.4rem' }}>
                  <input
                    type="text"
                    placeholder="New fabric name..."
                    value={newMaterialName}
                    onChange={(e) => setNewMaterialName(e.target.value)}
                    style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                  />
                  <input
                    type="number"
                    placeholder="Rate (₹)..."
                    value={newMaterialRate}
                    onChange={(e) => setNewMaterialRate(e.target.value === '' ? '' : Number(e.target.value))}
                    style={{ width: '80px', padding: '0.4rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                  />
                  <button
                    type="button"
                    onClick={handleAddMaterial}
                    style={{ padding: '0.4rem 0.75rem', borderRadius: '6px', border: 'none', background: '#ec4899', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                  >
                    + Add
                  </button>
                </div>
              </div>

              {/* 2. DTF PRINT PLACEMENT & SIZE MODIFIERS */}
              <div className="card-glass" style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                <h3 style={{ margin: '0 0 0.25rem 0', fontSize: '1.1rem', fontWeight: 800, color: '#ec4899', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 22 22 22 12 2" /></svg>
                  2. DTF Placement & Size Modifiers (₹/pc)
                </h3>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Extra rate per piece added based on printing location or sheet size.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {[
                    { key: 'front', label: 'Front Only', desc: 'DTF printed on the front side only' },
                    { key: 'back', label: 'Back Only', desc: 'DTF printed on the back side only' },
                    { key: 'front and back', label: 'Front & Back', desc: 'DTF printed on both front and back sides' },
                    { key: 'a4 size', label: 'A4 Size', desc: 'Standard A4 size sheet placement' },
                    { key: 'a3 size', label: 'A3 Size', desc: 'Larger A3 size sheet placement' }
                  ].map(({ key, label, desc }) => {
                    const rateVal = rates.dtfRates?.[key] ?? DEFAULT_PRICING_RATES.dtfRates?.[key] ?? 0;
                    return (
                      <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', background: 'var(--bg-main)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <div>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{label}</span>
                          <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{desc}</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-secondary)' }}>₹</span>
                          <input
                            type="number"
                            value={rateVal}
                            onChange={(e) => handleDtfRateChange(key, Number(e.target.value))}
                            style={{ width: '85px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: '#ec4899', fontWeight: 800, fontSize: '0.85rem', textAlign: 'right' }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

        </div>
      </main>
    </div>
  );
}
