// components/notifications/SwipeableRow.tsx
// Swipe right → onSwipeRight (mark read), swipe left → onSwipeLeft (delete).
// Uses pointer events with direction detection to avoid conflicting with vertical scroll.
// Desktop fallback: action buttons appear on hover.
"use client";

import { useRef, useState } from "react";

const THRESHOLD = 72; // px to commit action
const MIN_HORIZONTAL_RATIO = 1.5; // deltaX must be 1.5× deltaY to be considered a swipe

interface SwipeableRowProps {
  onSwipeRight?: () => void;
  onSwipeLeft: () => void;
  rightLabel?: string;
  children: React.ReactNode;
}

export default function SwipeableRow({
  onSwipeRight,
  onSwipeLeft,
  rightLabel = "Leída",
  children,
}: SwipeableRowProps) {
  const [tx, setTx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startY = useRef(0);
  const isSwipe = useRef(false);
  const decided = useRef(false);

  // Clamp translate to a comfortable max so we don't reveal huge gaps
  const MAX_TRAVEL = 120;

  function reset() {
    setTx(0);
    setDragging(false);
    isSwipe.current = false;
    decided.current = false;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    startX.current = e.clientX;
    startY.current = e.clientY;
    decided.current = false;
    isSwipe.current = false;
  }

  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const dx = e.clientX - startX.current;
    const dy = e.clientY - startY.current;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (!decided.current) {
      if (adx < 6 && ady < 6) return; // haven't moved enough to decide
      if (ady > adx || adx < ady * MIN_HORIZONTAL_RATIO) {
        // It's primarily vertical — surrender to scroll
        decided.current = true;
        isSwipe.current = false;
        return;
      }
      // It's horizontal — start swipe
      decided.current = true;
      isSwipe.current = true;
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }

    if (!isSwipe.current) return;
    const clamped = Math.max(-MAX_TRAVEL, Math.min(MAX_TRAVEL, dx));
    setTx(clamped);
  }

  function handlePointerUp() {
    if (!isSwipe.current) { reset(); return; }

    if (tx > THRESHOLD) {
      onSwipeRight?.();
    } else if (tx < -THRESHOLD) {
      onSwipeLeft();
    }
    reset();
  }

  // Opacity of action background (0 → 1 as we approach threshold)
  const rightOpacity = Math.min(1, Math.max(0, tx / THRESHOLD));
  const leftOpacity = Math.min(1, Math.max(0, -tx / THRESHOLD));

  return (
    <div className="relative overflow-hidden group">
      {/* Right action bg (swipe right = mark read) */}
      {onSwipeRight && (
        <div
          className="absolute inset-y-0 left-0 flex items-center px-5 bg-blue-500 pointer-events-none"
          style={{ opacity: rightOpacity }}
          aria-hidden
        >
          <CheckIcon />
          <span className="ml-1.5 text-xs font-semibold text-white">{rightLabel}</span>
        </div>
      )}
      {/* Left action bg (swipe left = delete) */}
      <div
        className="absolute inset-y-0 right-0 flex items-center px-5 bg-red-500 pointer-events-none"
        style={{ opacity: leftOpacity }}
        aria-hidden
      >
        <span className="text-xs font-semibold text-white mr-1.5">Eliminar</span>
        <TrashIcon />
      </div>

      {/* Content layer */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={reset}
        style={{
          transform: `translateX(${tx}px)`,
          transition: dragging ? "none" : "transform 0.2s ease-out",
          touchAction: "pan-y",
          userSelect: "none",
          WebkitUserSelect: "none",
        }}
        className="relative bg-white"
      >
        {children}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}
