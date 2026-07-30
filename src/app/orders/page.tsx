"use client";
// Order Management Module v1.2

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { listenToAuthChanges, AppUser } from '@/lib/auth';
import {
  OrderRecord,
  OrderStatus,
  PlayerItem,
  createOrder,
  updateOrder,
  listenToOrders,
  updateOrderStatus,
  deleteOrder,
  getNextInfoNumber,
  findOrderByInfoNumber,
  formatLocalDate
} from '@/lib/db';
import { parseExcelText, parseExcelFile, parsePdfFile, calculateSizeBreakdown, calculateShortsBreakdown } from '@/lib/excelParser';
import Navbar from '@/components/Navbar';
import PrinterLoader from '@/components/PrinterLoader';
import InfoSheetSlip from '@/components/InfoSheetSlip';

const NECK_TYPES = [
  'ROUND NECK',
  'READYMADE COLLAR WITH ZIP',
  'READYMADE COLLAR WITH BUTTON',
  'V NECK',
  'CHINESE NECK',
  'CHINESE ZIP',
  'POLO BUTTON',
  'POLO V',
  'Custom / Other'
];

const CLOTH_TYPES = [
  'SALEENA',
  'NJS',
  'PP',
  'DOTKNIT 140',
  'DOTKNIT 180',
  'JAGUARD',
  'HONEYCOMB',
  'MARS',
  '100% Pure Cotton',
  'Custom / Other'
];

const STATUS_CONFIG: Record<OrderStatus, { label: string; icon: string; color: string; bg: string; border: string; desc: string }> = {
  pending: { label: 'Pending', icon: '', color: '#f97316', bg: 'rgba(249, 115, 22, 0.25)', border: 'rgba(249, 115, 22, 0.6)', desc: 'Order received, awaiting printing start' },
  in_production: { label: 'In Production', icon: '', color: '#eab308', bg: 'rgba(234, 179, 8, 0.25)', border: 'rgba(234, 179, 8, 0.6)', desc: 'Garments currently printing or curing' },
  ready: { label: 'Ready for Delivery', icon: '', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.25)', border: 'rgba(59, 130, 246, 0.6)', desc: 'Printing completed, packed for dispatch' },
  delivered: { label: 'Delivered', icon: '', color: '#10b981', bg: 'rgba(16, 185, 129, 0.25)', border: 'rgba(16, 185, 129, 0.6)', desc: 'Handed over to customer / courier' },
  cancelled: { label: 'Cancelled', icon: '', color: '#9ca3af', bg: 'rgba(156, 163, 175, 0.25)', border: 'rgba(156, 163, 175, 0.6)', desc: 'Order cancelled or suspended' },
};

