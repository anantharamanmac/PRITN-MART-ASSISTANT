"use client";

import { useEffect, useState } from 'react';

interface WelcomeModalProps {
  displayName: string;
  photoURL?: string;
}

// Toggle this to false to activate the once-a-day popup restriction
const ALWAYS_SHOW_FOR_TESTING = false;

const GREETING_MESSAGES = [
  "Let's build something awesome today!",
  "Make today your masterpiece.",
  "Your dedication makes Print Mart great.",
  "Let's smash those goals today!",
  "Ready to print some success?"
];

export default function WelcomeModal({ displayName, photoURL }: WelcomeModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Calculate greeting and motivational message synchronously as initial state values
  const [greeting] = useState(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return "Good morning";
    if (hour >= 12 && hour < 17) return "Good afternoon";
    if (hour >= 17 && hour < 21) return "Good evening";
    return "Welcome back";
  });

  const [motivationalMessage] = useState(() => {
    return GREETING_MESSAGES[Math.floor(Math.random() * GREETING_MESSAGES.length)];
  });

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
    }, 300);
  };

  useEffect(() => {
    // Check if the modal should be shown
    const today = new Date().toDateString();
    const lastShown = localStorage.getItem('last_welcome_popup_date');

    let autoCloseTimer: NodeJS.Timeout;
    let actualCloseTimer: NodeJS.Timeout;

    if (ALWAYS_SHOW_FOR_TESTING || lastShown !== today) {
      setTimeout(() => {
        setIsOpen(true);
      }, 0);
      
      if (!ALWAYS_SHOW_FOR_TESTING) {
        localStorage.setItem('last_welcome_popup_date', today);
      }

      // Automatically close the popup after 20 seconds with closing animation
      autoCloseTimer = setTimeout(() => {
        setIsClosing(true);
        actualCloseTimer = setTimeout(() => {
          setIsOpen(false);
          setIsClosing(false);
        }, 300);
      }, 20000);
    }

    return () => {
      if (autoCloseTimer) clearTimeout(autoCloseTimer);
      if (actualCloseTimer) clearTimeout(actualCloseTimer);
    };
  }, []);

  if (!isOpen) return null;

  // Generate a fallback avatar if photoURL is not provided or fails to load
  const initials = displayName
    ? displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : "PM";

  return (
    <div className={`welcome-modal-overlay ${isClosing ? 'closing' : ''}`}>
      <div className={`welcome-modal-card ${isClosing ? 'closing' : ''}`}>
        {/* Futuristic Background Elements */}
        <div className="welcome-modal-grid-pattern" />
        <div className="welcome-modal-orb welcome-modal-orb-1" />
        <div className="welcome-modal-orb welcome-modal-orb-2" />
        
        {/* Glowing Ambient Top Line */}
        <div className="welcome-modal-accent" />

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="welcome-modal-close"
          aria-label="Close welcome message"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {/* Tech Active Session Badge */}
        <div className="welcome-modal-system-tag">
          <span className="welcome-modal-pulse-dot" />
          PORTAL ONLINE // ACTIVE_SESSION
        </div>

        {/* Avatar Section with Dual Outer Rings and Tech Aesthetics */}
        <div className="welcome-modal-avatar-wrapper">
          <div className="welcome-modal-tech-ring-outer" />
          <div className="welcome-modal-tech-ring-inner" />
          
          <div className="welcome-modal-avatar-inner">
            {photoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoURL}
                alt={displayName}
                className="welcome-modal-img"
                onError={(e) => {
                  // If image fails to load, replace with initials
                  (e.target as HTMLElement).style.display = 'none';
                  const fallback = document.getElementById('welcome-avatar-fallback');
                  if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              id="welcome-avatar-fallback"
              className="welcome-modal-fallback"
              style={{ display: photoURL ? 'none' : 'flex' }}
            >
              {initials}
            </div>
          </div>
        </div>

        {/* Heading */}
        <h3 className="welcome-modal-title">
          {greeting},<br />
          <span className="text-gradient font-extrabold welcome-modal-user-name">{displayName}</span>
          <span className="welcome-modal-wave">👋</span>
        </h3>

        {/* Motivational message styled as a quote */}
        <div className="welcome-modal-quote-container">
          <span className="welcome-modal-quote-mark">&ldquo;</span>
          <p className="welcome-modal-subtitle">
            {motivationalMessage}
          </p>
          <span className="welcome-modal-quote-mark">&rdquo;</span>
        </div>

        {/* Date Display Badge */}
        <div className="welcome-modal-date-badge">
          <div className="welcome-modal-date-icon">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <span>
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
          </span>
        </div>

        {/* Modern Call to Action Button */}
        <button
          onClick={handleClose}
          className="welcome-modal-btn"
        >
          <span className="welcome-modal-btn-glow" />
          <span className="welcome-modal-btn-content">
            Enter Workspace
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="welcome-modal-btn-arrow">
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </span>
        </button>
      </div>
    </div>
  );
}
