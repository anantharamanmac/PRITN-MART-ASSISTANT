"use client";

import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  const handleGoBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <main className="notfound-wrapper">
      {/* Background Ambient Glows */}
      <div className="absolute top-1/4 left-1/3 -translate-x-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-[140px] pointer-events-none animate-pulse" style={{ animationDuration: "5s" }} />
      <div className="absolute bottom-1/4 right-1/3 translate-x-1/2 w-96 h-96 bg-pink-600/10 rounded-full blur-[140px] pointer-events-none animate-pulse" style={{ animationDuration: "7s" }} />

      <div className="glass-card notfound-card animate-fade-in p-8 sm:p-12 border-white/10 shadow-[0_15px_45px_rgba(0,0,0,0.5)]">
        
        {/* Glow Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-transparent via-pink-500 to-transparent" />

        {/* Screen Printing Canvas Mockup */}
        <div className="notfound-canvas">
          {/* Designer Grid */}
          <div className="notfound-grid-bg" />

          {/* Squeegee Laser Scan Line */}
          <div className="notfound-laser" />

          {/* Registration Warning Tag */}
          <div className="notfound-ink-alarm">
            <span className="notfound-alarm-dot" />
            <span className="notfound-alarm-text">REGISTRATION ERROR</span>
          </div>

          {/* Registration Targets in Corners */}
          <div className="notfound-registration-mark notfound-reg-tl">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="8" />
              <line x1="12" y1="2" x2="12" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
          </div>
          <div className="notfound-registration-mark notfound-reg-tr">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="8" />
              <line x1="12" y1="2" x2="12" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
          </div>
          <div className="notfound-registration-mark notfound-reg-bl">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="8" />
              <line x1="12" y1="2" x2="12" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
          </div>
          <div className="notfound-registration-mark notfound-reg-br">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="8" />
              <line x1="12" y1="2" x2="12" y2="22" />
              <line x1="2" y1="12" x2="22" y2="12" />
            </svg>
          </div>

          {/* Blueprint Measurement Markers */}
          <span className="notfound-canvas-tag notfound-tag-top">W: 100mm</span>
          <span className="notfound-canvas-tag notfound-tag-bottom">CALIBRATION OFFSET: X +4.2mm</span>
          <span className="notfound-canvas-tag notfound-tag-left">H: 120mm</span>
          <span className="notfound-canvas-tag notfound-tag-right">OFFSET: Y -2.8mm</span>

          {/* T-Shirt Alignment Outline */}
          <div className="notfound-tshirt-container">
            <svg className="notfound-tshirt-svg" viewBox="0 0 100 100" width="100%" height="100%">
              {/* Outer template cut bounds */}
              <path className="notfound-tshirt-outline" d="M 35,10 C 45,18 55,18 65,10 L 78,10 L 92,24 L 84,32 L 76,26 L 76,85 L 24,85 L 24,26 L 16,32 L 8,24 L 22,10 Z" />
              
              {/* Cyan RGB Screen Channel Offset */}
              <path className="notfound-offset-cyan" d="M 35,10 C 45,18 55,18 65,10 L 78,10 L 92,24 L 84,32 L 76,26 L 76,85 L 24,85 L 24,26 L 16,32 L 8,24 L 22,10 Z" />
              
              {/* Magenta RGB Screen Channel Offset */}
              <path className="notfound-offset-magenta" d="M 35,10 C 45,18 55,18 65,10 L 78,10 L 92,24 L 84,32 L 76,26 L 76,85 L 24,85 L 24,26 L 16,32 L 8,24 L 22,10 Z" />

              {/* Solid Base Shirt */}
              <path className="notfound-offset-primary" d="M 35,10 C 45,18 55,18 65,10 L 78,10 L 92,24 L 84,32 L 76,26 L 76,85 L 24,85 L 24,26 L 16,32 L 8,24 L 22,10 Z" />

              {/* Offset "404" print designs */}
              <text x="50" y="54" className="notfound-shirt-text notfound-text-cyan" textAnchor="middle">404</text>
              <text x="50" y="54" className="notfound-shirt-text notfound-text-magenta" textAnchor="middle">404</text>
              <text x="50" y="54" className="notfound-shirt-text notfound-text-white" textAnchor="middle">404</text>
            </svg>
          </div>
        </div>

        {/* Error Info */}
        <h1 className="title !text-3xl sm:!text-4xl mb-4 font-display">
          <span className="text-gradient">404: Pattern Not Found</span>
        </h1>
        
        <p className="text-sm text-secondary leading-relaxed mb-10 max-w-md mx-auto">
          This fabric design does not exist in our library. The pattern was either cleared from the screen-printing queue, or the layout coordinate registration was misaligned.
        </p>

        {/* Action Controls */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <button
            id="notfound-home-btn"
            onClick={() => router.push("/")}
            className="btn btn-primary w-full sm:w-auto"
            style={{ minWidth: "180px" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-1.5 inline align-middle">
              <rect x="3" y="3" width="7" height="9" />
              <rect x="14" y="3" width="7" height="5" />
              <rect x="14" y="12" width="7" height="9" />
              <rect x="3" y="16" width="7" height="5" />
            </svg>
            Workspace
          </button>
          
          <button
            id="notfound-back-btn"
            onClick={handleGoBack}
            className="btn btn-outline w-full sm:w-auto"
            style={{ minWidth: "180px" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="mr-1.5 inline align-middle">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Go Back
          </button>
        </div>

      </div>
    </main>
  );
}
