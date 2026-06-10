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
    if (salaryStartDay !== undefined) return;

    const isDismissed = sessionStorage.getItem('salary_picker_notify_dismissed') === 'true';
    if (!isDismissed) {
      const timer = setTimeout(() => setIsOpen(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [salaryStartDay]);

  const handleClose = () => {
    setIsClosing(true);
    sessionStorage.setItem('salary_picker_notify_dismissed', 'true');
    setTimeout(() => { setIsOpen(false); setIsClosing(false); }, 300);
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
      <div
        className={`welcome-modal-card ${isClosing ? 'closing' : ''}`}
        style={{ maxWidth: '460px' }}
      >
        {/* Decorative elements */}
        <div className="welcome-modal-grid-pattern" />
        <div className="welcome-modal-orb welcome-modal-orb-1" />
        <div className="welcome-modal-orb welcome-modal-orb-2" />
        <div className="welcome-modal-accent" />

        {/* Close Button */}
        <button onClick={handleClose} className="welcome-modal-close" aria-label="Close notification">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Badge */}
        <div className="welcome-modal-system-tag">
          <span className="welcome-modal-pulse-dot" />
          New Feature Available
        </div>

        {/* Icon */}
        <div className="welcome-modal-avatar-wrapper" style={{ margin: '1.25rem auto 1rem auto' }}>
          <div className="welcome-modal-tech-ring-outer" />
          <div className="welcome-modal-tech-ring-inner" />
          <div className="welcome-modal-avatar-inner" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, var(--navy), var(--navy-light))',
          }}>
            <img
              src="/waving_character.png"
              alt="Feature mascot"
              className="welcome-modal-img"
              style={{ width: '85%', height: '85%', objectFit: 'contain', animation: 'welcomeFloat 4s ease-in-out infinite' }}
            />
          </div>
        </div>

        {/* Heading */}
        <h3 className="welcome-modal-title" style={{ fontSize: '1.5rem', marginBottom: '0.6rem' }}>
          Custom Salary Day<br />
          <span className="text-gradient welcome-modal-user-name">Picker Available</span>
        </h3>

        {/* Description */}
        <div className="welcome-modal-quote-container" style={{ margin: '0.6rem 0 1.5rem 0', padding: '0.75rem 1rem' }}>
          <p className="welcome-modal-subtitle" style={{ fontStyle: 'normal', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
            Customize your monthly salary cycle start date to align attendance history, overtime pay calculations, and payroll sheets with your personal billing cycle.
          </p>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', width: '100%' }}>
          <button onClick={handleGoToSettings} className="welcome-modal-btn" style={{ width: '100%', margin: 0 }}>
            <span className="welcome-modal-btn-glow" />
            <span className="welcome-modal-btn-content">
              Configure Salary Date
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="welcome-modal-btn-arrow">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </span>
          </button>

          <button onClick={handleClose} className="btn btn-outline" style={{ width: '100%' }}>
            Remind me later
          </button>
        </div>
      </div>
    </div>
  );
}
