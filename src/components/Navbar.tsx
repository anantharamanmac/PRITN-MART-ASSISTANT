"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOutUser, AppUser } from '@/lib/auth';

export default function Navbar({ user }: { user: AppUser }) {
  const pathname = usePathname();

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
