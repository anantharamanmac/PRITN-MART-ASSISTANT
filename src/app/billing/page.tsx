"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { toast } from 'react-hot-toast';
import {
  OrderRecord,
  BillingItem,
  findOrderByInfoNumber,
  updateOrder,
  listenToOrders,
  formatLocalDate
} from '@/lib/db';
import { getPricingRates, calculateOrderPrice, PricingRates, DEFAULT_PRICING_RATES } from '@/lib/pricing';
import InvoiceSlip, { InvoiceData } from '@/components/InvoiceSlip';

const CLOTH_TYPES = [
  'SALEENA',
  'SUPERPOLY',
  'LYCRA 2 WAY',
  'LYCRA 4 WAY',
  'PP',
  'POPNIT',
  'DOTKNIT 140',
  'DOTKNIT 180',
  'HONEYCOMB',
  'BOXNET',
  'JAGUARD',
  'Custom / Other'
];

const NECK_TYPES = [
  'ROUND NECK',
  'READYMADE COLLAR WITH ZIP',
  'READYMADE COLLAR WITH BUTTON',
  'V NECK',
  'POLO BUTTON',
  'POLO V',
  'Custom / Other'
];

function BillingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const infoParam = searchParams.get('info');

  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRecord[]>([]);

  // Search input
  const [searchInfoInput, setSearchInfoInput] = useState(infoParam || '');
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);

  // Form Fields
  const [infoNumber, setInfoNumber] = useState<number>(2412);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderTitle, setOrderTitle] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [invoiceNum, setInvoiceNum] = useState('');
  const [quotationNum, setQuotationNum] = useState('');

  // Multi-Item State
  const [items, setItems] = useState<BillingItem[]>([
    {
      id: 'item-1',
      itemType: 'JERSEY',
      clothType: CLOTH_TYPES[0],
      sleeveType: 'full',
      neckType: NECK_TYPES[0],
      hasShorts: false,
      bottomType: 'shorts',
      pieces: 10,
      dtfOption: 'none',
      ratePerPiece: 250,
      isManualOverride: false,
    }
  ]);

  // Financial & Pricing State
  const [pricingRates, setPricingRates] = useState<PricingRates>(DEFAULT_PRICING_RATES);
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [taxRate, setTaxRate] = useState<number>(0); // 0, 5, or 18
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<string>('UPI / GPay');

  // Modal State
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [currentInvoiceData, setCurrentInvoiceData] = useState<InvoiceData | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);

  // Computed Financial Totals
  const subtotal = items.reduce((sum, item) => sum + Math.max(0, item.pieces * item.ratePerPiece), 0);
  const totalPieces = items.reduce((sum, item) => sum + item.pieces, 0);
  const taxableAmount = Math.max(0, subtotal - discountAmount);
  const taxAmount = taxRate > 0 ? Math.round((taxableAmount * taxRate) / 100) : 0;
  const totalAmount = taxableAmount + taxAmount;
  const balanceAmount = Math.max(0, totalAmount - advanceAmount);

  // Auth & Orders Subscription
  useEffect(() => {
    const unsubscribeAuth = listenToAuthChanges(async (authUser, appUserData) => {
      if (!authUser || !appUserData) {
        router.push('/');
        return;
      }
      if (appUserData.role === 'pending') {
        router.push('/pending');
        return;
      }
      setUser(appUserData);

      // Load pricing rates
      const rates = await getPricingRates();
      setPricingRates(rates);

      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const unsubscribeOrders = listenToOrders((data) => {
      setOrders(data);
    });
    return () => unsubscribeOrders();
  }, [user]);

  // Handle URL Param Auto-Fetch
  useEffect(() => {
    if (infoParam) {
      handleFetchOrderByInfo(infoParam);
    }
  }, [infoParam]);

  useEffect(() => {
    // Only generate if we don't have matching ones for this infoNumber
    const currentInvInfo = invoiceNum.split('-')[1];
    if (invoiceNum === '' || currentInvInfo !== String(infoNumber)) {
      const rand = Math.floor(100000 + Math.random() * 900000);
      const rand2 = Math.floor(100000 + Math.random() * 900000);
      setInvoiceNum(`INV-${infoNumber || 2412}-${rand}`);
      setQuotationNum(`QT-${infoNumber || 2412}-${rand2}`);
    }
  }, [infoNumber, invoiceNum]);

  // Re-calculate non-overridden item prices when rates load
  useEffect(() => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.isManualOverride) return item;
        const calc = calculateOrderPrice({
          clothType: item.clothType,
          sleeveType: item.sleeveType,
          neckType: item.neckType,
          hasShorts: item.hasShorts,
          pieces: item.pieces,
          rates: pricingRates,
          dtfOption: item.dtfOption,
        });
        return { ...item, ratePerPiece: calc.unitRate };
      })
    );
  }, [pricingRates]);

  // Item Updater
  const handleUpdateItem = (index: number, updates: Partial<BillingItem>) => {
    setItems((prev) => {
      const copy = [...prev];
      const target = { ...copy[index], ...updates };

      const recalculateRate = !target.isManualOverride && (
        'clothType' in updates ||
        'sleeveType' in updates ||
        'neckType' in updates ||
        'hasShorts' in updates ||
        'pieces' in updates ||
        'dtfOption' in updates ||
        'isManualOverride' in updates
      );

      if (recalculateRate) {
        const calc = calculateOrderPrice({
          clothType: target.clothType,
          sleeveType: target.sleeveType,
          neckType: target.neckType,
          hasShorts: target.hasShorts,
          pieces: target.pieces,
          rates: pricingRates,
          dtfOption: target.dtfOption,
        });
        target.ratePerPiece = calc.unitRate;
      }

      copy[index] = target;
      return copy;
    });
  };

  // Add Extra Item
  const handleAddItem = () => {
    const newItem: BillingItem = {
      id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      itemType: 'JERSEY',
      clothType: CLOTH_TYPES[0],
      sleeveType: 'full',
      neckType: NECK_TYPES[0],
      hasShorts: false,
      bottomType: 'shorts',
      pieces: 10,
      dtfOption: 'none',
      ratePerPiece: 250,
      isManualOverride: false,
    };
    const calc = calculateOrderPrice({
      clothType: newItem.clothType,
      sleeveType: newItem.sleeveType,
      neckType: newItem.neckType,
      hasShorts: newItem.hasShorts,
      pieces: newItem.pieces,
      rates: pricingRates,
      dtfOption: newItem.dtfOption,
    });
    newItem.ratePerPiece = calc.unitRate;
    setItems((prev) => [...prev, newItem]);
    toast.success('✓ Added extra item line to quotation');
  };

  // Remove Item
  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      toast.error('At least one item line is required');
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
    toast.success('Removed item line');
  };

  // Fetch Order Data by INFO NO.
  const handleFetchOrderByInfo = async (infoStr: string) => {
    const num = Number(infoStr.trim());
    if (!num || isNaN(num)) {
      toast.error('Please enter a valid numeric INFO NO.');
      return;
    }

    toast.loading(`Fetching data for INFO #${num}...`, { id: 'fetch-info-bill' });
    try {
      const found = await findOrderByInfoNumber(num);
      toast.dismiss('fetch-info-bill');

      if (!found) {
        toast.error(`No existing order found for INFO #${num}`);
        return;
      }

      setSelectedOrder(found);
      setInfoNumber(found.infoNumber);
      setCustomerName(found.customerName || '');
      setCustomerPhone(found.customerPhone || '');
      setOrderTitle(found.orderTitle || '');
      setDeliveryDate(found.deliveryDate || '');
      setNotes(found.notes || '');

      const rand = Math.floor(100000 + Math.random() * 900000);
      const rand2 = Math.floor(100000 + Math.random() * 900000);
      setInvoiceNum(found.invoiceNumber || `INV-${found.infoNumber}-${rand}`);
      setQuotationNum(found.quotationNumber || `QT-${found.infoNumber}-${rand2}`);

      if (found.items && found.items.length > 0) {
        setItems(found.items);
      } else {
        const singleItem: BillingItem = {
          id: 'item-1',
          itemType: found.itemType || 'JERSEY',
          clothType: found.clothType || CLOTH_TYPES[0],
          sleeveType: (found.sleeveType as any) || 'full',
          neckType: found.neckType || NECK_TYPES[0],
          hasShorts: found.hasShorts !== undefined ? Boolean(found.hasShorts) : Boolean(found.players?.some(p => p.shortsSize && p.shortsSize !== '-')),
          bottomType: found.bottomType || 'shorts',
          pieces: found.players && found.players.length > 0 ? found.players.length : (found.pieces || 10),
          dtfOption: found.dtfOption || 'none',
          ratePerPiece: typeof found.ratePerPiece === 'number' && found.ratePerPiece > 0 ? found.ratePerPiece : 250,
          isManualOverride: typeof found.ratePerPiece === 'number' && found.ratePerPiece > 0
        };
        setItems([singleItem]);
      }

      setDiscountAmount(found.discountAmount || 0);
      setAdvanceAmount(found.advanceAmount || 0);

      toast.success(`✓ Loaded details for INFO #${num} (${found.customerName})`);
    } catch (err) {
      toast.dismiss('fetch-info-bill');
      console.error('Error fetching order info:', err);
      toast.error('Failed to fetch order details');
    }
  };

  // Build Invoice Data Object
  const buildInvoiceDataObject = (): InvoiceData => {
    return {
      invoiceNumber: invoiceNum || `INV-${infoNumber || 2412}`,
      quotationNumber: quotationNum || `QT-${infoNumber || 2412}`,
      invoiceDate: formatLocalDate(new Date()),
      customerName: customerName.trim() || 'LUCKY',
      customerPhone: customerPhone.trim() || '+91 8848048733',
      orderTitle: orderTitle.trim() || 'Custom Order',
      itemType: items[0]?.itemType || 'JERSEY',
      clothType: items[0]?.clothType || CLOTH_TYPES[0],
      sleeveType: items[0]?.sleeveType || 'full',
      neckType: items[0]?.neckType || NECK_TYPES[0],
      hasShorts: items[0]?.hasShorts || false,
      bottomType: items[0]?.bottomType || 'shorts',
      pieces: totalPieces,
      ratePerPiece: items[0]?.ratePerPiece || 250,
      subtotal,
      discountAmount,
      taxRate,
      taxAmount,
      totalAmount,
      advanceAmount,
      balanceAmount,
      paymentMode,
      notes: notes.trim(),
      dtfOption: items[0]?.dtfOption || 'none',
      items: items.map(i => ({
        id: i.id,
        itemType: i.itemType,
        clothType: i.clothType,
        sleeveType: i.sleeveType,
        neckType: i.neckType,
        hasShorts: i.hasShorts,
        bottomType: i.bottomType,
        pieces: i.pieces,
        ratePerPiece: i.ratePerPiece,
        subtotal: i.pieces * i.ratePerPiece,
        dtfOption: i.dtfOption
      }))
    };
  };

  // Generate & Preview Printable A4 Invoice
  const handleGenerateInvoice = () => {
    if (!customerName.trim()) {
      toast.error('Please enter Customer Name');
      return;
    }
    const invData = buildInvoiceDataObject();
    setCurrentInvoiceData(invData);
    setShowInvoiceModal(true);
  };

  // Save Invoice & Financials to Database
  const handleSaveInvoiceToDatabase = async () => {
    if (!customerName.trim()) {
      toast.error('Please enter Customer Name');
      return;
    }

    setSavingOrder(true);
    toast.loading('Updating order financial details...', { id: 'save-bill' });

    try {
      if (selectedOrder && selectedOrder.id) {
        await updateOrder(selectedOrder.id, {
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          orderTitle: orderTitle.trim(),
          itemType: items[0]?.itemType || 'JERSEY',
          clothType: items[0]?.clothType || CLOTH_TYPES[0],
          neckType: items[0]?.neckType || NECK_TYPES[0],
          pieces: totalPieces,
          ratePerPiece: items[0]?.ratePerPiece || 250,
          totalAmount,
          discountAmount,
          advanceAmount,
          balanceAmount,
          notes: notes.trim(),
          invoiceNumber: invoiceNum,
          quotationNumber: quotationNum,
          dtfOption: items[0]?.dtfOption || 'none',
          items: items
        });
        toast.dismiss('save-bill');
        toast.success(`Updated financial record for INFO #${infoNumber}!`);
      } else {
        toast.dismiss('save-bill');
        toast.success('Invoice data prepared successfully!');
      }

      const invData = buildInvoiceDataObject();
      setCurrentInvoiceData(invData);
      setShowInvoiceModal(true);
    } catch (err) {
      toast.dismiss('save-bill');
      console.error('Error saving billing financials:', err);
      toast.error('Failed to save financial details.');
    } finally {
      setSavingOrder(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
        <div style={{ fontWeight: 800, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h2M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
          Loading Receptionist Billing Module...
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', paddingBottom: '3rem' }}>
      <Navbar user={user} />

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
              Receptionist Customer Billing & Invoice
            </h1>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Auto-fetch order details by INFO NO. to generate, print, and download A4 Tax Invoice receipts.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button
              type="button"
              onClick={handleSaveInvoiceToDatabase}
              disabled={savingOrder}
              style={{
                padding: '0.65rem 1.3rem',
                borderRadius: '10px',
                border: 'none',
                background: '#10b981',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                opacity: savingOrder ? 0.7 : 1
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
              <span>Save & Print Invoice</span>
            </button>
          </div>
        </div>

        {/* Sub-Nav Toggle for Mobile & Quick Switch */}
        <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', background: 'var(--bg-surface)', padding: '0.25rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => router.push('/billing')}
            style={{ flex: 1, padding: '0.45rem', borderRadius: '8px', border: 'none', background: 'var(--sapphire-primary)', color: '#fff', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
          >
            📄 Receptionist Billing Hub
          </button>
          <button
            type="button"
            onClick={() => router.push('/price-settings')}
            style={{ flex: 1, padding: '0.45rem', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
          >
            ⚙ Material Price Rates
          </button>
        </div>

        {/* ── AUTO-FETCH BAR & RECENT ORDERS SELECTOR ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
          {/* Search by INFO NO. Bar */}
          <div className="card-glass" style={{ padding: '1rem', borderRadius: '14px', border: '1px solid rgba(59, 130, 246, 0.3)', background: 'rgba(59, 130, 246, 0.06)' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--sapphire-light)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
              Fetch Order Details by INFO NO.:
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="number"
                placeholder="Enter INFO NO. (e.g. 2412)..."
                value={searchInfoInput}
                onChange={(e) => setSearchInfoInput(e.target.value)}
                style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.88rem', fontWeight: 700, outline: 'none', minWidth: 0 }}
              />
              <button
                type="button"
                onClick={() => handleFetchOrderByInfo(searchInfoInput)}
                style={{ padding: '0.5rem 1.1rem', borderRadius: '8px', border: 'none', background: 'var(--sapphire-primary)', color: '#fff', fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg> Fetch Data
              </button>
            </div>
          </div>

          {/* Quick Dropdown Select */}
          <div className="card-glass" style={{ padding: '1rem', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
              Or Select Recent Order:
            </label>
            <select
              onChange={(e) => e.target.value && handleFetchOrderByInfo(e.target.value)}
              defaultValue=""
              style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
            >
              <option value="" disabled style={{ background: '#161e31', color: '#fff' }}>Choose from recent orders list...</option>
              {orders.slice(0, 15).map((ord) => (
                <option key={ord.id} value={ord.infoNumber} style={{ background: '#161e31', color: '#fff' }}>
                  INFO #{ord.infoNumber} - {ord.customerName} ({ord.clothType} - {ord.pieces} pcs)
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* ── MAIN BILLING EDITOR ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
          
          {/* LEFT: Customer & Multi-Item Specs */}
          <div className="card-glass" style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              Customer & Order Line Items
            </h3>

            {/* Customer Name, Phone, Title */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>Customer Name *</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. LUCKY"
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#10b981', marginBottom: '0.3rem' }}>Mobile Number *</label>
                <input
                  type="text"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="e.g. +91 8848048733"
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 700 }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Order Title / Ref</label>
                <input
                  type="text"
                  value={orderTitle}
                  onChange={(e) => setOrderTitle(e.target.value)}
                  placeholder="e.g. SPORTIVATE"
                  style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                />
              </div>
            </div>

            {/* Line Items Section Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--sapphire-light)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                📦 Order Line Items ({items.length})
              </span>
              <button
                type="button"
                onClick={handleAddItem}
                style={{
                  padding: '0.35rem 0.85rem',
                  borderRadius: '7px',
                  border: 'none',
                  background: 'var(--sapphire-primary)',
                  color: '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.78rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)'
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                <span>+ Add Extra Item</span>
              </button>
            </div>

            {/* Item Cards List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {items.map((item, idx) => (
                <div key={item.id || idx} style={{ background: 'rgba(255,255,255,0.03)', padding: '0.9rem', borderRadius: '12px', border: '1px solid var(--border)', position: 'relative' }}>
                  {/* Item Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span style={{ background: 'var(--sapphire-primary)', color: '#fff', fontSize: '0.72rem', fontWeight: 900, padding: '0.15rem 0.5rem', borderRadius: '5px' }}>
                        Item #{idx + 1}
                      </span>
                      <input
                        type="text"
                        value={item.itemType}
                        onChange={(e) => handleUpdateItem(idx, { itemType: e.target.value })}
                        placeholder="JERSEY, HOODIE, SHORTS..."
                        style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 800, width: '150px' }}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#10b981' }}>
                        ₹{(item.pieces * item.ratePerPiece).toLocaleString()}
                      </span>
                      {items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          title="Remove item"
                          style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', padding: '0.25rem 0.45rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 800 }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Garment Options Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.6rem', marginBottom: '0.6rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#3b82f6', marginBottom: '0.2rem' }}>FABRIC</label>
                      <select
                        value={item.clothType}
                        onChange={(e) => handleUpdateItem(idx, { clothType: e.target.value })}
                        style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                      >
                        {CLOTH_TYPES.map((t) => <option key={t} value={t} style={{ background: '#161e31', color: '#fff' }}>{t}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#10b981', marginBottom: '0.2rem' }}>SLEEVE</label>
                      <select
                        value={item.sleeveType}
                        onChange={(e) => handleUpdateItem(idx, { sleeveType: e.target.value as any })}
                        style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                      >
                        <option value="full" style={{ background: '#161e31', color: '#fff' }}>Full Sleeve</option>
                        <option value="half" style={{ background: '#161e31', color: '#fff' }}>Half Sleeve</option>
                        <option value="sleeveless" style={{ background: '#161e31', color: '#fff' }}>Sleeveless</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#f59e0b', marginBottom: '0.2rem' }}>NECK</label>
                      <select
                        value={item.neckType}
                        onChange={(e) => handleUpdateItem(idx, { neckType: e.target.value })}
                        style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                      >
                        {NECK_TYPES.map((t) => <option key={t} value={t} style={{ background: '#161e31', color: '#fff' }}>{t}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#3b82f6', marginBottom: '0.2rem' }}>QTY (PCS)</label>
                      <input
                        type="number"
                        min="1"
                        value={item.pieces}
                        onChange={(e) => handleUpdateItem(idx, { pieces: Number(e.target.value) || 1 })}
                        style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: '#3b82f6', fontWeight: 800, fontSize: '0.82rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#ec4899', marginBottom: '0.2rem' }}>DTF PRINT</label>
                      <select
                        value={item.dtfOption}
                        onChange={(e) => handleUpdateItem(idx, { dtfOption: e.target.value })}
                        style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                      >
                        <option value="none" style={{ background: '#161e31', color: '#fff' }}>None</option>
                        <option value="front" style={{ background: '#161e31', color: '#fff' }}>Front</option>
                        <option value="back" style={{ background: '#161e31', color: '#fff' }}>Back</option>
                        <option value="front and back" style={{ background: '#161e31', color: '#fff' }}>Front & Back</option>
                        <option value="a4 size" style={{ background: '#161e31', color: '#fff' }}>A4 Size</option>
                        <option value="a3 size" style={{ background: '#161e31', color: '#fff' }}>A3 Size</option>
                      </select>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                        <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10b981' }}>RATE (₹/PC)</label>
                        {item.isManualOverride && (
                          <button
                            type="button"
                            onClick={() => handleUpdateItem(idx, { isManualOverride: false })}
                            title="Reset auto rate"
                            style={{ background: 'transparent', border: 'none', color: '#3b82f6', fontSize: '0.68rem', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            ↺ Auto
                          </button>
                        )}
                      </div>
                      <input
                        type="number"
                        value={item.ratePerPiece}
                        onChange={(e) => handleUpdateItem(idx, { ratePerPiece: Number(e.target.value) || 0, isManualOverride: true })}
                        style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: item.isManualOverride ? '1px solid #f59e0b' : '1px solid var(--border)', background: 'var(--bg-main)', color: '#10b981', fontWeight: 900, fontSize: '0.82rem' }}
                      />
                    </div>
                  </div>

                  {/* Shorts Checkbox for item */}
                  <div style={{ background: item.hasShorts ? 'rgba(16, 185, 129, 0.1)' : 'transparent', padding: '0.4rem 0.6rem', borderRadius: '6px', border: item.hasShorts ? '1px solid #10b981' : '1px solid var(--border)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, color: item.hasShorts ? '#10b981' : 'var(--text-primary)' }}>
                      <input
                        type="checkbox"
                        checked={item.hasShorts}
                        onChange={(e) => handleUpdateItem(idx, { hasShorts: e.target.checked })}
                        style={{ width: '14px', height: '14px', accentColor: '#10b981' }}
                      />
                      <span>Includes {item.bottomType === 'track_pant' ? 'Track Pant' : 'Shorts'} / Pants</span>
                    </label>

                    {item.hasShorts && (
                      <div style={{ marginTop: '0.3rem', paddingTop: '0.3rem', borderTop: '1px dashed rgba(16, 185, 129, 0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10b981' }}>Type:</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateItem(idx, { bottomType: 'shorts' })}
                          style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, border: item.bottomType === 'shorts' ? '1px solid #10b981' : '1px solid var(--border)', background: item.bottomType === 'shorts' ? '#10b981' : 'transparent', color: item.bottomType === 'shorts' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}
                        >
                          🩳 Shorts
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateItem(idx, { bottomType: 'track_pant' })}
                          style={{ padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, border: item.bottomType === 'track_pant' ? '1px solid #10b981' : '1px solid var(--border)', background: item.bottomType === 'track_pant' ? '#10b981' : 'transparent', color: item.bottomType === 'track_pant' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}
                        >
                          👖 Track Pant
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Add Item Button */}
            <button
              type="button"
              onClick={handleAddItem}
              style={{
                marginTop: '1rem',
                width: '100%',
                padding: '0.65rem',
                borderRadius: '10px',
                border: '1px dashed var(--sapphire-light)',
                background: 'rgba(59, 130, 246, 0.08)',
                color: 'var(--sapphire-light)',
                fontWeight: 800,
                fontSize: '0.85rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem'
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              <span>+ Add Extra Item to Quotation / Invoice</span>
            </button>

            {/* Notes */}
            <div style={{ marginTop: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Invoice Notes / Terms</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Urgent order delivery before 3 PM..."
                style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
              />
            </div>
          </div>

          {/* RIGHT: Financial Totals & Invoice Action */}
          <div className="card-glass" style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid #10b981', background: 'rgba(16, 185, 129, 0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', borderBottom: '1px solid rgba(16, 185, 129, 0.3)', paddingBottom: '0.6rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                  Payment Breakdown
                </h3>
              </div>

              {/* Items Breakdown list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginBottom: '0.85rem' }}>
                {items.map((item, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', background: 'var(--bg-main)', padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                      #{i + 1} {item.itemType} ({item.clothType}):
                    </span>
                    <span style={{ fontWeight: 800, color: '#10b981' }}>
                      {item.pieces} Pcs × ₹{item.ratePerPiece} = ₹{(item.pieces * item.ratePerPiece).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              {/* Interactive Financial Form */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {/* Subtotal Display */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.88rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Items Subtotal ({totalPieces} Total Pcs):</span>
                  <span style={{ fontWeight: 900, color: 'var(--text-primary)' }}>₹{subtotal.toLocaleString()}</span>
                </div>

                {/* Discount */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444' }}>Discount Offered (₹):</label>
                  <input
                    type="number"
                    min="0"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                    style={{ width: '100px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: '#ef4444', fontWeight: 800, fontSize: '0.85rem', textAlign: 'right' }}
                  />
                </div>

                {/* GST Tax Toggle */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Tax Rate (GST):</label>
                  <select
                    value={taxRate}
                    onChange={(e) => setTaxRate(Number(e.target.value))}
                    style={{ width: '100px', padding: '0.35rem 0.4rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                  >
                    <option value={0} style={{ background: '#161e31', color: '#fff' }}>Non-GST (0%)</option>
                    <option value={5} style={{ background: '#161e31', color: '#fff' }}>GST 5%</option>
                    <option value={18} style={{ background: '#161e31', color: '#fff' }}>GST 18%</option>
                  </select>
                </div>

                {/* Total Invoice Amount */}
                <div style={{ borderTop: '2px solid #10b981', paddingTop: '0.6rem', marginTop: '0.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#10b981' }}>TOTAL AMOUNT:</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#10b981' }}>₹{totalAmount.toLocaleString()}</span>
                </div>

                {/* Advance Amount */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.3rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#3b82f6' }}>Advance Paid (₹):</label>
                  <input
                    type="number"
                    min="0"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(Number(e.target.value) || 0)}
                    style={{ width: '100px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #3b82f6', background: 'var(--bg-main)', color: '#3b82f6', fontWeight: 900, fontSize: '0.9rem', textAlign: 'right' }}
                  />
                </div>

                {/* Payment Mode */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Payment Method:</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    style={{ width: '120px', padding: '0.35rem 0.4rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                  >
                    <option value="UPI / GPay" style={{ background: '#161e31', color: '#fff' }}>UPI / GPay</option>
                    <option value="Cash" style={{ background: '#161e31', color: '#fff' }}>Cash</option>
                    <option value="Card" style={{ background: '#161e31', color: '#fff' }}>Credit/Debit Card</option>
                    <option value="Bank Transfer" style={{ background: '#161e31', color: '#fff' }}>Bank Transfer</option>
                  </select>
                </div>

                {/* Balance Remaining Box */}
                <div style={{ background: balanceAmount > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)', padding: '0.65rem 0.85rem', borderRadius: '10px', border: balanceAmount > 0 ? '1px solid #ef4444' : '1px solid #10b981', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.4rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: balanceAmount > 0 ? '#ef4444' : '#10b981' }}>BALANCE REMAINING:</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 900, color: balanceAmount > 0 ? '#ef4444' : '#10b981' }}>₹{balanceAmount.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={handleGenerateInvoice}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: '10px',
                  border: 'none',
                  background: 'var(--sapphire-primary)',
                  color: '#ffffff',
                  fontSize: '0.9rem',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
                  boxShadow: '0 4px 14px rgba(59, 130, 246, 0.3)'
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                <span>View & Print Customer Invoice</span>
              </button>
            </div>
          </div>

        </div>
      </main>

      {/* ── PRINTABLE A4 INVOICE MODAL ── */}
      {showInvoiceModal && currentInvoiceData && (
        <div className="modal-overlay-container" style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}>
          <div className="card-glass modal-responsive-card" style={{ width: '100%', maxWidth: '900px', maxHeight: '94vh', overflowY: 'auto', overflowX: 'auto', borderRadius: '20px', padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <InvoiceSlip
              invoice={currentInvoiceData}
              order={selectedOrder}
              onClose={() => setShowInvoiceModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ReceptionistBillingPage() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>Loading Billing Page...</div>}>
      <BillingContent />
    </Suspense>
  );
}
