"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { signInWithGoogle, listenToAuthChanges } from '@/lib/auth';
import PrinterLoader from '@/components/PrinterLoader';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [showDevModal, setShowDevModal] = useState(false);

  useEffect(() => {
    const unsubscribe = listenToAuthChanges((firebaseUser, appUser) => {
      if (appUser) {
        if (appUser.role === 'admin') router.push('/admin');
        else if (appUser.role === 'worker') router.push('/dashboard');
        else router.push('/pending');
      } else {
        setLoading(false);
        // Only trigger popup if user is logged out on the landing page
        const isDismissed = sessionStorage.getItem('dev_modal_dismissed');
        if (!isDismissed) {
          setShowDevModal(true);
        }
      }
    });
    return () => unsubscribe();
  }, [router]);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
      // Auth listener will handle redirect
    } catch (error) {
      console.error("Login failed", error);
      toast.error("Failed to login. Please try again.");
    }
  };

  const dismissModal = () => {
    sessionStorage.setItem('dev_modal_dismissed', 'true');
    setShowDevModal(false);
  };

  if (loading) {
    return <PrinterLoader text="Securing connection..." fullscreen />;
  }

  if (showDevModal) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-[#0a0a0f] p-4 text-center">
        <div className="glass-card max-w-md w-full border-warning-glow shadow-warning-glow p-6 relative overflow-hidden animate-scale-up">
          {/* Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[var(--warning)] via-yellow-400 to-[var(--warning)]" />

          {/* Close Mark (X) */}
          <button
            onClick={dismissModal}
            className="absolute top-3 right-3 text-secondary hover:text-white transition-colors duration-200 p-1"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>

          {/* Screen Printing T-shirt Animation */}
          <div className="tshirt-print-container">
            <div className="tshirt-wrapper">
              {/* Silhouette T-shirt outline */}
              <svg className="tshirt-silhouette" viewBox="0 0 100 100" width="80" height="80">
                <path d="M 35,10 C 45,18 55,18 65,10 L 78,10 L 92,24 L 84,32 L 76,26 L 76,85 L 24,85 L 24,26 L 16,32 L 8,24 L 22,10 Z" fill="rgba(255, 255, 255, 0.03)" stroke="rgba(255, 255, 255, 0.12)" strokeWidth="2" />
              </svg>

              {/* Reveal T-shirt with Print Mart logo */}
              <div className="tshirt-ink-reveal">
                <svg viewBox="0 0 100 100" width="80" height="80">
                  <path d="M 35,10 C 45,18 55,18 65,10 L 78,10 L 92,24 L 84,32 L 76,26 L 76,85 L 24,85 L 24,26 L 16,32 L 8,24 L 22,10 Z" fill="rgba(99, 102, 241, 0.1)" stroke="var(--primary)" strokeWidth="2" />
                  {/* Glowing Printed Circle + PM Logo Text */}
                  <circle cx="50" cy="48" r="9" fill="none" stroke="var(--secondary)" strokeWidth="2" />
                  <text x="50" y="51" fill="var(--secondary)" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">PM</text>
                </svg>
              </div>

              {/* Screen Squeegee Bar */}
              <div className="tshirt-squeegee"></div>
            </div>
          </div>

          <h3 className="text-xl font-bold text-white mb-2 tracking-wide font-display">System Under Development</h3>
          <p className="text-xs text-secondary mb-6 leading-relaxed">
            Print Mart Assistant is currently in active development. Calibration of shifts, live reporting panels, and automated databases is ongoing.
          </p>

          <button
            onClick={dismissModal}
            className="btn w-full bg-gradient-to-r from-[var(--warning)] to-yellow-500 hover:from-amber-600 hover:to-yellow-600 border-none text-black font-bold tracking-wide shadow-[0_4px_15px_rgba(245,158,11,0.25)] transition-all duration-300"
          >
            Continue to Site
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4 relative overflow-hidden">
      {/* Background Ambient Glows */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '4s' }} />
      <div className="absolute bottom-1/3 left-1/2 -translate-x-1/2 translate-y-1/2 w-80 h-80 bg-pink-600/10 rounded-full blur-[120px] pointer-events-none animate-pulse" style={{ animationDuration: '6s' }} />

      <div className="glass-card max-w-md w-full animate-fade-in flex flex-col items-center text-center p-8 sm:p-10 relative overflow-hidden border-white/10 shadow-[0_15px_35px_rgba(0,0,0,0.4)]">
        
        {/* Glow Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-transparent via-indigo-500 to-transparent" />

        {/* Brand Icon Badge */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-500 via-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-6">
          <span className="font-extrabold text-white text-xl tracking-tighter">PM</span>
        </div>

        {/* Brand Name */}
        <h1 className="title !text-3xl mb-1 font-display tracking-tight">
          <span className="text-gradient">Print Mart</span> Portal
        </h1>

        {/* Active Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 text-[10px] font-bold tracking-wider uppercase mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Shift Check-in Portal
        </div>

        <p className="text-sm text-secondary leading-relaxed mb-8 max-w-xs">
          Sign in with your verified Print Mart Google Workspace account to clock shift hours and log work logs.
        </p>

        {/* Premium Google Sign-in Button */}
        <div className="w-full flex justify-center">
          <button 
            onClick={handleLogin} 
            className="stylish-google-btn"
          >
            {/* Left circular white background badge for Google Logo */}
            <div className="stylish-google-btn-logo-container">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            </div>
            {/* Label aligned on the right */}
            <span className="stylish-google-btn-text">
              Sign in with Google
            </span>
            {/* Arrow indicator on the far right */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="stylish-google-btn-chevron">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Footer verification note */}
        <div className="mt-8 border-t border-white/5 pt-6 w-full text-center flex flex-col gap-2">
          <span className="text-[10px] text-secondary/70 uppercase tracking-wider font-semibold">Authorized Personnel Only</span>
          <p className="text-[10px] text-secondary/50 leading-relaxed max-w-xs mx-auto">
            Accounts await administrative verification upon first login. For assistance, contact your manager.
          </p>
        </div>

      </div>
    </main>
  );
}
