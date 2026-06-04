"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface SalaryNotificationModalProps {
  salaryStartDay?: number;
}

export default function SalaryNotificationModal({ salaryStartDay }: SalaryNotificationModalProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // If user already configured their salary date, don't show the modal
    if (salaryStartDay !== undefined) {
      return;
    }

    // Check if dismissed in this session
    const isDismissed = sessionStorage.getItem('salary_picker_notify_dismissed') === 'true';
    if (!isDismissed) {
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1000); // Small delay for better UX after page load
      return () => clearTimeout(timer);
    }
  }, [salaryStartDay]);

  const handleClose = () => {
    setIsClosing(true);
    sessionStorage.setItem('salary_picker_notify_dismissed', 'true');
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 300);
  };

  const handleGoToSettings = () => {
    setIsClosing(true);
    sessionStorage.setItem('salary_picker_notify_dismissed', 'true');
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      router.push('/salary-settings');
    }, 300);
  };

  if (!isOpen) return null;

  return (
    <div className={`welcome-modal-overlay ${isClosing ? 'closing' : ''}`} style={{ zIndex: 10000 }}>
      <div className={`welcome-modal-card ${isClosing ? 'closing' : ''}`} style={{ maxWidth: '480px' }}>
        {/* Decorative elements */}
        <div className="welcome-modal-grid-pattern" />
        <div className="welcome-modal-orb welcome-modal-orb-1" style={{ background: 'radial-gradient(circle, rgba(167, 139, 250, 0.25) 0%, transparent 70%)' }} />
        <div className="welcome-modal-orb welcome-modal-orb-2" style={{ background: 'radial-gradient(circle, rgba(244, 114, 182, 0.2) 0%, transparent 70%)' }} />
        <div className="welcome-modal-accent" style={{ background: 'linear-gradient(90deg, #818cf8, #f472b6)' }} />

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="welcome-modal-close"
          aria-label="Close notification"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {/* Tag */}
        <div className="welcome-modal-system-tag" style={{ color: '#a78bfa' }}>
          <span className="welcome-modal-pulse-dot" style={{ backgroundColor: '#a78bfa', boxShadow: '0 0 8px #a78bfa' }} />
          SYSTEM UPDATE // NEW_FEATURE_AVAILABLE
        </div>

        {/* Icon / Mascot */}
        <div className="welcome-modal-avatar-wrapper" style={{ margin: '1.5rem auto 1rem auto' }}>
          <div className="welcome-modal-tech-ring-outer" style={{ borderColor: 'rgba(167, 139, 250, 0.25)' }} />
          <div className="welcome-modal-tech-ring-inner" style={{ borderColor: 'rgba(244, 114, 182, 0.3)' }} />
          
          <div className="welcome-modal-avatar-inner" style={{ background: 'rgba(129, 140, 248, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <img 
              src="/waving_character.png" 
              alt="Waving Mascot" 
              className="welcome-modal-img" 
              style={{ width: '85%', height: '85%', objectFit: 'contain', animation: 'welcomeFloat 4s ease-in-out infinite' }}
            />
          </div>
        </div>

        {/* Header */}
        <h3 className="welcome-modal-title" style={{ fontSize: '1.65rem', marginBottom: '0.75rem' }}>
          Custom Salary Day<br />
          <span className="text-gradient font-extrabold welcome-modal-user-name" style={{ backgroundImage: 'linear-gradient(to right, #a78bfa, #f472b6)' }}>Picker Available</span>
        </h3>

        {/* Description */}
        <div className="welcome-modal-quote-container" style={{ margin: '0.75rem 0 1.5rem 0', padding: '0.75rem 1rem' }}>
          <p className="welcome-modal-subtitle" style={{ fontSize: '0.9rem', color: '#cbd5e1', fontStyle: 'normal', lineHeight: '1.5' }}>
            You can now customize the start date of your monthly salary cycle. Configure your starting day to align attendance history, overtime pay calculations, and payroll sheets with your personal billing cycle.
          </p>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
          <button
            onClick={handleGoToSettings}
            className="welcome-modal-btn"
            style={{ width: '100%', margin: 0 }}
          >
            <span className="welcome-modal-btn-glow" style={{ background: 'linear-gradient(90deg, #a78bfa, #f472b6)' }} />
            <span className="welcome-modal-btn-content" style={{ justifyContent: 'center' }}>
              ⚙️ Configure Salary Date
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="welcome-modal-btn-arrow">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
              </svg>
            </span>
          </button>

          <button
            onClick={handleClose}
            className="btn btn-outline"
            style={{ width: '100%', padding: '0.75rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: '0.9rem', fontWeight: 600, transition: 'all 0.2s' }}
            onMouseOver={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#f1f5f9'; }}
            onMouseOut={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#94a3b8'; }}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
