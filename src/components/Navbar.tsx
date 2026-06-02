"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOutUser, AppUser } from '@/lib/auth';
import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function Navbar({ user }: { user: AppUser }) {
  const pathname = usePathname();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    if (user.role !== 'admin') return;

    // Capture the time when the administrator logged in/loaded the navbar
    const sessionStartTime = Date.now();

    const colRef = collection(db, 'feedback');
    const q = query(colRef, where('status', '==', 'pending'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingCount(snapshot.size);

      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const fb = change.doc.data();
          
          // Avoid triggering self-notifications for reports filed by the admin
          if (fb.userId === user.uid) return;

          // Only alert on bugs (suggestions don't get toaster alerts)
          if (fb.type !== 'bug') return;

          // Compute created timestamp, fallback to Date.now() for optimistic local updates
          const createdAtMs = fb.createdAt?.toMillis 
            ? fb.createdAt.toMillis() 
            : Date.now();

          // Only display notifications for reports filed during the active session
          if (createdAtMs > sessionStartTime) {
            toast((t) => (
              <div className="flex flex-col gap-1 text-left">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span className="animate-pulse text-red-500">🚨</span> New Bug Reported!
                </div>
                <div className="text-xs text-secondary">
                  <strong>{fb.userName}</strong>: {fb.title}
                </div>
              </div>
            ), {
              duration: 6000,
              icon: '🐛',
              style: {
                background: '#1e1e2d',
                color: '#fff',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                boxShadow: '0 4px 20px rgba(239, 68, 68, 0.25)',
              }
            });
          }
        }
      });
    });

    return () => unsubscribe();
  }, [user]);

  const handleSignOut = async () => {
    await signOutUser();
    // Redirect handled by auth listener in pages
  };

  return (
    <nav className="navbar">
      <div className="nav-brand">Print Mart</div>
      <div className="nav-links">
        <Link href="/dashboard" className={`nav-link ${pathname === '/dashboard' ? 'active' : ''}`}>Dashboard</Link>
        <Link href="/history" className={`nav-link ${pathname === '/history' ? 'active' : ''}`}>History</Link>
        <Link 
          href="/developer" 
          className={`nav-link ${pathname === '/developer' ? 'active' : ''}`}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
        >
          Dev Logs
          {user.role === 'admin' && pendingCount > 0 && (
            <span className="nav-badge-count">{pendingCount}</span>
          )}
        </Link>
        {user.role === 'admin' && (
          <Link href="/admin" className={`nav-link ${pathname === '/admin' ? 'active' : ''}`}>Admin</Link>
        )}
        <div className="flex items-center gap-4 ml-4">
          <div className="text-sm">
            <div className="font-semibold">{user.displayName}</div>
            <div className="text-xs text-secondary capitalize">{user.role}</div>
          </div>
          <button onClick={handleSignOut} className="btn btn-outline" style={{ padding: '0.4rem 1rem', fontSize: '0.9rem' }}>
            Sign Out
          </button>
        </div>
      </div>
    </nav>
  );
}