export default function OrdersPage() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Orders State
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Detail States
  const [showModal, setShowModal] = useState(false);
  const [activeFormTab, setActiveFormTab] = useState<'receptionist' | 'designer'>('receptionist');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
  const [statusModalOrder, setStatusModalOrder] = useState<OrderRecord | null>(null);
  const [infoSheetOrder, setInfoSheetOrder] = useState<OrderRecord | null>(null);
  const [searchInfoInput, setSearchInfoInput] = useState('');

  // Form Fields State
  const [infoNumber, setInfoNumber] = useState<number>(2412);
  const [orderNumber, setOrderNumber] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderTitle, setOrderTitle] = useState('');
  const [itemType, setItemType] = useState('JERSEY');
  const [clothImage, setClothImage] = useState<string>(''); // Front
  const [backImage, setBackImage] = useState<string>(''); // Back
  const [pieces, setPieces] = useState<number | string>(10);
  const [neckType, setNeckType] = useState(NECK_TYPES[0]);
  const [customNeckType, setCustomNeckType] = useState('');
  const [clothType, setClothType] = useState(CLOTH_TYPES[0]);
  const [customClothType, setCustomClothType] = useState('');
  const [deliveryDate, setDeliveryDate] = useState('');
  const [printMethod, setPrintMethod] = useState<'sublimation' | 'dft' | 'normal'>('sublimation');
  const [printArea, setPrintArea] = useState<'front_only' | 'front_back' | 'full'>('full');
  const [sleeveType, setSleeveType] = useState<'sleeveless' | 'half' | 'full'>('full');
  const [hasShorts, setHasShorts] = useState(false);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Player Roster State
  const [players, setPlayers] = useState<PlayerItem[]>([]);
  const [excelInputText, setExcelInputText] = useState('');
  const [showExcelBox, setShowExcelBox] = useState(false);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerSize, setNewPlayerSize] = useState('42');
  const [newPlayerShortsSize, setNewPlayerShortsSize] = useState('32');
  const [newPlayerSleeve, setNewPlayerSleeve] = useState('F');
  const [newPlayerNumber, setNewPlayerNumber] = useState('');

  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  // Direct File Upload Handler (.xlsx, .xls, .csv, .pdf)
  const handleExcelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      toast.loading(`Parsing ${file.name}...`, { id: 'file-upload' });
      let parsed: PlayerItem[] = [];

      if (file.name.toLowerCase().endsWith('.pdf')) {
        parsed = await parsePdfFile(file);
      } else {
        parsed = await parseExcelFile(file);
      }

      toast.dismiss('file-upload');

      if (parsed.length === 0) {
        toast.error(`Could not find any player rows in ${file.name}`);
        return;
      }

      const defaultCode = sleeveType === 'half' ? 'H' : sleeveType === 'sleeveless' ? 'SL' : 'F';
      const parsedWithSleeve = parsed.map((p) => ({
        ...p,
        sleeve: p.sleeve || defaultCode,
      }));

      const updated = [...players, ...parsedWithSleeve];
      setPlayers(updated);
      setPieces(updated.length);
      toast.success(`Imported ${parsed.length} players directly from ${file.name}! Total: ${updated.length}`);
    } catch (err) {
      toast.dismiss('file-upload');
      console.error('Error reading file:', err);
      toast.error('Failed to read file. Please ensure it is a valid .pdf, .xlsx, .xls, or .csv file.');
    }
  };

  // Auto-Fetch & Pre-fill from Existing INFO NO.
  const handleFetchExistingInfo = async (searchInfoNum: number | string) => {
    if (!searchInfoNum) {
      toast.error('Please enter an INFO NO. to fetch data');
      return;
    }

    const num = Number(searchInfoNum);
    if (isNaN(num)) {
      toast.error('Invalid INFO NO.');
      return;
    }

    try {
      toast.loading(`Fetching data for INFO #${num}...`, { id: 'fetch-info' });
      const found = await findOrderByInfoNumber(num);
      toast.dismiss('fetch-info');

      if (!found) {
        toast.error(`No existing order found for INFO #${num}`);
        return;
      }

      // Pre-fill all fields from found order
      setCustomerName(found.customerName || '');
      setCustomerPhone(found.customerPhone || '');
      setOrderTitle(found.orderTitle || '');
      setItemType(found.itemType || 'JERSEY');
      setClothImage(found.clothImage || '');
      setBackImage(found.backImage || '');
      setPieces(found.pieces || 1);

      if (NECK_TYPES.includes(found.neckType)) {
        setNeckType(found.neckType);
        setCustomNeckType('');
      } else {
        setNeckType('Custom / Other');
        setCustomNeckType(found.neckType);
      }

      if (CLOTH_TYPES.includes(found.clothType)) {
        setClothType(found.clothType);
        setCustomClothType('');
      } else {
        setClothType('Custom / Other');
        setCustomClothType(found.clothType);
      }

      if (found.deliveryDate) setDeliveryDate(found.deliveryDate);
      setPrintMethod(found.printMethod || 'sublimation');
      setPrintArea(found.printArea || 'full');
      setSleeveType(found.sleeveType || 'full');
      setHasShorts(Boolean(found.hasShorts || found.players?.some(p => p.shortsSize && p.shortsSize !== '-')));
      setNotes(found.notes || '');
      if (found.players && found.players.length > 0) {
        setPlayers([...found.players]);
      }

      toast.success(`✓ Pre-filled all details from INFO #${num} (${found.customerName})!`);
    } catch (err) {
      toast.dismiss('fetch-info');
      console.error('Error fetching order info:', err);
      toast.error('Failed to fetch order details');
    }
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = listenToAuthChanges((authUser, appUserData) => {
      if (!authUser || !appUserData) {
        router.push('/');
        return;
      }
      if (appUserData.role === 'pending') {
        router.push('/pending');
        return;
      }
      setUser(appUserData);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, [router]);

  // Subscribe to Orders
  useEffect(() => {
    if (!user) return;
    const unsubscribe = listenToOrders((data) => {
      setOrders(data);
      setLoadingOrders(false);
    });
    return () => unsubscribe();
  }, [user]);

  // Clipboard Image Paste (Ctrl+V) listener for Design Mockup
  useEffect(() => {
    if (!showModal) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            processImageFile(file, (base64) => {
              setClothImage(base64);
              toast.success('Design mockup image pasted from clipboard!');
            });
          }
          break;
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [showModal]);

  // Set default delivery date to 3 days from today
  useEffect(() => {
    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    setDeliveryDate(formatLocalDate(defaultDate));
  }, []);

  // Open Create Modal (Receptionist Intake by Default)
  const handleOpenCreateModal = async (initialTab: 'receptionist' | 'designer' = 'receptionist') => {
    setEditingOrderId(null);
    setActiveFormTab(initialTab);
    const nextNum = await getNextInfoNumber();
    setInfoNumber(nextNum);
    setOrderNumber(`ORD-${nextNum}`);
    setCustomerName('');
    setCustomerPhone('');
    setOrderTitle('');
    setItemType('JERSEY');
    setClothImage('');
    setBackImage('');
    setPieces(10);
    setNeckType(NECK_TYPES[0]);
    setCustomNeckType('');
    setClothType(CLOTH_TYPES[0]);
    setCustomClothType('');
    setNotes('');
    setPrintMethod('sublimation');
    setPrintArea('full');
    setSleeveType('full');
    setHasShorts(false);
    setPlayers([]);
    setExcelInputText('');
    setShowExcelBox(false);

    const defaultDate = new Date();
    defaultDate.setDate(defaultDate.getDate() + 3);
    setDeliveryDate(formatLocalDate(defaultDate));
    setShowModal(true);
  };

  // Open Edit Modal for Existing Order
  const handleOpenEditModal = (ord: OrderRecord, targetTab: 'receptionist' | 'designer' = 'receptionist') => {
    setEditingOrderId(ord.id!);
    setActiveFormTab(targetTab);
    setInfoNumber(ord.infoNumber || 2412);
    setOrderNumber(ord.orderNumber || `ORD-${ord.infoNumber}`);
    setCustomerName(ord.customerName || '');
    setCustomerPhone(ord.customerPhone || '');
    setOrderTitle(ord.orderTitle || '');
    setItemType(ord.itemType || 'JERSEY');
    setClothImage(ord.clothImage || '');
    setBackImage(ord.backImage || '');
    setPieces(ord.pieces || 1);
    
    if (NECK_TYPES.includes(ord.neckType)) {
      setNeckType(ord.neckType);
      setCustomNeckType('');
    } else {
      setNeckType('Custom / Other');
      setCustomNeckType(ord.neckType);
    }

    if (CLOTH_TYPES.includes(ord.clothType)) {
      setClothType(ord.clothType);
      setCustomClothType('');
    } else {
      setClothType('Custom / Other');
      setCustomClothType(ord.clothType);
    }

    setDeliveryDate(ord.deliveryDate || '');
    setPrintMethod(ord.printMethod || 'sublimation');
    setPrintArea(ord.printArea || 'full');
    setSleeveType(ord.sleeveType || 'full');
    setHasShorts(Boolean(ord.hasShorts || ord.players?.some(p => p.shortsSize && p.shortsSize !== '-')));
    setNotes(ord.notes || '');
    setPlayers(ord.players ? [...ord.players] : []);
    setExcelInputText('');
    setShowExcelBox(false);
    setShowModal(true);
  };

  // Handle Sleeve Type Change from Designer Top Section
  const handleSleeveTypeChange = (newType: 'full' | 'half' | 'sleeveless') => {
    setSleeveType(newType);
    const code = newType === 'half' ? 'H' : newType === 'sleeveless' ? 'SL' : 'F';
    setNewPlayerSleeve(code);

    // Update ALL players in the roster list to match the newly selected sleeve type
    setPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        sleeve: code,
      }))
    );
  };

  // Process Excel Copy-Pasted Data
  const handleParseExcel = () => {
    if (!excelInputText.trim()) {
      toast.error('Please paste Excel data first');
      return;
    }
    const parsed = parseExcelText(excelInputText);
    if (parsed.length === 0) {
      toast.error('Could not find player data in pasted text. Format: Name Size Number');
      return;
    }

    const defaultCode = sleeveType === 'half' ? 'H' : sleeveType === 'sleeveless' ? 'SL' : 'F';
    const parsedWithSleeve = parsed.map((p) => ({
      ...p,
      sleeve: p.sleeve || defaultCode,
    }));

    const updatedPlayers = [...players, ...parsedWithSleeve];
    setPlayers(updatedPlayers);
    setPieces(updatedPlayers.length);
    setExcelInputText('');
    setShowExcelBox(false);
    toast.success(`Imported ${parsed.length} players from Excel data! Total: ${updatedPlayers.length}`);
  };

  // Add Single Player to Table
  const handleAddPlayer = () => {
    if (!newPlayerName.trim()) {
      toast.error('Player name is required');
      return;
    }
    const updated = [
      ...players,
      {
        name: newPlayerName.trim(),
        size: newPlayerSize.trim(),
        number: newPlayerNumber.trim(),
        shortsSize: hasShorts ? newPlayerShortsSize.trim() : undefined,
        sleeve: newPlayerSleeve.trim() || undefined,
      },
    ];
    setPlayers(updated);
    setPieces(updated.length);
    setNewPlayerName('');
    setNewPlayerNumber('');
  };

  // Remove Player from Table
  const handleRemovePlayer = (index: number) => {
    const updated = players.filter((_, idx) => idx !== index);
    setPlayers(updated);
    if (updated.length > 0) setPieces(updated.length);
  };

  // Inline Edit Player Field
  const handleUpdatePlayerField = (index: number, field: keyof PlayerItem, value: string) => {
    setPlayers((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
      };
      return updated;
    });
  };

  // Compress & Set Images
  const processImageFile = (file: File, callback: (base64: string) => void) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload a valid image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        callback(dataUrl);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Save Order Handler (Supports both Receptionist and Designer tabs)
  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    if (!customerName.trim()) {
      toast.error('Please enter Customer Name');
      return;
    }

    if (!customerPhone.trim()) {
      toast.error('Please enter Customer Mobile Number');
      return;
    }

    const finalPieces = players.length > 0 ? players.length : Number(pieces);
    if (isNaN(finalPieces) || finalPieces <= 0) {
      toast.error('Please enter a valid number of pieces');
      return;
    }

    if (!deliveryDate) {
      toast.error('Please select a delivery date');
      return;
    }

    const finalNeckType = neckType === 'Custom / Other' ? (customNeckType.trim() || 'Custom Neck') : neckType;
    const finalClothType = clothType === 'Custom / Other' ? (customClothType.trim() || 'Custom Fabric') : clothType;

    setSubmitting(true);
    try {
      const payload = {
        infoNumber: Number(infoNumber) || 2412,
        orderNumber: orderNumber || `ORD-${infoNumber}`,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        orderTitle: orderTitle.trim(),
        itemType: itemType.trim() || 'JERSEY',
        clothImage: clothImage || '',
        backImage: backImage || '',
        pieces: finalPieces,
        neckType: finalNeckType,
        clothType: finalClothType,
        deliveryDate,
        printMethod,
        printArea,
        sleeveType,
        hasShorts,
        players,
        notes: notes.trim(),
      };

      if (editingOrderId) {
        await updateOrder(editingOrderId, payload);
        toast.success(`Order INFO #${infoNumber} updated!`);
      } else {
        await createOrder({
          ...payload,
          status: 'pending',
          createdByUid: user.uid,
          createdByName: user.displayName,
        });
        toast.success(`Receptionist Intake created! INFO #${infoNumber}`);
      }

      setShowModal(false);
    } catch (err) {
      console.error('Error saving order:', err);
      toast.error('Failed to save order. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Status Change Handler
  const handleStatusChange = async (orderId: string, newStatus: OrderStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      toast.success(`Order status updated to ${newStatus.replace('_', ' ').toUpperCase()}`);
    } catch (err) {
      console.error('Error updating status:', err);
      toast.error('Failed to update status');
    }
  };

  // Delete Order Handler
  const handleDelete = async (orderId: string, infoNum: number | string) => {
    if (!confirm(`Are you sure you want to delete order INFO #${infoNum}?`)) return;
    try {
      await deleteOrder(orderId);
      toast.success('Order deleted');
      if (statusModalOrder?.id === orderId) setStatusModalOrder(null);
      if (infoSheetOrder?.id === orderId) setInfoSheetOrder(null);
    } catch (err) {
      console.error('Error deleting order:', err);
      toast.error('Failed to delete order');
    }
  };

  // Filter & Search Logic
  const filteredOrders = orders.filter((ord) => {
    const matchesStatus = filterStatus === 'all' || ord.status === filterStatus;
    const q = searchQuery.toLowerCase();
    const matchesQuery =
      !q ||
      String(ord.infoNumber || '').includes(q) ||
      ord.orderNumber.toLowerCase().includes(q) ||
      ord.customerName.toLowerCase().includes(q) ||
      (ord.customerPhone && ord.customerPhone.toLowerCase().includes(q)) ||
      (ord.orderTitle && ord.orderTitle.toLowerCase().includes(q)) ||
      ord.clothType.toLowerCase().includes(q) ||
      ord.neckType.toLowerCase().includes(q) ||
      ord.createdByName.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  // Calculate Order Statistics
  const todayStr = formatLocalDate(new Date());
  const totalOrders = orders.length;
  const inProductionCount = orders.filter((o) => o.status === 'in_production').length;
  const readyCount = orders.filter((o) => o.status === 'ready').length;
  const urgentCount = orders.filter(
    (o) => o.status !== 'delivered' && o.status !== 'cancelled' && o.deliveryDate <= todayStr
  ).length;

  const liveBreakdown = calculateSizeBreakdown(players);

  if (authLoading) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh', background: 'var(--bg-main)' }}>
        <PrinterLoader text="Loading Order Management..." type="tshirt" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-main)', paddingBottom: '6rem' }}>
      <Navbar user={user} />

      <main className="dashboard-container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 0.75rem' }}>
        {/* Header Title + 2 Section Quick Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg> Order Management Workflow
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginTop: '0.2rem' }}>
              Section 1: Receptionist Quick Intake | Section 2: Designer Production Specs & Roster
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Section 1 Button */}
            <button
              onClick={() => handleOpenCreateModal('receptionist')}
              className="btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                padding: '0.6rem 1.1rem',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '0.85rem',
                boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
                cursor: 'pointer'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
              <span>1. Receptionist Intake</span>
            </button>

            {/* Section 2 Button */}
            <button
              onClick={() => handleOpenCreateModal('designer')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                padding: '0.6rem 1.1rem',
                borderRadius: '12px',
                fontWeight: 700,
                fontSize: '0.85rem',
                background: 'rgba(217, 37, 37, 0.18)',
                border: '1px solid #d92525',
                color: '#ef4444',
                cursor: 'pointer'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="9.8" y1="8.2" x2="20" y2="18" /><line x1="9.8" y1="15.8" x2="20" y2="6" /></svg>
              <span>2. Designer Production</span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <div className="card-glass" style={{ padding: '0.85rem 1rem', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Total</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{totalOrders}</div>
            </div>
          </div>

          <div className="card-glass" style={{ padding: '0.85rem 1rem', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(234, 179, 8, 0.2)', color: '#eab308', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Production</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{inProductionCount}</div>
            </div>
          </div>

          <div className="card-glass" style={{ padding: '0.85rem 1rem', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Ready</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{readyCount}</div>
            </div>
          </div>

          <div className="card-glass" style={{ padding: '0.85rem 1rem', borderRadius: '14px', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
            </div>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>Due Today</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>{urgentCount}</div>
            </div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.25rem', background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: '14px', border: '1px solid var(--border)' }}>
          {/* Status Filter Tabs */}
          <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.25rem', width: '100%', scrollbarWidth: 'none' }}>
            {[
              { id: 'all', label: 'All Orders' },
              { id: 'pending', label: 'Pending' },
              { id: 'in_production', label: 'In Production' },
              { id: 'ready', label: 'Ready' },
              { id: 'delivered', label: 'Delivered' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                style={{
                  padding: '0.45rem 0.75rem',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  background: filterStatus === tab.id ? 'var(--sapphire-primary)' : 'rgba(255,255,255,0.05)',
                  color: filterStatus === tab.id ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                  flexShrink: 0
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', width: '100%' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }}>
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search INFO NO, customer, phone, order name, fabric, neck..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem 0.55rem 2.3rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--bg-main)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem'
              }}
            />
          </div>
        </div>

        {/* Orders Grid */}
        {loadingOrders ? (
          <div style={{ textAlign: 'center', padding: '3rem 0' }}>
            <PrinterLoader text="Syncing Orders..." type="tshirt" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="card-glass" style={{ textAlign: 'center', padding: '3rem 1rem', borderRadius: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <svg width="48" height="48" viewBox="0 0 100 100" fill="none" stroke="var(--text-secondary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5 }}><path d="M 35,10 C 45,18 55,18 65,10 L 78,10 L 92,24 L 84,32 L 76,26 L 76,85 L 24,85 L 24,26 L 16,32 L 8,24 L 22,10 Z" /></svg>
            </div>
            <h3 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', fontWeight: 700 }}>No Orders Found</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem', marginBottom: '1.25rem' }}>
              {searchQuery || filterStatus !== 'all'
                ? 'No orders match your filter criteria.'
                : 'No active orders in the database yet.'}
            </p>
            <button
              onClick={() => handleOpenCreateModal('receptionist')}
              className="btn-primary"
              style={{ padding: '0.55rem 1.25rem', borderRadius: '8px', fontSize: '0.85rem' }}
            >
              + Receptionist Quick Intake
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: '0.85rem' }}>
            {filteredOrders.map((ord) => {
              const isOverdue = ord.deliveryDate < todayStr && ord.status !== 'delivered' && ord.status !== 'cancelled';
              const isDueToday = ord.deliveryDate === todayStr && ord.status !== 'delivered' && ord.status !== 'cancelled';
              const statusInfo = STATUS_CONFIG[ord.status] || STATUS_CONFIG.pending;
              const ordBreakdown = calculateSizeBreakdown(ord.players || []);
              const hasDesignerSpecs = (ord.players && ord.players.length > 0) || ord.clothImage || ord.backImage;

              return (
                <div
                  key={ord.id}
                  className="card-glass"
                  style={{
                    borderRadius: '12px',
                    padding: '0.75rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    border: isOverdue
                      ? '1px solid rgba(239, 68, 68, 0.6)'
                      : isDueToday
                      ? '1px solid rgba(234, 179, 8, 0.6)'
                      : '1px solid var(--border)',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.12)',
                    position: 'relative'
                  }}
                >
                  <div>
                    {/* Header: INFO NO & Customer / Order Name */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4rem', marginBottom: '0.4rem' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#ffffff', background: '#d92525', padding: '0.15rem 0.45rem', borderRadius: '5px', letterSpacing: '0.04em' }}>
                            INFO #{ord.infoNumber || 2412}
                          </span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>{ord.orderNumber}</span>
                        </div>

                        <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.25rem', margin: 0, lineHeight: 1.25 }}>
                          {ord.customerName} {ord.orderTitle && <span style={{ color: 'var(--sapphire-light)', fontSize: '0.78rem' }}>({ord.orderTitle})</span>}
                        </h4>
                        {ord.customerPhone && (
                          <div style={{ fontSize: '0.73rem', color: '#10b981', fontWeight: 700, marginTop: '0.1rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                            {ord.customerPhone}
                          </div>
                        )}
                      </div>

                      {/* Status Dropdown */}
                      <select
                        value={ord.status}
                        onChange={(e) => handleStatusChange(ord.id!, e.target.value as OrderStatus)}
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '0.25rem 0.45rem',
                          borderRadius: '6px',
                          border: `1.5px solid ${statusInfo.border}`,
                          cursor: 'pointer',
                          background: statusInfo.bg,
                          color: statusInfo.color,
                          outline: 'none',
                          WebkitAppearance: 'menulist'
                        }}
                      >
                        <option value="pending" style={{ background: '#161e31', color: '#f97316', fontWeight: 700 }}>Pending</option>
                        <option value="in_production" style={{ background: '#161e31', color: '#eab308', fontWeight: 700 }}>In Production</option>
                        <option value="ready" style={{ background: '#161e31', color: '#3b82f6', fontWeight: 700 }}>Ready</option>
                        <option value="delivered" style={{ background: '#161e31', color: '#10b981', fontWeight: 700 }}>Delivered</option>
                        <option value="cancelled" style={{ background: '#161e31', color: '#9ca3af', fontWeight: 700 }}>Cancelled</option>
                      </select>
                    </div>

                    {/* Section Status Badge Indicator */}
                    <div style={{ marginBottom: '0.5rem' }}>
                      {hasDesignerSpecs ? (
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#10b981', background: 'rgba(16, 185, 129, 0.12)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                          ✓ Specs Complete ({ord.players?.length || 0} Players)
                        </span>
                      ) : (
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#eab308', background: 'rgba(234, 179, 8, 0.12)', padding: '0.1rem 0.4rem', borderRadius: '4px', border: '1px solid rgba(234, 179, 8, 0.3)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#eab308' }} /> Intake Saved (Awaiting Designer Roster)
                        </span>
                      )}
                    </div>

                    {/* Proof Image & Receptionist Basic Specs */}
                    <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.5rem' }}>
                      {/* Proof Thumbnail */}
                      <div
                        onClick={() => ord.clothImage && setEnlargedImage(ord.clothImage)}
                        style={{
                          width: '56px',
                          height: '56px',
                          borderRadius: '8px',
                          background: 'var(--bg-main)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          cursor: ord.clothImage ? 'pointer' : 'default',
                          flexShrink: 0,
                          position: 'relative'
                        }}
                      >
                        {ord.clothImage ? (
                          <>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={ord.clothImage} alt="Proof" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', opacity: 0, transition: 'opacity 0.2s', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')} onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}>
                              <span style={{ fontSize: '0.6rem', color: '#fff', fontWeight: 700 }}>🔍 View</span>
                            </div>
                          </>
                        ) : (
                          <svg width="24" height="24" viewBox="0 0 100 100" fill="none" stroke="var(--text-secondary)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4 }}><path d="M 35,10 C 45,18 55,18 65,10 L 78,10 L 92,24 L 84,32 L 76,26 L 76,85 L 24,85 L 24,26 L 16,32 L 8,24 L 22,10 Z" /></svg>
                        )}
                      </div>

                      {/* Specs */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.18rem', fontSize: '0.75rem', color: 'var(--text-secondary)', flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>Pieces:</span>
                          <span style={{ background: 'rgba(255,255,255,0.08)', padding: '0.05rem 0.35rem', borderRadius: '4px', fontWeight: 800, color: 'var(--sapphire-light)', fontSize: '0.72rem' }}>
                            {ord.players && ord.players.length > 0 ? ord.players.length : ord.pieces} Pcs
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>Fabric:</span>
                          <span style={{ color: '#ef4444', fontWeight: 800, fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ord.clothType}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', minWidth: 0 }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', flexShrink: 0 }}>Neck:</span>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 600, textDecoration: 'underline', fontSize: '0.72rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ord.neckType}</span>
                        </div>

                        {ordBreakdown.summaryString && (
                          <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#3b82f6', marginTop: '0.05rem', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.25 }}>
                            Sizes: {ordBreakdown.summaryString}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 2-Section Action Buttons */}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem', marginTop: '0.3rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.25rem' }}>
                      <div style={{ fontSize: '0.7rem', fontWeight: 700, color: isOverdue ? '#ef4444' : isDueToday ? '#eab308' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13" /><polygon points="16 8 20 8 23 11 23 16 16 16 16 8" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>
                        <span>{ord.deliveryDate} {isOverdue && 'OVERDUE'} {isDueToday && 'TODAY'}</span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <button
                          type="button"
                          onClick={() => {
                            const summaryText = `ORDER INFO #${ord.infoNumber || 2412}\nCustomer: ${ord.customerName}\nPhone: ${ord.customerPhone || 'N/A'}\nOrder: ${ord.orderTitle || 'N/A'}\nPieces: ${ord.players?.length || ord.pieces}\nFabric: ${ord.clothType}\nNeck: ${ord.neckType}\nDelivery: ${ord.deliveryDate}`;
                            navigator.clipboard.writeText(summaryText);
                            toast.success(`Copied summary for INFO #${ord.infoNumber || 2412}!`);
                          }}
                          title="Copy order summary to clipboard"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid var(--border)', color: 'var(--text-secondary)', borderRadius: '5px', fontSize: '0.68rem', fontWeight: 600, padding: '0.18rem 0.4rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                          Copy
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDelete(ord.id!, ord.infoNumber)}
                          title="Delete order"
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '0.15rem', opacity: 0.7 }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Section 1 & Section 2 Edit Buttons */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(ord, 'receptionist')}
                        style={{
                          padding: '0.38rem',
                          borderRadius: '6px',
                          border: '1px solid var(--border)',
                          background: 'rgba(255,255,255,0.06)',
                          color: 'var(--text-primary)',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.2rem'
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                        Section 1 (Intake)
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(ord, 'designer')}
                        style={{
                          padding: '0.38rem',
                          borderRadius: '6px',
                          border: '1px solid rgba(59, 130, 246, 0.4)',
                          background: 'rgba(59, 130, 246, 0.15)',
                          color: '#3b82f6',
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.2rem'
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="9.8" y1="8.2" x2="20" y2="18" /><line x1="9.8" y1="15.8" x2="20" y2="6" /></svg>
                        Section 2 (Specs)
                      </button>
                    </div>

                    {/* View / Print Cutting & Fusing Info Slip Button */}
                    <button
                      type="button"
                      onClick={() => setInfoSheetOrder(ord)}
                      style={{
                        width: '100%',
                        padding: '0.45rem',
                        borderRadius: '8px',
                        border: '1px solid #d92525',
                        background: 'rgba(217, 37, 37, 0.15)',
                        color: '#ef4444',
                        fontSize: '0.78rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        transition: 'all 0.15s'
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" /></svg>
                      <span>Print Cutting & Fusing Info Slip</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── CREATE / EDIT ORDER MODAL (2-SECTION TABS) ── */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="card-glass" style={{ width: '100%', maxWidth: '680px', maxHeight: '92vh', overflowY: 'auto', borderRadius: '20px', padding: '1.25rem', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.6rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg> {editingOrderId ? `Edit Order INFO #${infoNumber}` : 'Add New Order'}
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
            </div>

            {/* Auto-Fetch Existing INFO NO. Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(59, 130, 246, 0.08)', padding: '0.55rem 0.75rem', borderRadius: '10px', border: '1px solid rgba(59, 130, 246, 0.3)', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--sapphire-light)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg> Auto-Fetch Existing INFO:
              </span>
              <input
                type="number"
                placeholder="Enter INFO NO. (e.g. 2412)..."
                value={searchInfoInput}
                onChange={(e) => setSearchInfoInput(e.target.value)}
                style={{ flex: 1, padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none' }}
              />
              <button
                type="button"
                onClick={() => handleFetchExistingInfo(searchInfoInput)}
                style={{ padding: '0.35rem 0.85rem', borderRadius: '6px', border: 'none', background: 'var(--sapphire-primary)', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg> Fetch Data
              </button>
            </div>

            {/* 2 Section Workflow Navigation Tabs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '1rem', background: 'var(--bg-main)', padding: '0.35rem', borderRadius: '10px' }}>
              <button
                type="button"
                onClick={() => setActiveFormTab('receptionist')}
                style={{
                  padding: '0.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: activeFormTab === 'receptionist' ? 'var(--sapphire-primary)' : 'transparent',
                  color: activeFormTab === 'receptionist' ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.2rem'
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                Section 1: Receptionist Intake
              </button>

              <button
                type="button"
                onClick={() => setActiveFormTab('designer')}
                style={{
                  padding: '0.5rem',
                  borderRadius: '8px',
                  border: 'none',
                  background: activeFormTab === 'designer' ? '#d92525' : 'transparent',
                  color: activeFormTab === 'designer' ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.2rem'
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><line x1="9.8" y1="8.2" x2="20" y2="18" /><line x1="9.8" y1="15.8" x2="20" y2="6" /></svg>
                Section 2: Designer Specs
              </button>
            </div>

            <form onSubmit={handleSubmitOrder} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* ── SECTION 1: RECEPTIONIST QUICK INTAKE TAB ── */}
              {activeFormTab === 'receptionist' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ background: 'rgba(59, 130, 246, 0.1)', padding: '0.6rem 0.8rem', borderRadius: '8px', borderLeft: '4px solid #3b82f6', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <strong>Receptionist Note:</strong> Fill basic customer details, mobile number, piece count, fabric, neck type, and target delivery date to take the order quickly.
                  </div>

                  {/* Customer Name, Mobile Number, Order Title */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>Customer Name *</label>
                      <input
                        type="text"
                        placeholder="e.g. LUCKY"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        required
                        style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#10b981', marginBottom: '0.3rem' }}>Customer Mobile Number *</label>
                      <input
                        type="text"
                        placeholder="e.g. +91 8848048733"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        required
                        style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Order Name / Title</label>
                      <input
                        type="text"
                        placeholder="e.g. SPORTIVATE"
                        value={orderTitle}
                        onChange={(e) => setOrderTitle(e.target.value)}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>

                  {/* Pieces, Delivery Date, Cloth & Neck Type */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>Total Pieces *</label>
                      <input
                        type="number"
                        min="1"
                        value={pieces}
                        onChange={(e) => setPieces(e.target.value)}
                        required
                        style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>Delivery Date *</label>
                      <input
                        type="date"
                        value={deliveryDate}
                        onChange={(e) => setDeliveryDate(e.target.value)}
                        required
                        style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#ef4444', marginBottom: '0.3rem' }}>Cloth / Fabric *</label>
                      <select value={clothType} onChange={(e) => setClothType(e.target.value)} style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                        {CLOTH_TYPES.map((t) => <option key={t} value={t} style={{ background: '#161e31', color: '#fff' }}>{t}</option>)}
                      </select>
                      {clothType === 'Custom / Other' && (
                        <input type="text" placeholder="Custom cloth..." value={customClothType} onChange={(e) => setCustomClothType(e.target.value)} style={{ width: '100%', marginTop: '0.3rem', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                      )}
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#ef4444', marginBottom: '0.3rem' }}>Neck Type *</label>
                      <select value={neckType} onChange={(e) => setNeckType(e.target.value)} style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>
                        {NECK_TYPES.map((t) => <option key={t} value={t} style={{ background: '#161e31', color: '#fff' }}>{t}</option>)}
                      </select>
                      {neckType === 'Custom / Other' && (
                        <input type="text" placeholder="Custom neck..." value={customNeckType} onChange={(e) => setCustomNeckType(e.target.value)} style={{ width: '100%', marginTop: '0.3rem', padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                      )}
                    </div>
                  </div>

                  {/* Receptionist Notes */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Receptionist Notes / Special Instructions</label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Customer requested urgent delivery before 2 PM..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem', resize: 'vertical' }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setActiveFormTab('designer')}
                      style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid #d92525', background: 'rgba(217, 37, 37, 0.15)', color: '#ef4444', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      Next Step: Add Designer Specs ➔
                    </button>

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button type="button" onClick={() => setShowModal(false)} style={{ padding: '0.6rem 1.25rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                      <button type="submit" disabled={submitting} className="btn-primary" style={{ padding: '0.68rem 1.5rem', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>
                        {submitting ? 'Saving...' : 'Save Order (Receptionist Intake)'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── SECTION 2: DESIGNER PRODUCTION SPECS & EXCEL ROSTER TAB ── */}
              {activeFormTab === 'designer' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div style={{ background: 'rgba(217, 37, 37, 0.1)', padding: '0.6rem 0.8rem', borderRadius: '8px', borderLeft: '4px solid #d92525', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <strong>Designer & Production Note:</strong> Upload front/back proof mockups, select printing method, and paste Excel player roster data (`Name Size Number`) for the Cutting & Fusing Master Slip.
                  </div>

                  {/* INFO NO. & Item Type */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: '#ef4444', marginBottom: '0.3rem' }}>INFO NO. *</label>
                      <input
                        type="number"
                        value={infoNumber}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setInfoNumber(val);
                          setOrderNumber(`ORD-${val}`);
                        }}
                        required
                        style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 800 }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>Item Type</label>
                      <input
                        type="text"
                        placeholder="e.g. JERSEY, SHIRT, HOODIE"
                        value={itemType}
                        onChange={(e) => setItemType(e.target.value)}
                        style={{ width: '100%', padding: '0.55rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.85rem' }}
                      />
                    </div>
                  </div>

                  {/* Single Combined Mockup Image Uploader + Paste Ctrl+V */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.3rem' }}>
                      Design Proof Mockup Image (Combined Front & Back artwork in 1 image)
                    </label>
                    <div
                      onClick={() => frontInputRef.current?.click()}
                      style={{
                        border: clothImage ? '2px solid #10b981' : '2px dashed #3b82f6',
                        borderRadius: '12px',
                        padding: '0.85rem',
                        textAlign: 'center',
                        cursor: 'pointer',
                        background: 'rgba(59, 130, 246, 0.05)',
                        transition: 'all 0.2s ease'
                      }}
                    >
                      {clothImage ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={clothImage} alt="Combined Mockup" style={{ maxHeight: '130px', borderRadius: '6px', objectFit: 'contain' }} />
                          <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>✓ Mockup Selected (Click to Change or Press Ctrl+V to Replace)</span>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.25rem' }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#3b82f6' }}>Click to Upload File OR Press Ctrl+V to Paste Image from Clipboard</span>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Upload 1 combined image containing Front & Back artwork</span>
                        </div>
                      )}
                      <input type="file" ref={frontInputRef} accept="image/*" onChange={(e) => e.target.files?.[0] && processImageFile(e.target.files[0], setClothImage)} style={{ display: 'none' }} />
                    </div>
                  </div>

                  {/* Print Specs Checkboxes */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', background: 'rgba(255,255,255,0.03)', padding: '0.65rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>PRINT METHOD</label>
                      <select value={printMethod} onChange={(e) => setPrintMethod(e.target.value as any)} style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                        <option value="sublimation" style={{ background: '#161e31', color: '#fff' }}>Sublimation</option>
                        <option value="dft" style={{ background: '#161e31', color: '#fff' }}>DFT</option>
                        <option value="normal" style={{ background: '#161e31', color: '#fff' }}>Normal</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>PRINTING AREA</label>
                      <select value={printArea} onChange={(e) => setPrintArea(e.target.value as any)} style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                        <option value="full" style={{ background: '#161e31', color: '#fff' }}>Full</option>
                        <option value="front_back" style={{ background: '#161e31', color: '#fff' }}>Front Back</option>
                        <option value="front_only" style={{ background: '#161e31', color: '#fff' }}>Front Only</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>SLEEVE TYPE (Master Default)</label>
                      <select value={sleeveType} onChange={(e) => handleSleeveTypeChange(e.target.value as any)} style={{ width: '100%', padding: '0.4rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }}>
                        <option value="full" style={{ background: '#161e31', color: '#fff' }}>Full Sleeve (F)</option>
                        <option value="half" style={{ background: '#161e31', color: '#fff' }}>Half Sleeve (H)</option>
                        <option value="sleeveless" style={{ background: '#161e31', color: '#fff' }}>Sleeveless (SL)</option>
                      </select>
                    </div>
                  </div>

                  {/* Include Shorts Option Checkbox */}
                  <div style={{ background: hasShorts ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255,255,255,0.03)', padding: '0.65rem 0.85rem', borderRadius: '10px', border: hasShorts ? '1px solid #10b981' : '1px solid var(--border)' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={hasShorts}
                        onChange={(e) => setHasShorts(e.target.checked)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#10b981' }}
                      />
                      <div>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: hasShorts ? '#10b981' : 'var(--text-primary)', display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v18h16V2H4zm2 2h4v12H6V4zm12 12h-4V4h4v12z" /></svg> Include Shorts / Pant Specifications
                        </span>
                        <span style={{ display: 'block', fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
                          Check this option to enable Shorts Size selection for each player in the roster
                        </span>
                      </div>
                    </label>
                  </div>

                  {/* ── PLAYERS ROSTER SECTION (EXCEL IMPORT + TABLE) ── */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '0.85rem', background: 'rgba(0,0,0,0.15)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg> Players Roster ({players.length} Total)
                        </h4>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '2px' }}>
                          {liveBreakdown.summaryString && (
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#3b82f6' }}>
                              Jersey Summary: {liveBreakdown.summaryString}
                            </span>
                          )}
                          {hasShorts && calculateShortsBreakdown(players).summaryString && (
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#10b981' }}>
                              Shorts Summary: {calculateShortsBreakdown(players).summaryString}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          onClick={() => excelFileInputRef.current?.click()}
                          style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid #10b981', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg> Upload Excel / CSV / PDF File
                        </button>
                        <input
                          type="file"
                          ref={excelFileInputRef}
                          accept=".xlsx, .xls, .csv, .pdf"
                          onChange={handleExcelFileUpload}
                          style={{ display: 'none' }}
                        />

                        <button
                          type="button"
                          onClick={() => setShowExcelBox(!showExcelBox)}
                          style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', border: '1px solid #3b82f6', background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" ry="1" /></svg> {showExcelBox ? 'Hide Paste Box' : 'Paste Text'}
                        </button>
                      </div>
                    </div>

                    {/* Excel Textarea Box */}
                    {showExcelBox && (
                      <div style={{ marginBottom: '0.85rem', background: 'var(--bg-main)', padding: '0.65rem', borderRadius: '8px', border: '1px solid #3b82f6' }}>
                        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.2rem' }}>
                          Copy-paste columns directly from Excel sheet (Name, Size, Number, Shorts Size):
                        </label>
                        <textarea
                          rows={4}
                          placeholder={`Paste Excel lines here, e.g.:\nJAGAN\t42\t9\t34\nADHI\t40\t3\t32\nSREE\t38\t11\t32`}
                          value={excelInputText}
                          onChange={(e) => setExcelInputText(e.target.value)}
                          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-primary)', fontSize: '0.8rem', fontFamily: 'monospace' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
                          <button
                            type="button"
                            onClick={handleParseExcel}
                            style={{ padding: '0.4rem 0.9rem', borderRadius: '6px', border: 'none', background: '#3b82f6', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}
                          >
                            Import Parsed Players
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Add Manual Player Inputs */}
                    <div style={{ display: 'grid', gridTemplateColumns: hasShorts ? '2fr 1fr 1fr 1fr 1fr auto' : '2fr 1fr 1fr 1fr auto', gap: '0.4rem', marginBottom: '0.65rem' }}>
                      <input type="text" placeholder="Player Name (e.g. JAGAN)" value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} style={{ padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                      <input type="text" placeholder="Shirt (42)" value={newPlayerSize} onChange={(e) => setNewPlayerSize(e.target.value)} style={{ padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                      <select value={newPlayerSleeve} onChange={(e) => setNewPlayerSleeve(e.target.value)} style={{ padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: '#3b82f6', fontWeight: 700, fontSize: '0.8rem' }}>
                        <option value="F" style={{ background: '#161e31', color: '#fff' }}>F (Full)</option>
                        <option value="H" style={{ background: '#161e31', color: '#fff' }}>H (Half)</option>
                        <option value="SL" style={{ background: '#161e31', color: '#fff' }}>SL (Sleeveless)</option>
                      </select>
                      {hasShorts && (
                        <input type="text" placeholder="Shorts (32)" value={newPlayerShortsSize} onChange={(e) => setNewPlayerShortsSize(e.target.value)} style={{ padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: '#10b981', fontWeight: 700, fontSize: '0.8rem' }} />
                      )}
                      <input type="text" placeholder="No. (9)" value={newPlayerNumber} onChange={(e) => setNewPlayerNumber(e.target.value)} style={{ padding: '0.45rem', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                      <button type="button" onClick={handleAddPlayer} style={{ padding: '0.45rem 0.75rem', borderRadius: '6px', border: 'none', background: '#10b981', color: '#fff', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer' }}>+ Add</button>
                    </div>

                    {/* Player List Table (Editable Inline) */}
                    {players.length > 0 && (
                      <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '6px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                          <thead style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', position: 'sticky', top: 0, zIndex: 1 }}>
                            <tr>
                              <th style={{ padding: '6px 6px', width: '24px' }}>#</th>
                              <th style={{ padding: '6px 6px' }}>Player Name</th>
                              <th style={{ padding: '6px 6px', width: '75px' }}>Shirt Size</th>
                              <th style={{ padding: '6px 6px', width: '65px', color: '#3b82f6' }}>Sleeve</th>
                              {hasShorts && <th style={{ padding: '6px 6px', width: '75px', color: '#10b981' }}>Shorts</th>}
                              <th style={{ padding: '6px 6px', width: '60px' }}>No.</th>
                              <th style={{ padding: '6px 6px', textAlign: 'right', width: '32px' }}>Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {players.map((p, idx) => (
                              <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                                <td style={{ padding: '4px 4px', opacity: 0.7, fontSize: '0.75rem' }}>{idx + 1}</td>
                                <td style={{ padding: '3px 3px' }}>
                                  <input
                                    type="text"
                                    value={p.name}
                                    onChange={(e) => handleUpdatePlayerField(idx, 'name', e.target.value)}
                                    placeholder="Name..."
                                    style={{
                                      width: '100%',
                                      padding: '0.25rem 0.35rem',
                                      borderRadius: '4px',
                                      border: '1px solid var(--border)',
                                      background: 'var(--bg-main)',
                                      color: 'var(--text-primary)',
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                      outline: 'none'
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '3px 3px' }}>
                                  <input
                                    type="text"
                                    value={p.size}
                                    onChange={(e) => handleUpdatePlayerField(idx, 'size', e.target.value)}
                                    placeholder="Shirt..."
                                    style={{
                                      width: '100%',
                                      padding: '0.25rem 0.35rem',
                                      borderRadius: '4px',
                                      border: '1px solid var(--border)',
                                      background: 'var(--bg-main)',
                                      color: 'var(--text-primary)',
                                      fontSize: '0.78rem',
                                      outline: 'none'
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '3px 3px' }}>
                                  <select
                                    value={p.sleeve || 'F'}
                                    onChange={(e) => handleUpdatePlayerField(idx, 'sleeve', e.target.value)}
                                    style={{
                                      width: '100%',
                                      padding: '0.25rem 0.2rem',
                                      borderRadius: '4px',
                                      border: '1px solid #3b82f6',
                                      background: 'var(--bg-main)',
                                      color: '#3b82f6',
                                      fontSize: '0.78rem',
                                      fontWeight: 800,
                                      outline: 'none'
                                    }}
                                  >
                                    <option value="F" style={{ background: '#161e31', color: '#fff' }}>F (Full)</option>
                                    <option value="H" style={{ background: '#161e31', color: '#fff' }}>H (Half)</option>
                                    <option value="SL" style={{ background: '#161e31', color: '#fff' }}>SL (Sleeveless)</option>
                                  </select>
                                </td>
                                {hasShorts && (
                                  <td style={{ padding: '3px 3px' }}>
                                    <input
                                      type="text"
                                      value={p.shortsSize || ''}
                                      onChange={(e) => handleUpdatePlayerField(idx, 'shortsSize', e.target.value)}
                                      placeholder="Shorts..."
                                      style={{
                                        width: '100%',
                                        padding: '0.25rem 0.35rem',
                                        borderRadius: '4px',
                                        border: '1px solid #10b981',
                                        background: 'var(--bg-main)',
                                        color: '#10b981',
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        outline: 'none'
                                      }}
                                    />
                                  </td>
                                )}
                                <td style={{ padding: '3px 3px' }}>
                                  <input
                                    type="text"
                                    value={p.number}
                                    onChange={(e) => handleUpdatePlayerField(idx, 'number', e.target.value)}
                                    placeholder="No..."
                                    style={{
                                      width: '100%',
                                      padding: '0.25rem 0.35rem',
                                      borderRadius: '4px',
                                      border: '1px solid var(--border)',
                                      background: 'var(--bg-main)',
                                      color: 'var(--text-primary)',
                                      fontSize: '0.78rem',
                                      outline: 'none'
                                    }}
                                  />
                                </td>
                                <td style={{ padding: '3px 6px', textAlign: 'right' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleRemovePlayer(idx)}
                                    title="Remove player"
                                    style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem' }}
                                  >
                                    ✕
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
                    <button
                      type="button"
                      onClick={() => setActiveFormTab('receptionist')}
                      style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      ⬅ Back to Section 1 (Receptionist)
                    </button>

                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <button type="button" onClick={() => setShowModal(false)} style={{ padding: '0.6rem 1.25rem', borderRadius: '10px', border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-primary)', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                      <button type="submit" disabled={submitting} className="btn-primary" style={{ padding: '0.68rem 1.5rem', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', background: '#d92525' }}>
                        {submitting ? 'Saving...' : 'Save Production Specs'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ── PRINT INFO SHEET MODAL ── */}
      {infoSheetOrder && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="card-glass" style={{ width: '100%', maxWidth: '940px', maxHeight: '92vh', overflowY: 'auto', borderRadius: '16px', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
            <InfoSheetSlip order={infoSheetOrder} onClose={() => setInfoSheetOrder(null)} />
          </div>
        </div>
      )}

      {/* ── ENLARGED IMAGE MODAL VIEW ── */}
      {enlargedImage && (
        <div onClick={() => setEnlargedImage(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', cursor: 'zoom-out' }}>
          <div style={{ position: 'relative', maxWidth: '95vw', maxHeight: '90vh' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enlargedImage} alt="Enlarged design proof" style={{ width: '100%', height: '100%', maxHeight: '85vh', objectFit: 'contain', borderRadius: '12px' }} />
            <button onClick={() => setEnlargedImage(null)} style={{ position: 'absolute', top: '-15px', right: '-15px', width: '36px', height: '36px', borderRadius: '50%', background: '#ef4444', color: '#fff', border: 'none', fontSize: '1.2rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
