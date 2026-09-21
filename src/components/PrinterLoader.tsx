import React from 'react';

export interface PrinterLoaderProps {
  text?: string;
  fullscreen?: boolean;
  type?: 'liquid' | 'printer' | 'tshirt' | string;
}

export default function PrinterLoader({
  text = "Loading Print Mart...",
  fullscreen = false,
}: PrinterLoaderProps) {
  const content = (
    <div className="liquid-loader-container animate-fade-in">
      {/* Radiant Multi-Color Fluid Aura Bloom Behind Orb */}
      <div className="liquid-loader-aura" />

      {/* 3D Orbital Rings with Liquid Droplets */}
      <div className="liquid-orbit-system">
        <div className="liquid-orbit-ring ring-outer">
          <div className="liquid-orbit-dot dot-cyan" />
        </div>
        <div className="liquid-orbit-ring ring-inner">
          <div className="liquid-orbit-dot dot-purple" />
        </div>
      </div>

      {/* Central Apple Liquified Glass Orb with Wave Sloshing & Caustics */}
      <div className="glass-liquid-orb-wrap">
        <svg
          className="glass-liquid-orb-svg"
          viewBox="0 0 120 120"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Orb Inner Clip Path */}
            <clipPath id="liquid-orb-clip">
              <circle cx="60" cy="60" r="46" />
            </clipPath>

            {/* Front Wave Liquid Gradient */}
            <linearGradient id="liquid-grad-front" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#00F5D4" stopOpacity="0.95" />
              <stop offset="45%" stopColor="#3B82F6" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity="0.9" />
            </linearGradient>

            {/* Back Wave Liquid Gradient */}
            <linearGradient id="liquid-grad-back" x1="100%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#6366F1" stopOpacity="0.8" />
              <stop offset="50%" stopColor="#06B6D4" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.85" />
            </linearGradient>

            {/* Glass Rim Specular Gradient */}
            <linearGradient id="glass-rim-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.95)" />
              <stop offset="35%" stopColor="rgba(56, 189, 248, 0.7)" />
              <stop offset="70%" stopColor="rgba(168, 85, 247, 0.6)" />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0.45)" />
            </linearGradient>

            {/* Top Specular Arc Reflection */}
            <linearGradient id="specular-reflection" x1="50%" y1="0%" x2="50%" y2="100%">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.85)" />
              <stop offset="45%" stopColor="rgba(255, 255, 255, 0.2)" />
              <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
            </linearGradient>
          </defs>

          {/* Liquid Fluid Chamber (Clipped to Orb) */}
          <g clipPath="url(#liquid-orb-clip)">
            {/* Deep Under-Liquid Chamber Atmosphere */}
            <rect x="10" y="10" width="100" height="100" fill="#090E24" />

            {/* Back Harmonic Liquid Wave */}
            <path
              className="liquid-wave wave-back"
              fill="url(#liquid-grad-back)"
              d="M -120,58 Q -90,50 -60,58 T 0,58 Q 30,50 60,58 T 120,58 Q 150,50 180,58 T 240,58 L 240,120 L -120,120 Z"
            />

            {/* Front Harmonic Liquid Wave */}
            <path
              className="liquid-wave wave-front"
              fill="url(#liquid-grad-front)"
              d="M -120,62 Q -90,70 -60,62 T 0,62 Q 30,70 60,62 T 120,62 Q 150,70 180,62 T 240,62 L 240,120 L -120,120 Z"
            />

            {/* Rising Luminous Micro-Bubbles */}
            <circle className="bubble bubble-1" cx="48" cy="85" r="2.5" fill="rgba(255, 255, 255, 0.8)" />
            <circle className="bubble bubble-2" cx="68" cy="92" r="3.5" fill="rgba(255, 255, 255, 0.65)" />
            <circle className="bubble bubble-3" cx="55" cy="78" r="1.8" fill="rgba(255, 255, 255, 0.85)" />
            <circle className="bubble bubble-4" cx="74" cy="82" r="2.2" fill="rgba(255, 255, 255, 0.75)" />

            {/* Center Suspended Floating Holographic Monogram */}
            <g className="liquid-floating-core">
              <circle cx="60" cy="56" r="14" fill="rgba(255, 255, 255, 0.14)" stroke="rgba(255, 255, 255, 0.45)" strokeWidth="1.2" />
              <text x="60" y="60" fill="#ffffff" fontSize="9.5" fontWeight="800" textAnchor="middle" fontFamily="var(--font-display), sans-serif" letterSpacing="0.6px">PM</text>
            </g>

            {/* Inner Glass Edge Caustic Shadow */}
            <circle cx="60" cy="60" r="46" fill="none" stroke="rgba(0, 0, 0, 0.45)" strokeWidth="4" />
          </g>

          {/* Outer 3D Glass Shell Rim */}
          <circle cx="60" cy="60" r="46" fill="none" stroke="url(#glass-rim-grad)" strokeWidth="2.5" />

          {/* Top Gloss Specular Lens Arc */}
          <ellipse cx="60" cy="30" rx="30" ry="14" fill="url(#specular-reflection)" />

          {/* Glass Lens Edge Highlight */}
          <ellipse cx="60" cy="60" rx="43" ry="43" fill="none" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" />
        </svg>
      </div>

      {/* Fluid Glass Shimmer Progress Track */}
      <div className="liquid-progress-bar">
        <div className="liquid-progress-glow" />
      </div>

      {/* Shimmer Typography */}
      <div className="liquid-loader-text-wrap">
        <span className="liquid-loader-text">{text}</span>
      </div>

      {/* Animated CMYK Liquid Beads with Mercury Surface Tension */}
      <div className="cmyk-liquid-beads">
        <span className="cmyk-bead bead-cyan" title="Cyan" />
        <span className="cmyk-bead bead-magenta" title="Magenta" />
        <span className="cmyk-bead bead-yellow" title="Yellow" />
        <span className="cmyk-bead bead-key" title="Key" />
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="liquid-loader-fullscreen-bg">
        {/* Ambient Morphing Background Blobs */}
        <div className="liquid-blob-loader-1" />
        <div className="liquid-blob-loader-2" />

        {/* Floating Glass Island Card */}
        <div className="liquid-glass-loader-card">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="liquid-loader-inline-wrap">
      <div className="liquid-glass-loader-card">
        {content}
      </div>
    </div>
  );
}

export const LiquidGlassLoader = PrinterLoader;
