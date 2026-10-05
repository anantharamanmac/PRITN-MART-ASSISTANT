"use client";

import React, { useEffect, useState, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import { toast } from 'react-hot-toast';
import {
  OrderRecord,
  BillingItem,
  findOrderByInfoNumber,
  listenToOrders,
  formatLocalDate,
  InvoiceRecord,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  listenToInvoices,
  getNextInvoiceNumber
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
  'COTTON',
  'Custom / Other'
];

const NECK_TYPES = [
  'ROUND NECK',
  'READYMADE COLLAR WITH ZIP',
  'READYMADE COLLAR WITH BUTTON',
  'V NECK',
  'POLO BUTTON',
  'POLO V',
  'CHINESE COLLAR',
  'Custom / Other'
];

const HSN_OPTIONS = [
  { code: '6109', label: '6109 - T-Shirts, Singlets & Jerseys (Knitted/Crocheted)' },
  { code: '6203', label: '6203 - Men / Boys Suits, Trousers & Shorts' },
  { code: '6204', label: '6204 - Women / Girls Suits, Trousers & Shorts' },
  { code: '9988', label: '9988 - Manufacturing Services / Printing & Job Work' },
  { code: '9983', label: '9983 - Graphic Designing & Creative Artwork' }
];

function BillingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const infoParam = searchParams.get('info');

  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [savedInvoices, setSavedInvoices] = useState<InvoiceRecord[]>([]);

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'editor' | 'history'>('editor');

  // Search & order linking
  const [searchInfoInput, setSearchInfoInput] = useState(infoParam || '');
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [editingInvoiceId, setEditingInvoiceId] = useState<string | null>(null);

  // Document Config
  const [docType, setDocType] = useState<'INVOICE' | 'QUOTATION'>('INVOICE');
  const [billType, setBillType] = useState<'GST' | 'NON_GST'>('NON_GST');
  const [invoiceNum, setInvoiceNum] = useState('');
  const [quotationNum, setQuotationNum] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(() => formatLocalDate(new Date()));
  const [dueDate, setDueDate] = useState('');

  // Customer Details
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerGstin, setCustomerGstin] = useState('');
  const [orderTitle, setOrderTitle] = useState('');
  const [infoNumber, setInfoNumber] = useState<number | undefined>(undefined);

  // GST State & Tax Config
  const [stateName, setStateName] = useState('Kerala');
  const [stateCode, setStateCode] = useState('32');
  const [isInterState, setIsInterState] = useState(false);
  const [hsnCode, setHsnCode] = useState('6109');
  const [taxRate, setTaxRate] = useState<number>(0); // 0, 5, 12, 18, 28

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
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<string>('UPI / GPay');
  const [notes, setNotes] = useState('');

  // History Tab Filter & Search
  const [historySearch, setHistorySearch] = useState('');
  const [historyDocFilter, setHistoryDocFilter] = useState<'ALL' | 'INVOICE' | 'QUOTATION'>('ALL');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'ALL' | 'GST' | 'NON_GST'>('ALL');

  // Modal State
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [currentInvoiceData, setCurrentInvoiceData] = useState<InvoiceData | null>(null);
  const [savingInvoice, setSavingInvoice] = useState(false);

  // Financial Calculations
  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + Math.max(0, item.pieces * (item.ratePerPiece || 0)), 0);
  }, [items]);

  const totalPieces = useMemo(() => {
    return items.reduce((sum, item) => sum + (Number(item.pieces) || 0), 0);
  }, [items]);

  const taxableAmount = useMemo(() => {
    return Math.max(0, subtotal - (Number(discountAmount) || 0));
  }, [subtotal, discountAmount]);

  const effectiveTaxRate = billType === 'GST' ? taxRate : 0;

  const taxAmount = useMemo(() => {
    if (effectiveTaxRate <= 0) return 0;
    return Math.round((taxableAmount * effectiveTaxRate) / 100);
  }, [taxableAmount, effectiveTaxRate]);

  const { cgstRate, cgstAmount, sgstRate, sgstAmount, igstRate, igstAmount } = useMemo(() => {
    if (effectiveTaxRate <= 0) {
      return { cgstRate: 0, cgstAmount: 0, sgstRate: 0, sgstAmount: 0, igstRate: 0, igstAmount: 0 };
    }
    if (isInterState) {
      return {
        cgstRate: 0,
        cgstAmount: 0,
        sgstRate: 0,
        sgstAmount: 0,
        igstRate: effectiveTaxRate,
        igstAmount: taxAmount
      };
    } else {
      const halfRate = effectiveTaxRate / 2;
      const halfAmount = Math.round(taxAmount / 2);
      return {
        cgstRate: halfRate,
        cgstAmount: halfAmount,
        sgstRate: halfRate,
        sgstAmount: taxAmount - halfAmount,
        igstRate: 0,
        igstAmount: 0
      };
    }
  }, [effectiveTaxRate, isInterState, taxAmount]);

  const totalAmount = useMemo(() => {
    return taxableAmount + taxAmount;
  }, [taxableAmount, taxAmount]);

  const balanceAmount = useMemo(() => {
    return Math.max(0, totalAmount - (Number(advanceAmount) || 0));
  }, [totalAmount, advanceAmount]);

  const paymentStatus: 'PAID' | 'PARTIAL' | 'UNPAID' = useMemo(() => {
    if (totalAmount > 0 && balanceAmount <= 0) return 'PAID';
    if (advanceAmount > 0) return 'PARTIAL';
    return 'UNPAID';
  }, [totalAmount, balanceAmount, advanceAmount]);

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

  // Real-time Orders Subscription
  useEffect(() => {
    if (!user) return;
    const unsubscribeOrders = listenToOrders((data) => {
      setOrders(data);
    });
    return () => unsubscribeOrders();
  }, [user]);

  // Real-time Invoices Subscription
  useEffect(() => {
    if (!user) return;
    const unsubscribeInvoices = listenToInvoices((invoices) => {
      setSavedInvoices(invoices);
    });
    return () => unsubscribeInvoices();
  }, [user]);

  // Initialize sequential invoice number if blank
  useEffect(() => {
    if (!invoiceNum && !editingInvoiceId) {
      getNextInvoiceNumber('INV').then((nextNum) => {
        setInvoiceNum(nextNum);
      });
      const randQt = Math.floor(1000 + Math.random() * 9000);
      setQuotationNum(`QT-${new Date().getFullYear()}-${randQt}`);
    }
  }, [invoiceNum, editingInvoiceId]);

  // Handle URL Param Auto-Fetch
  useEffect(() => {
    if (infoParam) {
      handleFetchOrderByInfo(infoParam);
    }
  }, [infoParam]);

  // Auto-switch GST rate when toggling GST bill type
  const handleBillTypeChange = (type: 'GST' | 'NON_GST') => {
    setBillType(type);
    if (type === 'GST' && taxRate === 0) {
      setTaxRate(5); // Default GST rate for apparel under 1000
    } else if (type === 'NON_GST') {
      setTaxRate(0);
    }
  };

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
    toast.success('Added item line');
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
      setNotes(found.notes || '');

      if (found.invoiceNumber) {
        setInvoiceNum(found.invoiceNumber);
      } else {
        const rand = Math.floor(1000 + Math.random() * 9000);
        setInvoiceNum(`INV-${found.infoNumber}-${rand}`);
      }

      if (found.quotationNumber) {
        setQuotationNum(found.quotationNumber);
      } else {
        const rand2 = Math.floor(1000 + Math.random() * 9000);
        setQuotationNum(`QT-${found.infoNumber}-${rand2}`);
      }

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

      toast.success(`Loaded details for INFO #${num} (${found.customerName})`);
    } catch (err) {
      toast.dismiss('fetch-info-bill');
      console.error('Error fetching order info:', err);
      toast.error('Failed to fetch order details');
    }
  };

  // Reset form to create a fresh new manual bill
  const handleResetToNewManualBill = async () => {
    setSelectedOrder(null);
    setEditingInvoiceId(null);
    setInfoNumber(undefined);
    setCustomerName('');
    setCustomerPhone('');
    setCustomerAddress('');
    setCustomerGstin('');
    setOrderTitle('');
    setNotes('');
    setDiscountAmount(0);
    setAdvanceAmount(0);
    setPaymentMode('UPI / GPay');
    setDocType('INVOICE');
    setBillType('NON_GST');
    setTaxRate(0);
    setIsInterState(false);
    setInvoiceDate(formatLocalDate(new Date()));

    const nextInv = await getNextInvoiceNumber('INV');
    setInvoiceNum(nextInv);
    const randQt = Math.floor(1000 + Math.random() * 9000);
    setQuotationNum(`QT-${new Date().getFullYear()}-${randQt}`);

    setItems([
      {
        id: `item-${Date.now()}`,
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

    setActiveTab('editor');
    toast.success('Ready for New Manual Bill / Quotation');
  };

  // Edit existing invoice from history
  const handleEditSavedInvoice = (inv: InvoiceRecord) => {
    setEditingInvoiceId(inv.id || null);
    setSelectedOrder(inv.orderId ? ({ id: inv.orderId, infoNumber: inv.infoNumber } as any) : null);
    setInfoNumber(inv.infoNumber);
    setDocType(inv.docType || 'INVOICE');
    setBillType(inv.billType || 'NON_GST');
    setInvoiceNum(inv.invoiceNumber || '');
    setQuotationNum(inv.quotationNumber || '');
    setInvoiceDate(inv.invoiceDate || formatLocalDate(new Date()));
    setDueDate(inv.dueDate || '');
    setCustomerName(inv.customerName || '');
    setCustomerPhone(inv.customerPhone || '');
    setCustomerAddress(inv.customerAddress || '');
    setCustomerGstin(inv.customerGstin || '');
    setStateName(inv.stateName || 'Kerala');
    setStateCode(inv.stateCode || '32');
    setIsInterState(Boolean(inv.isInterState));
    setHsnCode(inv.hsnCode || '6109');
    setOrderTitle(inv.orderTitle || '');
    setDiscountAmount(inv.discountAmount || 0);
    setTaxRate(inv.taxRate || 0);
    setAdvanceAmount(inv.advanceAmount || 0);
    setPaymentMode(inv.paymentMode || 'UPI / GPay');
    setNotes(inv.notes || '');

    if (inv.items && inv.items.length > 0) {
      setItems(inv.items);
    }

    setActiveTab('editor');
    toast.success(`Editing ${inv.docType} #${inv.invoiceNumber}`);
  };

  // Delete invoice with prompt
  const handleDeleteInvoice = async (inv: InvoiceRecord) => {
    if (!inv.id) return;
    const confirmed = window.confirm(`Are you sure you want to delete invoice "${inv.invoiceNumber}" for ${inv.customerName}?`);
    if (!confirmed) return;

    try {
      toast.loading('Deleting invoice...', { id: 'delete-inv' });
      await deleteInvoice(inv.id);
      toast.dismiss('delete-inv');
      toast.success('Invoice deleted successfully');
      if (editingInvoiceId === inv.id) {
        handleResetToNewManualBill();
      }
    } catch (err) {
      toast.dismiss('delete-inv');
      console.error('Error deleting invoice:', err);
      toast.error('Failed to delete invoice');
    }
  };

  // Build Invoice Data Object for Preview/Print
  const buildInvoiceDataObject = (): InvoiceData => {
    return {
      id: editingInvoiceId || undefined,
      docType,
      billType,
      invoiceNumber: invoiceNum || `INV-${new Date().getFullYear()}-001`,
      quotationNumber: quotationNum || `QT-${new Date().getFullYear()}-001`,
      invoiceDate: invoiceDate || formatLocalDate(new Date()),
      dueDate: dueDate || undefined,
      customerName: customerName.trim() || 'Valued Customer',
      customerPhone: customerPhone.trim() || '',
      customerAddress: customerAddress.trim() || undefined,
      customerGstin: customerGstin.trim().toUpperCase() || undefined,
      stateName,
      stateCode,
      isInterState,
      orderTitle: orderTitle.trim() || undefined,
      infoNumber: infoNumber || undefined,
      orderId: selectedOrder?.id || undefined,
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
      taxableAmount,
      taxRate: effectiveTaxRate,
      taxAmount,
      cgstRate,
      cgstAmount,
      sgstRate,
      sgstAmount,
      igstRate,
      igstAmount,
      totalAmount,
      advanceAmount,
      balanceAmount,
      paymentMode,
      paymentStatus,
      notes: notes.trim(),
      hsnCode,
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
        hsnCode,
        dtfOption: i.dtfOption
      }))
    };
  };

  // Preview Printable A4 Invoice
  const handlePreviewInvoice = () => {
    if (!customerName.trim()) {
      toast.error('Please enter Customer Name');
      return;
    }
    const invData = buildInvoiceDataObject();
    setCurrentInvoiceData(invData);
    setShowInvoiceModal(true);
  };

  // Save Invoice / Bill to Database (Firestore `invoices` collection)
  const handleSaveInvoiceToDatabase = async (openPrintModalAfter = false) => {
    if (!customerName.trim()) {
      toast.error('Please enter Customer Name');
      return;
    }

    setSavingInvoice(true);
    toast.loading(editingInvoiceId ? 'Updating invoice in database...' : 'Saving bill to database...', { id: 'save-bill' });

    try {
      const invoicePayload: Omit<InvoiceRecord, 'id' | 'createdAt' | 'updatedAt'> = {
        docType,
        billType,
        invoiceNumber: invoiceNum.trim() || `INV-${new Date().getFullYear()}-001`,
        quotationNumber: quotationNum.trim() || undefined,
        invoiceDate: invoiceDate || formatLocalDate(new Date()),
        dueDate: dueDate || undefined,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim() || undefined,
        customerGstin: customerGstin.trim().toUpperCase() || undefined,
        stateName,
        stateCode,
        isInterState,
        hsnCode,
        orderId: selectedOrder?.id || undefined,
        infoNumber: infoNumber || undefined,
        orderTitle: orderTitle.trim() || undefined,
        items,
        totalPieces,
        subtotal,
        discountAmount,
        taxableAmount,
        taxRate: effectiveTaxRate,
        taxAmount,
        cgstRate,
        cgstAmount,
        sgstRate,
        sgstAmount,
        igstRate,
        igstAmount,
        totalAmount,
        advanceAmount,
        balanceAmount,
        paymentMode,
        paymentStatus,
        notes: notes.trim(),
        isManualBill: !selectedOrder?.id,
        createdByUid: user?.uid,
        createdByName: user?.displayName || user?.email || 'Receptionist'
      };

      if (editingInvoiceId) {
        await updateInvoice(editingInvoiceId, invoicePayload);
        toast.dismiss('save-bill');
        toast.success(`✓ Updated ${docType} #${invoiceNum} in database!`);
      } else {
        const newId = await createInvoice(invoicePayload);
        setEditingInvoiceId(newId);
        toast.dismiss('save-bill');
        toast.success(`✓ Saved ${docType} #${invoiceNum} to database!`);
      }

      if (openPrintModalAfter) {
        const invData = buildInvoiceDataObject();
        setCurrentInvoiceData(invData);
        setShowInvoiceModal(true);
      }
    } catch (err) {
      toast.dismiss('save-bill');
      console.error('Error saving billing invoice:', err);
      toast.error('Failed to save bill to database.');
    } finally {
      setSavingInvoice(false);
    }
  };

  // Filtered Invoices for History Tab
  const filteredInvoices = useMemo(() => {
    return savedInvoices.filter((inv) => {
      // Document type filter
      if (historyDocFilter !== 'ALL' && inv.docType !== historyDocFilter) return false;
      // Tax type filter
      if (historyTypeFilter !== 'ALL' && inv.billType !== historyTypeFilter) return false;
      // Search query
      if (historySearch.trim()) {
        const q = historySearch.toLowerCase();
        const nameMatch = (inv.customerName || '').toLowerCase().includes(q);
        const phoneMatch = (inv.customerPhone || '').toLowerCase().includes(q);
        const invMatch = (inv.invoiceNumber || '').toLowerCase().includes(q);
        const infoMatch = inv.infoNumber ? String(inv.infoNumber).includes(q) : false;
        if (!nameMatch && !phoneMatch && !invMatch && !infoMatch) return false;
      }
      return true;
    });
  }, [savedInvoices, historyDocFilter, historyTypeFilter, historySearch]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)' }}>
        <div style={{ fontWeight: 800, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h2M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>
          Loading Print Mart Billing System...
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', paddingBottom: '3rem' }}>
      <Navbar user={user} />

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        {/* Company Header with Official Print Mart Logo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem', background: 'var(--bg-surface)', padding: '1rem 1.25rem', borderRadius: '16px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Print Mart Logo"
              style={{
                height: '52px',
                width: 'auto',
                objectFit: 'contain',
                borderRadius: '8px'
              }}
            />
            <div>
              <h1 style={{ margin: 0, fontSize: '1.45rem', fontWeight: 900, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                Print Mart Billing & Tax Invoicing
              </h1>
              <p style={{ margin: '2px 0 0 0', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                GST Tax Invoices, Quotations, and Persistent Manual Billing with Database Storage
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={handleResetToNewManualBill}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--bg-main)',
                color: 'var(--text-primary)',
                fontWeight: 700,
                fontSize: '0.84rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              <span>+ New Manual Bill</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveInvoiceToDatabase(false)}
              disabled={savingInvoice}
              style={{
                padding: '0.6rem 1.1rem',
                borderRadius: '10px',
                border: 'none',
                background: '#3b82f6',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.84rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)',
                opacity: savingInvoice ? 0.7 : 1
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
              <span>{editingInvoiceId ? 'Update in DB' : 'Save to DB'}</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveInvoiceToDatabase(true)}
              disabled={savingInvoice}
              style={{
                padding: '0.6rem 1.25rem',
                borderRadius: '10px',
                border: 'none',
                background: '#10b981',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '0.84rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
                opacity: savingInvoice ? 0.7 : 1
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
              <span>Save & Print Invoice</span>
            </button>
          </div>
        </div>

        {/* Navigation Tabs (Billing Studio vs Saved Invoices History) */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', background: 'var(--bg-surface)', padding: '0.35rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={() => setActiveTab('editor')}
            style={{
              flex: 1,
              padding: '0.55rem',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === 'editor' ? 'var(--sapphire-primary)' : 'transparent',
              color: activeTab === 'editor' ? '#fff' : 'var(--text-secondary)',
              fontWeight: 800,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
            <span>Billing Studio {editingInvoiceId ? '(Editing)' : ''}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            style={{
              flex: 1,
              padding: '0.55rem',
              borderRadius: '9px',
              border: 'none',
              background: activeTab === 'history' ? 'var(--sapphire-primary)' : 'transparent',
              color: activeTab === 'history' ? '#fff' : 'var(--text-secondary)',
              fontWeight: 800,
              fontSize: '0.86rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              transition: 'all 0.15s ease'
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 14 14" /></svg>
            <span>Saved Invoices & Bills History ({savedInvoices.length})</span>
          </button>
        </div>

        {/* ════════════════════ TAB 1: BILLING STUDIO ════════════════════ */}
        {activeTab === 'editor' && (
          <div>
            {/* Auto-Fetch Order Header Banner */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              {/* Search by INFO NO. Bar */}
              <div className="card-glass" style={{ padding: '0.9rem', borderRadius: '12px', border: '1px solid rgba(59, 130, 246, 0.3)', background: 'rgba(59, 130, 246, 0.06)' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--sapphire-light)', marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  Optional: Link & Fetch from Existing INFO NO.:
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="number"
                    placeholder="Enter INFO NO. (e.g. 2412)..."
                    value={searchInfoInput}
                    onChange={(e) => setSearchInfoInput(e.target.value)}
                    style={{ flex: 1, padding: '0.45rem 0.65rem', borderRadius: '7px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 700, outline: 'none' }}
                  />
                  <button
                    type="button"
                    onClick={() => handleFetchOrderByInfo(searchInfoInput)}
                    style={{ padding: '0.45rem 1rem', borderRadius: '7px', border: 'none', background: 'var(--sapphire-primary)', color: '#fff', fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                  >
                    Fetch
                  </button>
                </div>
              </div>

              {/* Mode and Document Configuration Bar */}
              <div className="card-glass" style={{ padding: '0.9rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--bg-surface)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                {/* Doc Type Toggle (Invoice vs Quotation) */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>DOCUMENT TYPE</label>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button
                      type="button"
                      onClick={() => setDocType('INVOICE')}
                      style={{
                        padding: '0.35rem 0.8rem',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        border: docType === 'INVOICE' ? '1px solid #10b981' : '1px solid var(--border)',
                        background: docType === 'INVOICE' ? '#10b981' : 'transparent',
                        color: docType === 'INVOICE' ? '#ffffff' : 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      Tax Invoice
                    </button>
                    <button
                      type="button"
                      onClick={() => setDocType('QUOTATION')}
                      style={{
                        padding: '0.35rem 0.8rem',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        border: docType === 'QUOTATION' ? '1px solid #3b82f6' : '1px solid var(--border)',
                        background: docType === 'QUOTATION' ? '#3b82f6' : 'transparent',
                        color: docType === 'QUOTATION' ? '#ffffff' : 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      Quotation
                    </button>
                  </div>
                </div>

                {/* Tax Mode Toggle (GST vs NON-GST) */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>BILLING SCHEME</label>
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    <button
                      type="button"
                      onClick={() => handleBillTypeChange('GST')}
                      style={{
                        padding: '0.35rem 0.85rem',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        border: billType === 'GST' ? '1px solid #f59e0b' : '1px solid var(--border)',
                        background: billType === 'GST' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                        color: billType === 'GST' ? '#f59e0b' : 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      ★ GST Bill
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBillTypeChange('NON_GST')}
                      style={{
                        padding: '0.35rem 0.85rem',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        border: billType === 'NON_GST' ? '1px solid var(--border)' : '1px solid var(--border)',
                        background: billType === 'NON_GST' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                        color: billType === 'NON_GST' ? '#ffffff' : 'var(--text-secondary)',
                        cursor: 'pointer'
                      }}
                    >
                      Non-GST
                    </button>
                  </div>
                </div>

                {/* Status indicator */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>RECORD MODE</label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '0.25rem 0.6rem', borderRadius: '6px', background: selectedOrder ? 'rgba(59, 130, 246, 0.15)' : 'rgba(16, 185, 129, 0.15)', color: selectedOrder ? '#3b82f6' : '#10b981' }}>
                    {selectedOrder ? `Linked (INFO #${selectedOrder.infoNumber})` : 'Manual Bill (Stored in DB)'}
                  </span>
                </div>
              </div>
            </div>

            {/* ── GST SPECIFIC METADATA BAR (SHOWN WHEN GST IS ACTIVE) ── */}
            {billType === 'GST' && (
              <div className="card-glass" style={{ padding: '1rem', borderRadius: '12px', border: '1px solid rgba(245, 158, 11, 0.4)', background: 'rgba(245, 158, 11, 0.05)', marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                    GST Tax Details & Compliance
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                    Print Mart GSTIN: <strong style={{ color: '#10b981' }}>32KRBPK8345C1ZW</strong>
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                  {/* Customer GSTIN */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>Customer GSTIN (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. 32AAAAA0000A1Z5"
                      value={customerGstin}
                      onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())}
                      style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: '#f59e0b', fontSize: '0.82rem', fontWeight: 700, letterSpacing: '0.04em' }}
                    />
                  </div>

                  {/* HSN/SAC Code */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>HSN / SAC Code</label>
                    <select
                      value={hsnCode}
                      onChange={(e) => setHsnCode(e.target.value)}
                      style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                    >
                      {HSN_OPTIONS.map(opt => (
                        <option key={opt.code} value={opt.code} style={{ background: '#161e31', color: '#fff' }}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Supply Location / Inter-State IGST Toggle */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>State of Supply</label>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      <select
                        value={isInterState ? 'OUTSIDE' : 'KERALA'}
                        onChange={(e) => {
                          const isOutside = e.target.value === 'OUTSIDE';
                          setIsInterState(isOutside);
                          if (!isOutside) {
                            setStateName('Kerala');
                            setStateCode('32');
                          }
                        }}
                        style={{ flex: 1, padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                      >
                        <option value="KERALA" style={{ background: '#161e31', color: '#fff' }}>Kerala (Intra-State: CGST + SGST)</option>
                        <option value="OUTSIDE" style={{ background: '#161e31', color: '#fff' }}>Inter-State (IGST)</option>
                      </select>
                    </div>
                  </div>

                  {/* Tax Rate Percentage */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>GST Tax Rate</label>
                    <select
                      value={taxRate}
                      onChange={(e) => setTaxRate(Number(e.target.value))}
                      style={{ width: '100%', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: '#10b981', fontWeight: 800, fontSize: '0.82rem' }}
                    >
                      <option value={5} style={{ background: '#161e31', color: '#fff' }}>5% (Apparel under ₹1000)</option>
                      <option value={12} style={{ background: '#161e31', color: '#fff' }}>12% (Apparel above ₹1000)</option>
                      <option value={18} style={{ background: '#161e31', color: '#fff' }}>18% (Printing / Services)</option>
                      <option value={0} style={{ background: '#161e31', color: '#fff' }}>0% (Exempt)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── MAIN TWO-COLUMN BILLING INTERFACE ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
              
              {/* LEFT: Customer & Line Items */}
              <div className="card-glass" style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                    Customer & Invoice Information
                  </h3>
                  {editingInvoiceId && (
                    <span style={{ fontSize: '0.72rem', background: '#f59e0b', color: '#000', fontWeight: 800, padding: '0.15rem 0.5rem', borderRadius: '4px' }}>
                      Editing Saved ID: {editingInvoiceId.slice(0, 6)}...
                    </span>
                  )}
                </div>

                {/* Customer Details Row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '0.9rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>Customer Name *</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. LUCKY SPORTS"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 700 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#10b981', marginBottom: '0.3rem' }}>Customer Phone *</label>
                    <input
                      type="text"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="e.g. +91 8848048733"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 700 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Order / Job Title</label>
                    <input
                      type="text"
                      value={orderTitle}
                      onChange={(e) => setOrderTitle(e.target.value)}
                      placeholder="e.g. SPORTIVATE TOURNAMENT"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                    />
                  </div>
                </div>

                {/* Address & Number Meta */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
                  <div style={{ gridColumn: 'span 2' }}>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Customer Billing Address</label>
                    <input
                      type="text"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      placeholder="e.g. Near Bus Stand, Kollam, Kerala - 691001"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Invoice / Bill No.</label>
                    <input
                      type="text"
                      value={invoiceNum}
                      onChange={(e) => setInvoiceNum(e.target.value)}
                      placeholder="e.g. INV-2026-0101"
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: '#3b82f6', fontSize: '0.85rem', fontWeight: 800 }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Invoice Date</label>
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      style={{ width: '100%', padding: '0.45rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
                    />
                  </div>
                </div>

                {/* Line Items Section Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--sapphire-light)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    📦 Invoice Line Items ({items.length})
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

                {/* Items List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                  {items.map((item, idx) => (
                    <div key={item.id || idx} style={{ background: 'rgba(255,255,255,0.03)', padding: '0.85rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <span style={{ background: 'var(--sapphire-primary)', color: '#fff', fontSize: '0.72rem', fontWeight: 900, padding: '0.15rem 0.5rem', borderRadius: '5px' }}>
                            #{idx + 1}
                          </span>
                          <input
                            type="text"
                            value={item.itemType}
                            onChange={(e) => handleUpdateItem(idx, { itemType: e.target.value })}
                            placeholder="JERSEY, HOODIE, SHORTS..."
                            style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 800, width: '160px' }}
                          />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.82rem', fontWeight: 900, color: '#10b981' }}>
                            ₹{(item.pieces * item.ratePerPiece).toLocaleString()}
                          </span>
                          {items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              title="Remove item"
                              style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid #ef4444', color: '#ef4444', padding: '0.2rem 0.45rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 800 }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Options Grid */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.55rem', marginBottom: '0.55rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#3b82f6', marginBottom: '0.15rem' }}>FABRIC</label>
                          <select
                            value={item.clothType}
                            onChange={(e) => handleUpdateItem(idx, { clothType: e.target.value })}
                            style={{ width: '100%', padding: '0.35rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                          >
                            {CLOTH_TYPES.map((t) => <option key={t} value={t} style={{ background: '#161e31', color: '#fff' }}>{t}</option>)}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#10b981', marginBottom: '0.15rem' }}>SLEEVE</label>
                          <select
                            value={item.sleeveType}
                            onChange={(e) => handleUpdateItem(idx, { sleeveType: e.target.value as any })}
                            style={{ width: '100%', padding: '0.35rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                          >
                            <option value="full" style={{ background: '#161e31', color: '#fff' }}>Full Sleeve</option>
                            <option value="half" style={{ background: '#161e31', color: '#fff' }}>Half Sleeve</option>
                            <option value="sleeveless" style={{ background: '#161e31', color: '#fff' }}>Sleeveless</option>
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', marginBottom: '0.15rem' }}>NECK</label>
                          <select
                            value={item.neckType}
                            onChange={(e) => handleUpdateItem(idx, { neckType: e.target.value })}
                            style={{ width: '100%', padding: '0.35rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                          >
                            {NECK_TYPES.map((t) => <option key={t} value={t} style={{ background: '#161e31', color: '#fff' }}>{t}</option>)}
                          </select>
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#3b82f6', marginBottom: '0.15rem' }}>QTY (PCS)</label>
                          <input
                            type="number"
                            min="1"
                            value={item.pieces}
                            onChange={(e) => handleUpdateItem(idx, { pieces: Number(e.target.value) || 1 })}
                            style={{ width: '100%', padding: '0.35rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: '#3b82f6', fontWeight: 800, fontSize: '0.8rem' }}
                          />
                        </div>

                        <div>
                          <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#ec4899', marginBottom: '0.15rem' }}>DTF PRINT</label>
                          <select
                            value={item.dtfOption}
                            onChange={(e) => handleUpdateItem(idx, { dtfOption: e.target.value })}
                            style={{ width: '100%', padding: '0.35rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.78rem' }}
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
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.15rem' }}>
                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#10b981' }}>RATE (₹)</label>
                            {item.isManualOverride && (
                              <button
                                type="button"
                                onClick={() => handleUpdateItem(idx, { isManualOverride: false })}
                                title="Reset auto rate"
                                style={{ background: 'transparent', border: 'none', color: '#3b82f6', fontSize: '0.65rem', cursor: 'pointer', textDecoration: 'underline' }}
                              >
                                ↺ Auto
                              </button>
                            )}
                          </div>
                          <input
                            type="number"
                            value={item.ratePerPiece}
                            onChange={(e) => handleUpdateItem(idx, { ratePerPiece: Number(e.target.value) || 0, isManualOverride: true })}
                            style={{ width: '100%', padding: '0.35rem', borderRadius: '6px', border: item.isManualOverride ? '1px solid #f59e0b' : '1px solid var(--border)', background: 'var(--bg-main)', color: '#10b981', fontWeight: 900, fontSize: '0.8rem' }}
                          />
                        </div>
                      </div>

                      {/* Shorts Option */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: item.hasShorts ? 'rgba(16, 185, 129, 0.1)' : 'transparent', padding: '0.3rem 0.5rem', borderRadius: '6px', border: item.hasShorts ? '1px solid #10b981' : '1px solid var(--border)' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 700, color: item.hasShorts ? '#10b981' : 'var(--text-primary)' }}>
                          <input
                            type="checkbox"
                            checked={item.hasShorts}
                            onChange={(e) => handleUpdateItem(idx, { hasShorts: e.target.checked })}
                            style={{ width: '13px', height: '13px', accentColor: '#10b981' }}
                          />
                          <span>Includes {item.bottomType === 'track_pant' ? 'Track Pant' : 'Shorts'}</span>
                        </label>
                        {item.hasShorts && (
                          <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.3rem' }}>
                            <button
                              type="button"
                              onClick={() => handleUpdateItem(idx, { bottomType: 'shorts' })}
                              style={{ padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, border: item.bottomType === 'shorts' ? '1px solid #10b981' : '1px solid var(--border)', background: item.bottomType === 'shorts' ? '#10b981' : 'transparent', color: item.bottomType === 'shorts' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}
                            >
                              Shorts
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateItem(idx, { bottomType: 'track_pant' })}
                              style={{ padding: '0.1rem 0.4rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, border: item.bottomType === 'track_pant' ? '1px solid #10b981' : '1px solid var(--border)', background: item.bottomType === 'track_pant' ? '#10b981' : 'transparent', color: item.bottomType === 'track_pant' ? '#fff' : 'var(--text-secondary)', cursor: 'pointer' }}
                            >
                              Track Pant
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Notes Input */}
                <div style={{ marginTop: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Invoice Terms & Notes</label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="e.g. Goods once sold will not be taken back. Payment due in 7 days..."
                    style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}
                  />
                </div>
              </div>

              {/* RIGHT: Financial Totals & Save Actions */}
              <div className="card-glass" style={{ padding: '1.25rem', borderRadius: '16px', border: '1.5px solid #10b981', background: 'rgba(16, 185, 129, 0.04)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem', borderBottom: '1px solid rgba(16, 185, 129, 0.3)', paddingBottom: '0.6rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 900, color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                      Financial Breakdown
                    </h3>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
                      {totalPieces} Total Pieces
                    </span>
                  </div>

                  {/* Summary list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginBottom: '0.85rem' }}>
                    {items.map((item, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', background: 'var(--bg-main)', padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                          #{i + 1} {item.itemType} ({item.clothType}):
                        </span>
                        <span style={{ fontWeight: 800, color: '#10b981' }}>
                          {item.pieces} pcs × ₹{item.ratePerPiece} = ₹{(item.pieces * item.ratePerPiece).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Financial Fields */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Subtotal:</span>
                      <span style={{ fontWeight: 900, color: 'var(--text-primary)' }}>₹{subtotal.toLocaleString()}</span>
                    </div>

                    {/* Discount */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444' }}>Discount (₹):</label>
                      <input
                        type="number"
                        min="0"
                        value={discountAmount}
                        onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                        style={{ width: '110px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: '#ef4444', fontWeight: 800, fontSize: '0.85rem', textAlign: 'right' }}
                      />
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                      <span style={{ fontWeight: 700, color: 'var(--text-secondary)' }}>Taxable Value:</span>
                      <span style={{ fontWeight: 900, color: 'var(--text-primary)' }}>₹{taxableAmount.toLocaleString()}</span>
                    </div>

                    {/* GST Breakdown */}
                    {billType === 'GST' && effectiveTaxRate > 0 && (
                      <div style={{ background: 'rgba(245, 158, 11, 0.08)', padding: '0.6rem', borderRadius: '8px', border: '1px dashed #f59e0b', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                        {isInterState ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                            <span style={{ color: '#f59e0b', fontWeight: 700 }}>IGST ({igstRate}%):</span>
                            <span style={{ color: '#f59e0b', fontWeight: 900 }}>₹{igstAmount.toLocaleString()}</span>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                              <span style={{ color: '#f59e0b', fontWeight: 700 }}>CGST ({cgstRate}%):</span>
                              <span style={{ color: '#f59e0b', fontWeight: 900 }}>₹{cgstAmount.toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                              <span style={{ color: '#f59e0b', fontWeight: 700 }}>SGST ({sgstRate}%):</span>
                              <span style={{ color: '#f59e0b', fontWeight: 900 }}>₹{sgstAmount.toLocaleString()}</span>
                            </div>
                          </>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', borderTop: '1px solid rgba(245, 158, 11, 0.3)', paddingTop: '0.2rem' }}>
                          <span style={{ color: '#f59e0b', fontWeight: 800 }}>Total GST:</span>
                          <span style={{ color: '#f59e0b', fontWeight: 900 }}>₹{taxAmount.toLocaleString()}</span>
                        </div>
                      </div>
                    )}

                    {/* Total Net Amount */}
                    <div style={{ borderTop: '2px solid #10b981', paddingTop: '0.5rem', marginTop: '0.2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#10b981' }}>TOTAL NET AMOUNT:</span>
                      <span style={{ fontSize: '1.3rem', fontWeight: 900, color: '#10b981' }}>₹{totalAmount.toLocaleString()}</span>
                    </div>

                    {/* Advance Paid */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.2rem' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: '#3b82f6' }}>Advance Received (₹):</label>
                      <input
                        type="number"
                        min="0"
                        value={advanceAmount}
                        onChange={(e) => setAdvanceAmount(Number(e.target.value) || 0)}
                        style={{ width: '110px', padding: '0.35rem 0.5rem', borderRadius: '6px', border: '1px solid #3b82f6', background: 'var(--bg-main)', color: '#3b82f6', fontWeight: 900, fontSize: '0.9rem', textAlign: 'right' }}
                      />
                    </div>

                    {/* Payment Mode */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Payment Mode:</label>
                      <select
                        value={paymentMode}
                        onChange={(e) => setPaymentMode(e.target.value)}
                        style={{ width: '130px', padding: '0.35rem 0.4rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.78rem' }}
                      >
                        <option value="UPI / GPay" style={{ background: '#161e31', color: '#fff' }}>UPI / GPay</option>
                        <option value="Cash" style={{ background: '#161e31', color: '#fff' }}>Cash</option>
                        <option value="Bank Transfer" style={{ background: '#161e31', color: '#fff' }}>Bank Transfer</option>
                        <option value="Credit / Debit Card" style={{ background: '#161e31', color: '#fff' }}>Card</option>
                      </select>
                    </div>

                    {/* Balance Remaining Box */}
                    <div style={{
                      background: balanceAmount > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                      padding: '0.65rem 0.85rem',
                      borderRadius: '10px',
                      border: balanceAmount > 0 ? '1px solid #ef4444' : '1px solid #10b981',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginTop: '0.3rem'
                    }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 800, color: balanceAmount > 0 ? '#ef4444' : '#10b981' }}>
                        BALANCE REMAINING:
                      </span>
                      <span style={{ fontSize: '1.15rem', fontWeight: 900, color: balanceAmount > 0 ? '#ef4444' : '#10b981' }}>
                        ₹{balanceAmount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div style={{ marginTop: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handlePreviewInvoice}
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
                    <span>Preview & Print A4 {docType === 'INVOICE' ? 'Invoice' : 'Quotation'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSaveInvoiceToDatabase(false)}
                    disabled={savingInvoice}
                    style={{
                      width: '100%',
                      padding: '0.7rem',
                      borderRadius: '10px',
                      border: '1px solid #10b981',
                      background: 'rgba(16, 185, 129, 0.1)',
                      color: '#10b981',
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></svg>
                    <span>{editingInvoiceId ? 'Update Invoice in Database' : 'Save Invoice to Database'}</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ════════════════════ TAB 2: SAVED INVOICES & BILLS HISTORY ════════════════════ */}
        {activeTab === 'history' && (
          <div>
            {/* Filter Bar */}
            <div className="card-glass" style={{ padding: '1rem', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--bg-surface)', marginBottom: '1.25rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
              {/* Search input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: '240px' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  <input
                    type="text"
                    placeholder="Search by customer, phone, invoice #, or INFO #..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    style={{ width: '100%', padding: '0.5rem 0.5rem 0.5rem 2.2rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
                  />
                </div>
              </div>

              {/* Doc Type Selector */}
              <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Type:</span>
                {(['ALL', 'INVOICE', 'QUOTATION'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setHistoryDocFilter(filter)}
                    style={{
                      padding: '0.35rem 0.7rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      border: historyDocFilter === filter ? '1px solid var(--sapphire-primary)' : '1px solid var(--border)',
                      background: historyDocFilter === filter ? 'var(--sapphire-primary)' : 'transparent',
                      color: historyDocFilter === filter ? '#fff' : 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    {filter === 'ALL' ? 'All' : filter === 'INVOICE' ? 'Invoices' : 'Quotations'}
                  </button>
                ))}
              </div>

              {/* GST Type Selector */}
              <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Tax:</span>
                {(['ALL', 'GST', 'NON_GST'] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setHistoryTypeFilter(filter)}
                    style={{
                      padding: '0.35rem 0.7rem',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      border: historyTypeFilter === filter ? '1px solid #f59e0b' : '1px solid var(--border)',
                      background: historyTypeFilter === filter ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                      color: historyTypeFilter === filter ? '#f59e0b' : 'var(--text-secondary)',
                      cursor: 'pointer'
                    }}
                  >
                    {filter === 'ALL' ? 'All' : filter === 'GST' ? 'GST Only' : 'Non-GST'}
                  </button>
                ))}
              </div>
            </div>

            {/* Invoices List / Table */}
            {filteredInvoices.length === 0 ? (
              <div className="card-glass" style={{ padding: '3rem 1.5rem', textAlign: 'center', borderRadius: '16px', border: '1px dashed var(--border)', background: 'var(--bg-surface)' }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="1.5" style={{ margin: '0 auto 0.75rem auto', display: 'block', opacity: 0.6 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
                  No Saved Invoices Found
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 1.25rem auto' }}>
                  {historySearch ? 'No saved invoices match your current search query.' : 'Create and save your first manual or order-linked invoice from the Billing Studio.'}
                </p>
                <button
                  type="button"
                  onClick={handleResetToNewManualBill}
                  style={{
                    padding: '0.6rem 1.25rem',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'var(--sapphire-primary)',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  + Create New Bill Now
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {filteredInvoices.map((inv) => {
                  const isPaid = inv.balanceAmount <= 0;
                  const isGst = inv.billType === 'GST';

                  return (
                    <div
                      key={inv.id}
                      className="card-glass"
                      style={{
                        padding: '1rem 1.25rem',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        background: 'var(--bg-surface)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '1rem'
                      }}
                    >
                      {/* Left Details */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', minWidth: '260px' }}>
                        <div style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '10px',
                          background: isGst ? 'rgba(245, 158, 11, 0.15)' : 'rgba(59, 130, 246, 0.15)',
                          color: isGst ? '#f59e0b' : '#3b82f6',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 900,
                          fontSize: '0.85rem'
                        }}>
                          {inv.docType === 'QUOTATION' ? 'QT' : 'INV'}
                        </div>

                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.95rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                              {inv.invoiceNumber}
                            </span>
                            <span style={{
                              fontSize: '0.68rem',
                              fontWeight: 900,
                              padding: '0.15rem 0.45rem',
                              borderRadius: '4px',
                              background: isGst ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.1)',
                              color: isGst ? '#f59e0b' : 'var(--text-secondary)'
                            }}>
                              {isGst ? `GST ${inv.taxRate}%` : 'NON-GST'}
                            </span>
                            {inv.infoNumber && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6' }}>
                                INFO #{inv.infoNumber}
                              </span>
                            )}
                            {inv.isManualBill && (
                              <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '0.15rem 0.45rem', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981' }}>
                                Manual Bill
                              </span>
                            )}
                          </div>

                          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
                            {inv.customerName} {inv.customerPhone ? `• ${inv.customerPhone}` : ''}
                          </div>

                          <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                            Date: {inv.invoiceDate || 'N/A'} • {inv.totalPieces || 0} Pieces • {inv.items?.length || 1} Item lines
                          </div>
                        </div>
                      </div>

                      {/* Middle Financial Summary */}
                      <div style={{ textAlign: 'right', minWidth: '140px' }}>
                        <div style={{ fontSize: '1.15rem', fontWeight: 900, color: '#10b981' }}>
                          ₹{inv.totalAmount?.toLocaleString() || 0}
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isPaid ? '#10b981' : '#ef4444' }}>
                          {isPaid ? 'PAID IN FULL' : `Bal: ₹${(inv.balanceAmount || 0).toLocaleString()}`}
                        </div>
                        {inv.advanceAmount > 0 && !isPaid && (
                          <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                            Adv: ₹{inv.advanceAmount.toLocaleString()} ({inv.paymentMode || 'UPI'})
                          </div>
                        )}
                      </div>

                      {/* Right Action Buttons */}
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        {/* View & Print */}
                        <button
                          type="button"
                          onClick={() => {
                            const invData: InvoiceData = {
                              id: inv.id,
                              docType: inv.docType,
                              billType: inv.billType,
                              invoiceNumber: inv.invoiceNumber,
                              quotationNumber: inv.quotationNumber,
                              invoiceDate: inv.invoiceDate,
                              dueDate: inv.dueDate,
                              customerName: inv.customerName,
                              customerPhone: inv.customerPhone || '',
                              customerAddress: inv.customerAddress,
                              customerGstin: inv.customerGstin,
                              stateName: inv.stateName,
                              stateCode: inv.stateCode,
                              isInterState: inv.isInterState,
                              orderTitle: inv.orderTitle,
                              infoNumber: inv.infoNumber,
                              orderId: inv.orderId,
                              itemType: inv.items?.[0]?.itemType || 'JERSEY',
                              clothType: inv.items?.[0]?.clothType || 'SALEENA',
                              sleeveType: inv.items?.[0]?.sleeveType || 'full',
                              neckType: inv.items?.[0]?.neckType || 'ROUND NECK',
                              hasShorts: inv.items?.[0]?.hasShorts || false,
                              pieces: inv.totalPieces,
                              ratePerPiece: inv.items?.[0]?.ratePerPiece || 250,
                              subtotal: inv.subtotal,
                              discountAmount: inv.discountAmount,
                              taxableAmount: inv.taxableAmount,
                              taxRate: inv.taxRate,
                              taxAmount: inv.taxAmount,
                              cgstRate: inv.cgstRate,
                              cgstAmount: inv.cgstAmount,
                              sgstRate: inv.sgstRate,
                              sgstAmount: inv.sgstAmount,
                              igstRate: inv.igstRate,
                              igstAmount: inv.igstAmount,
                              totalAmount: inv.totalAmount,
                              advanceAmount: inv.advanceAmount,
                              balanceAmount: inv.balanceAmount,
                              paymentMode: inv.paymentMode,
                              paymentStatus: inv.paymentStatus,
                              notes: inv.notes,
                              hsnCode: inv.hsnCode,
                              items: inv.items?.map(i => ({
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
                                hsnCode: inv.hsnCode,
                                dtfOption: i.dtfOption
                              }))
                            };
                            setCurrentInvoiceData(invData);
                            setShowInvoiceModal(true);
                          }}
                          style={{
                            padding: '0.45rem 0.75rem',
                            borderRadius: '7px',
                            border: '1px solid var(--border)',
                            background: 'var(--sapphire-primary)',
                            color: '#ffffff',
                            fontWeight: 800,
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                          <span>Print</span>
                        </button>

                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => handleEditSavedInvoice(inv)}
                          style={{
                            padding: '0.45rem 0.75rem',
                            borderRadius: '7px',
                            border: '1px solid var(--border)',
                            background: 'var(--bg-main)',
                            color: 'var(--text-primary)',
                            fontWeight: 800,
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                          <span>Edit</span>
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleDeleteInvoice(inv)}
                          title="Delete invoice"
                          style={{
                            padding: '0.45rem 0.6rem',
                            borderRadius: '7px',
                            border: '1px solid rgba(239, 68, 68, 0.4)',
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#ef4444',
                            fontWeight: 800,
                            fontSize: '0.78rem',
                            cursor: 'pointer'
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ── PRINTABLE A4 INVOICE MODAL (WITH OFFICIAL PRINT MART LOGO) ── */}
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
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#fff' }}>Loading Print Mart Billing System...</div>}>
      <BillingContent />
    </Suspense>
  );
}
