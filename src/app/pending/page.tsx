"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listenToAuthChanges, signOutUser, AppUser } from '@/lib/auth';

export default function PendingPage() {
  const router = useRouter();
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    const unsubscribe = listenToAuthChanges((firebaseUser, appUser) => {
      if (!appUser) {
        router.push('/');
      } else if (appUser.role === 'admin') {
        router.push('/admin');
      } else if (appUser.role === 'worker') {
        router.push('/dashboard');
      } else {
        setUser(appUser);
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleSignOut = async () => {
    await signOutUser();
    router.push('/');
  };

  if (!user) return null;

  return (
    <main className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="glass-card max-w-md w-full text-center">
        <div className="mb-6">
          <span className="badge badge-pending">Account Pending</span>
        </div>
        <h2 className="title !text-3xl mb-4">Awaiting Approval</h2>
        <p className="text-secondary mb-8">
          Hi {user.displayName}, your account has been created but needs admin approval before you can start tracking attendance. Please contact your administrator.
        </p>
        <button onClick={handleSignOut} className="btn btn-outline w-full">
          Sign Out
        </button>
      </div>
    </main>
  );
}
