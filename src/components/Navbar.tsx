"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOutUser, AppUser } from '@/lib/auth';
import { useEffect, useState, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

import { listenToPunchNotifications, markNotificationAsRead, markAllNotificationsAsRead, PunchNotification } from '@/lib/db';

// Tab bar icon components
const DashboardIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
  </svg>
);

const OrdersIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

const HistoryIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="12 8 12 12 14 14" />
    <path d="M3.05 11a9 9 0 1 0 .5-4.5" />
    <polyline points="3 3 3 8 8 8" />
  </svg>
);

const DevIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </svg>
);

const AdminIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const PriceIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
);

const BillingIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <line x1="2" y1="10" x2="22" y2="10" />
  </svg>
);

const TaxIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const SignOutIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const SunIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

const MoonIcon = ({ size = 14 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

const BellIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const playNotificationSound = () => {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5 tone
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5 tone
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch (err) {
    console.error("Audio chime playback error:", err);
  }
};

const formatNotificationTime = (timestamp: any) => {
  if (!timestamp) return '';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default function Navbar({ user }: { user: AppUser }) {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [punchNotifications, setPunchNotifications] = useState<PunchNotification[]>([]);
  const [showNotifDropdown, setShowNotifDropdown] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Request desktop notification permission on mount for admin
  useEffect(() => {
    if (user.role === 'admin' && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, [user]);

  // Theme initialization
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      setTheme(isLight ? 'light' : 'dark');
    }
  }, []);

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  // Close dropdowns on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
        setShowNotifDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Listen to bug reports
  useEffect(() => {
    if (user.role !== 'admin') return;

    const sessionStartTime = Date.now();
    const colRef = collection(db, 'feedback');
    const q = query(colRef, where('status', '==', 'pending'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingCount(snapshot.size);

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const fb = change.doc.data();
          if (fb.userId === user.uid) return;
          if (fb.type !== 'bug') return;

          const createdAtMs = fb.createdAt?.toMillis
            ? fb.createdAt.toMillis()
            : Date.now();

          if (createdAtMs > sessionStartTime) {
            toast((t) => (
              <div className="flex flex-col gap-1 text-left">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--danger)', display: 'inline-block', boxShadow: '0 0 8px var(--danger)' }} className="animate-pulse" /> New Bug Reported!
                </div>
                <div className="text-xs text-secondary">
                  <strong>{fb.userName}</strong>: {fb.title}
                </div>
              </div>
            ), {
              duration: 6000,
            });
          }
        }
      });
    });

    return () => unsubscribe();
  }, [user]);

  // Real-time Punch Notifications listener for Admin
  useEffect(() => {
    if (user.role !== 'admin') return;

    const sessionStartTime = Date.now();
    let isFirstLoad = true;

    const unsubscribe = listenToPunchNotifications((notifs) => {
      setPunchNotifications(notifs);

      if (isFirstLoad) {
        isFirstLoad = false;
        return;
      }

      // Check for new notifications added after session start
      notifs.forEach((n) => {
        if (n.userId === user.uid) return;

        const createdAtMs = n.timestamp?.toMillis ? n.timestamp.toMillis() : Date.now();
        if (createdAtMs > sessionStartTime) {
          const isPunchIn = n.type === 'punch_in';

          // Toast alert
          toast((t) => (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textAlign: 'left' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                background: isPunchIn ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                border: isPunchIn ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.9rem',
                flexShrink: 0
              }}>
                {isPunchIn ? '🟢' : '🔴'}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#ffffff' }}>
                  {isPunchIn ? 'Employee Punched In' : 'Employee Punched Out'}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{n.userName}</strong> {isPunchIn ? `punched in (${n.workMode || 'office'})` : 'punched out'}
                </div>
              </div>
            </div>
          ), { duration: 6000 });

          // Audio chime sound
          playNotificationSound();

          // Native Desktop Notification
          if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
            try {
              new Notification(isPunchIn ? '🟢 Employee Punched In' : '🔴 Employee Punched Out', {
                body: `${n.userName} has ${isPunchIn ? 'punched in' : 'punched out'}.`,
                icon: n.userPhoto || '/apple-icon.png',
              });
            } catch (e) {
              console.error("Desktop notification error:", e);
            }
          }
        }
      });
    });

    return () => unsubscribe();
  }, [user]);

  const handleSignOut = async () => {
    await signOutUser();
  };

  const initials = user.displayName
    ? user.displayName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : 'PM';

  const desktopNavItems = [
    { href: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
    { href: '/orders', label: 'Orders', icon: OrdersIcon },
    { href: '/billing', label: 'Billing', icon: BillingIcon },
    { href: '/tally-export', label: 'Tally Tax', icon: TaxIcon },
    { href: '/price-settings', label: 'Prices', icon: PriceIcon },
    { href: '/history', label: 'History', icon: HistoryIcon },
    {
      href: '/developer',
      label: 'Dev Logs',
      icon: DevIcon,
      badge: user.role === 'admin' && pendingCount > 0 ? pendingCount : 0,
    },
    ...(user.role === 'admin' ? [{ href: '/admin', label: 'Admin', icon: AdminIcon }] : []),
  ];

  const unreadNotifCount = punchNotifications.filter(n => !n.read).length;

  const mobileNavItems = [
    { href: '/dashboard', label: 'Home', icon: DashboardIcon },
    { href: '/orders', label: 'Orders', icon: OrdersIcon },
    { href: '/tally-export', label: 'Tally Tax', icon: TaxIcon },
    {
      href: '/billing',
      secondaryHref: '/price-settings',
      label: 'Bill & Price',
      icon: BillingIcon,
      isCombined: true
    },
    { href: '/history', label: 'History', icon: HistoryIcon },
    {
      href: '/developer',
      label: 'Logs',
      icon: DevIcon,
      badge: user.role === 'admin' && pendingCount > 0 ? pendingCount : 0,
    },
    ...(user.role === 'admin' ? [{ href: '/admin', label: 'Admin', icon: AdminIcon }] : []),
  ];

  return (
    <>
      {/* ── DESKTOP TOP NAVBAR ── */}
      <nav className="navbar">
        {/* Brand */}
        <Link href="/dashboard" className="nav-brand">
          <span className="nav-brand-dot" />
          Print Mart
        </Link>

        {/* Desktop Nav Links */}
        <div className="nav-links">
          {desktopNavItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href)) ? 'active' : ''}`}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
            >
              {item.label}
              {item.badge != null && item.badge > 0 && (
                <span className="nav-badge-count">{item.badge}</span>
              )}
            </Link>
          ))}
        </div>

        {/* User + Notifications + Sign Out */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {user.role === 'admin' && (
            <div className="nav-notif-container" ref={notifRef} style={{ position: 'relative' }}>
              <button
                className={`nav-notif-bell-btn ${showNotifDropdown ? 'active' : ''}`}
                onClick={() => setShowNotifDropdown(!showNotifDropdown)}
                title="Punch Notifications"
                aria-label="Punch Notifications"
              >
                <BellIcon size={18} />
                {unreadNotifCount > 0 && (
                  <span className="nav-badge-count animate-pulse nav-notif-badge">
                    {unreadNotifCount > 99 ? '99+' : unreadNotifCount}
                  </span>
                )}
              </button>

              {showNotifDropdown && (
                <div className="nav-notif-dropdown">
                  <div className="nav-notif-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)' }}>Punch Notifications</span>
                      {unreadNotifCount > 0 && (
                        <span className="notif-badge-pill">{unreadNotifCount} new</span>
                      )}
                    </div>
                    {unreadNotifCount > 0 && (
                      <button
                        className="notif-mark-all-btn"
                        onClick={() => markAllNotificationsAsRead(punchNotifications)}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="nav-notif-divider" />

                  <div className="nav-notif-list">
                    {punchNotifications.length === 0 ? (
                      <div className="nav-notif-empty">
                        <span style={{ fontSize: '1.2rem' }}>🔔</span>
                        <span>No punch notifications yet</span>
                      </div>
                    ) : (
                      punchNotifications.map((n) => {
                        const isPunchIn = n.type === 'punch_in';
                        const timeStr = formatNotificationTime(n.timestamp);
                        return (
                          <div
                            key={n.id}
                            className={`nav-notif-item ${!n.read ? 'unread' : ''}`}
                            onClick={() => n.id && markNotificationAsRead(n.id)}
                          >
                            <div className="notif-item-avatar">
                              {n.userPhoto ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={n.userPhoto} alt={n.userName} />
                              ) : (
                                <span>{n.userName ? n.userName.charAt(0).toUpperCase() : 'U'}</span>
                              )}
                              <span className={`notif-status-dot ${isPunchIn ? 'in' : 'out'}`} />
                            </div>
                            <div className="notif-item-content">
                              <div className="notif-item-title">
                                <strong>{n.userName}</strong>
                                <span className={`notif-action-tag ${isPunchIn ? 'in' : 'out'}`}>
                                  {isPunchIn ? 'Punched In' : 'Punched Out'}
                                </span>
                              </div>
                              <div className="notif-item-sub">
                                {isPunchIn && n.workMode && (
                                  <span className="notif-mode-tag">{n.workMode}</span>
                                )}
                                <span className="notif-item-time">{timeStr}</span>
                              </div>
                            </div>
                            {!n.read && <div className="notif-unread-dot" />}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="nav-user-container" ref={dropdownRef}>
            <div
              className={`nav-user-chip ${showDropdown ? 'active' : ''}`}
              onClick={() => setShowDropdown(!showDropdown)}
            >
              <div className="nav-user-avatar">
                {user.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.photoURL} alt={user.displayName} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--sapphire-light)' }}>{initials}</span>
                )}
              </div>
              <div>
                <div className="nav-user-name">{user.displayName}</div>
                <div className="nav-user-role">{user.role}</div>
              </div>
            </div>

            {showDropdown && (
              <div className="nav-dropdown-menu">
                <div className="nav-dropdown-header">Settings</div>
                <div className="nav-dropdown-divider" />
                <div className="nav-dropdown-theme-section">
                  <div className="nav-dropdown-theme-title">Theme</div>
                  <div className="theme-toggle-group">
                    <button
                      className={`theme-toggle-btn ${theme === 'light' ? 'active' : ''}`}
                      onClick={() => handleThemeChange('light')}
                    >
                      <SunIcon />
                      <span>Light</span>
                    </button>
                    <button
                      className={`theme-toggle-btn ${theme === 'dark' ? 'active' : ''}`}
                      onClick={() => handleThemeChange('dark')}
                    >
                      <MoonIcon />
                      <span>Dark</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <button onClick={handleSignOut} className="nav-signout-btn">
            <SignOutIcon />
            <span>Sign Out</span>
          </button>
        </div>
      </nav>

      {/* ── MOBILE BOTTOM TAB BAR ── */}
      <div className="mobile-tab-bar">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isCombinedActive = item.isCombined && (pathname.startsWith('/billing') || pathname.startsWith('/price-settings'));
          const isActive = isCombinedActive || pathname === item.href || (!item.isCombined && item.href !== '/dashboard' && pathname.startsWith(item.href));
          
          // Target URL when tapping combined tab on mobile
          const targetHref = item.isCombined
            ? (pathname.startsWith('/billing') ? '/price-settings' : '/billing')
            : item.href;

          return (
            <Link
              key={item.label}
              href={targetHref}
              className={`mobile-tab-item ${isActive ? 'active' : ''}`}
            >
              <div className="mobile-tab-icon-wrap" style={{ position: 'relative' }}>
                <Icon size={20} />
                {item.badge != null && item.badge > 0 && (
                  <span
                    className="nav-badge-count"
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      fontSize: '0.55rem',
                      width: '14px',
                      height: '14px',
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="mobile-tab-label">{item.label}</span>
            </Link>
          );
        })}

        {/* Sign out tab */}
        <button
          onClick={handleSignOut}
          className="mobile-tab-item"
          style={{ border: 'none', cursor: 'pointer' }}
        >
          <div className="mobile-tab-icon-wrap">
            <SignOutIcon size={20} />
          </div>
          <span className="mobile-tab-label">Sign Out</span>
        </button>
      </div>
    </>
  );
}
