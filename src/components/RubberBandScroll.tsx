"use client";

import React, { useEffect, useRef } from 'react';

export default function RubberBandScroll({ children }: { children: React.ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let overscrollY = 0;
    let wheelTimer: NodeJS.Timeout | null = null;
    let isResetting = false;

    // Apply the elastic rubber band stretch transform
    const updateTransform = (offset: number, isBottom: boolean) => {
      if (!wrapper) return;
      
      // Physical rubber resistance formula (logarithmic damping)
      const absOffset = Math.abs(offset);
      const effectiveOffset = Math.sign(offset) * Math.pow(absOffset, 0.75) * 0.8;
      const clampedOffset = Math.max(-120, Math.min(120, effectiveOffset));
      
      // Elastic stretch scale
      const stretch = 1 + Math.min(0.045, Math.abs(clampedOffset) * 0.0004);

      wrapper.style.willChange = 'transform';
      wrapper.style.transition = 'none';
      wrapper.style.transformOrigin = isBottom ? 'center top' : 'center bottom';
      wrapper.style.transform = `translate3d(0, ${-clampedOffset}px, 0) scaleY(${stretch})`;
    };

    // Elastic snapback with Apple/Vivo spring physics
    const snapBack = () => {
      if (!wrapper || isResetting) return;
      isResetting = true;
      overscrollY = 0;

      wrapper.style.transition = 'transform 0.55s cubic-bezier(0.175, 0.885, 0.32, 1.35)';
      wrapper.style.transform = 'translate3d(0, 0, 0) scaleY(1)';

      setTimeout(() => {
        if (wrapper) {
          wrapper.style.transition = '';
          wrapper.style.transform = '';
          wrapper.style.willChange = '';
        }
        isResetting = false;
      }, 550);
    };

    // ── DESKTOP: Wheel / Trackpad Scroll ──
    const handleWheel = (e: WheelEvent) => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const windowHeight = window.innerHeight;
      const scrollHeight = Math.max(doc.scrollHeight, document.body.scrollHeight);
      const isAtTop = scrollTop <= 2;
      const isAtBottom = scrollTop + windowHeight >= scrollHeight - 3;

      // Check if user is scrolling past top boundary
      if (isAtTop && e.deltaY < 0) {
        overscrollY += e.deltaY;
        updateTransform(overscrollY, false);

        if (wheelTimer) clearTimeout(wheelTimer);
        wheelTimer = setTimeout(snapBack, 80);
      }
      // Check if user is scrolling past bottom EOF boundary
      else if (isAtBottom && e.deltaY > 0) {
        overscrollY += e.deltaY;
        updateTransform(overscrollY, true);

        if (wheelTimer) clearTimeout(wheelTimer);
        wheelTimer = setTimeout(snapBack, 80);
      } else if (overscrollY !== 0) {
        snapBack();
      }
    };

    // ── MOBILE: Touch Gesture Drag & Stretch ──
    let touchStartY = 0;
    let touchStartScrollTop = 0;
    let isTrackingTouch = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      touchStartY = e.touches[0].clientY;
      const doc = document.documentElement;
      touchStartScrollTop = window.scrollY || doc.scrollTop || 0;
      isTrackingTouch = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isTrackingTouch || e.touches.length !== 1) return;
      const currentY = e.touches[0].clientY;
      const deltaY = touchStartY - currentY; // positive = scrolling down (towards bottom)
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const windowHeight = window.innerHeight;
      const scrollHeight = Math.max(doc.scrollHeight, document.body.scrollHeight);
      const isAtTop = scrollTop <= 2;
      const isAtBottom = scrollTop + windowHeight >= scrollHeight - 3;

      if (isAtTop && deltaY < 0) {
        // Pulling down past top boundary
        updateTransform(deltaY * 0.9, false);
      } else if (isAtBottom && deltaY > 0) {
        // Pulling up past bottom EOF boundary
        updateTransform(deltaY * 0.9, true);
      }
    };

    const handleTouchEnd = () => {
      if (!isTrackingTouch) return;
      isTrackingTouch = false;
      snapBack();
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
      if (wheelTimer) clearTimeout(wheelTimer);
    };
  }, []);

  return (
    <div ref={wrapperRef} className="rubber-band-wrapper">
      {children}
    </div>
  );
}
