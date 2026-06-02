import React from 'react';

interface PrinterLoaderProps {
  text?: string;
  fullscreen?: boolean;
  type?: 'printer' | 'tshirt';
}

export default function PrinterLoader({
  text = "Loading Print Mart...",
  fullscreen = false,
  type = 'printer'
}: PrinterLoaderProps) {
  const content = (
    <div className="printer-container animate-fade-in">
      {type === 'tshirt' ? (
        <div className="tshirt-print-container !mb-4">
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
      ) : (
        <>
          <div className="printer-wrapper">
            <div className="printer-machine">
              <div className="printer-laser"></div>
            </div>
            <div className="printer-paper"></div>
          </div>
          <div className="printer-gears">
            <div className="printer-gear"></div>
            <div className="printer-gear reverse"></div>
          </div>
        </>
      )}

      <div className="flex flex-col items-center gap-2 mt-2">
        <div className="cmyk-ink-dots">
          <div className="cmyk-dot cmyk-cyan"></div>
          <div className="cmyk-dot cmyk-magenta"></div>
          <div className="cmyk-dot cmyk-yellow"></div>
          <div className="cmyk-dot cmyk-key"></div>
        </div>
        <span className="text-xs font-semibold tracking-wider text-secondary uppercase animate-pulse mt-1">
          {text}
        </span>
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0f]">
        {content}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-20 w-full">
      {content}
    </div>
  );
}
