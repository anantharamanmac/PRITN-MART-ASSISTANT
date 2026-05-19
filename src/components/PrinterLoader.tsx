import React from 'react';

interface PrinterLoaderProps {
  text?: string;
  fullscreen?: boolean;
}

export default function PrinterLoader({ text = "Loading Print Mart...", fullscreen = false }: PrinterLoaderProps) {
  const content = (
    <div className="printer-container animate-fade-in">
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
