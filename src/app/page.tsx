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
      <main style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'var(--bg-color)',
        padding: '1.5rem',
      }}>
        <div className="glass-card animate-scale-up" style={{
          maxWidth: '400px',
          width: '100%',
          textAlign: 'center',
          border: '1px solid rgba(201, 162, 39, 0.2)',
          boxShadow: '0 0 40px rgba(201, 162, 39, 0.08)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Gold accent top bar */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            height: '3px',
            background: 'linear-gradient(90deg, transparent, var(--gold), var(--gold-light), var(--gold), transparent)',
          }} />

          {/* Close Button */}
          <button
            onClick={dismissModal}
            aria-label="Close"
            style={{
              position: 'absolute', top: '1rem', right: '1rem',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '50%',
              color: 'var(--text-secondary)',
              width: '30px', height: '30px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', transition: 'all 0.2s ease',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* T-shirt animation */}
          <div className="tshirt-print-container">
            <div className="tshirt-wrapper">
              <svg className="tshirt-silhouette" viewBox="0 0 100 100" width="80" height="80">
                <path d="M 35,10 C 45,18 55,18 65,10 L 78,10 L 92,24 L 84,32 L 76,26 L 76,85 L 24,85 L 24,26 L 16,32 L 8,24 L 22,10 Z"
                  fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
              </svg>
              <div className="tshirt-ink-reveal">
                <svg viewBox="0 0 100 100" width="80" height="80">
                  <path d="M 35,10 C 45,18 55,18 65,10 L 78,10 L 92,24 L 84,32 L 76,26 L 76,85 L 24,85 L 24,26 L 16,32 L 8,24 L 22,10 Z"
                    fill="rgba(79,134,232,0.06)" stroke="var(--sapphire)" strokeWidth="2" />
                  <circle cx="50" cy="48" r="9" fill="none" stroke="var(--sapphire-light)" strokeWidth="1.5" />
                  <text x="50" y="51" fill="var(--sapphire-light)" fontSize="8" fontWeight="bold" textAnchor="middle" fontFamily="sans-serif">PM</text>
                </svg>
              </div>
              <div className="tshirt-squeegee" />
            </div>
          </div>

          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'rgba(79, 134, 232, 0.08)',
            border: '1px solid rgba(79, 134, 232, 0.2)',
            borderRadius: '999px',
            padding: '4px 12px',
            fontSize: '10px', fontWeight: 600,
            color: 'var(--sapphire-light)',
            letterSpacing: '0.04em',
            marginBottom: '1rem',
          }}>
            <span style={{
              width: '5px', height: '5px', borderRadius: '50%',
              background: 'var(--sapphire-light)',
              display: 'inline-block',
              animation: 'welcomePulseDot 1.6s infinite',
            }} />
            ACTIVE DEVELOPMENT
          </div>

          <h3 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.2rem',
            fontWeight: 700,
            color: 'var(--text-primary)',
            marginBottom: '0.6rem',
          }}>System Under Development</h3>

          <p style={{
            fontSize: '0.82rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            marginBottom: '1.5rem',
          }}>
            Print Mart Assistant is in active development. Shift calibration, live reporting panels, and automated databases are being finalized.
          </p>

          <button onClick={dismissModal} className="btn btn-primary w-full" style={{ color: '#0d1220' }}>
            Continue to Site
          </button>
        </div>
      </main>
    );
  }

  return (
    <main style={{
      display: 'flex',
      minHeight: '100vh',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background ambient lights */}
      <div style={{
        position: 'absolute', top: '20%', left: '50%',
        transform: 'translate(-60%, -50%)',
        width: '600px', height: '600px',
        background: 'radial-gradient(circle, rgba(27, 42, 74, 0.5) 0%, transparent 60%)',
        filter: 'blur(60px)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      <div style={{
        position: 'absolute', bottom: '15%', right: '10%',
        width: '400px', height: '400px',
        background: 'radial-gradient(circle, rgba(79, 134, 232, 0.07) 0%, transparent 60%)',
        filter: 'blur(80px)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <div
        className="glass-card animate-fade-in"
        style={{
          maxWidth: '420px',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '2.5rem 2rem',
          border: '1px solid rgba(79, 134, 232, 0.12)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6), 0 0 40px rgba(79,134,232,0.05)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Sapphire accent top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: '2.5px',
          background: 'linear-gradient(90deg, transparent, var(--sapphire), var(--sapphire-light), var(--sapphire), transparent)',
          borderRadius: '28px 28px 0 0',
        }} />

        {/* Brand badge */}
        <div style={{
          width: '56px', height: '56px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)',
          border: '1px solid rgba(79, 134, 232, 0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '1.5rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.3), 0 0 15px rgba(79,134,232,0.1)',
          flexShrink: 0,
        }}>
          <span style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800, color: 'var(--sapphire-light)',
            fontSize: '1.1rem', letterSpacing: '-0.02em',
          }}>PM</span>
        </div>

        {/* Brand name */}
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.75rem',
          fontWeight: 800,
          letterSpacing: '-0.03em',
          marginBottom: '0.4rem',
          lineHeight: 1.15,
        }}>
          <span className="text-gradient">Print Mart</span>{' '}
          <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Portal</span>
        </h1>

        {/* Status pill */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '4px 14px',
          background: 'rgba(79, 134, 232, 0.08)',
          border: '1px solid rgba(79, 134, 232, 0.2)',
          borderRadius: '999px',
          fontSize: '10px', fontWeight: 700,
          color: 'var(--sapphire-light)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase' as const,
          marginBottom: '1.75rem',
          marginTop: '0.5rem',
        }}>
          <span style={{
            width: '5px', height: '5px',
            borderRadius: '50%',
            background: 'var(--success)',
            boxShadow: '0 0 6px var(--success)',
            display: 'inline-block',
            animation: 'welcomePulseDot 1.8s infinite',
            flexShrink: 0,
          }} />
          Shift Check-in Portal
        </div>

        <p style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          lineHeight: 1.65,
          marginBottom: '2rem',
          maxWidth: '300px',
        }}>
          Sign in with your verified Print Mart Google Workspace account to clock shift hours and log work tasks.
        </p>

        {/* Google Sign-in Button */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
          <button onClick={handleLogin} className="stylish-google-btn">
            <div className="stylish-google-btn-logo-container">
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            </div>
            <span className="stylish-google-btn-text">Sign in with Google</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="stylish-google-btn-chevron">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Footer note */}
        <div style={{
          marginTop: '2rem',
          paddingTop: '1.25rem',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
          alignItems: 'center',
        }}>
          <span style={{
            fontSize: '10px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase' as const,
            letterSpacing: '0.1em',
            fontWeight: 600,
          }}>
            Authorized Personnel Only
          </span>
          <p style={{
            fontSize: '10px',
            color: 'rgba(85, 96, 112, 0.7)',
            lineHeight: 1.6,
            maxWidth: '260px',
          }}>
            Accounts require administrative verification upon first login. Contact your manager for assistance.
          </p>
        </div>
      </div>
    </main>
  );
}
