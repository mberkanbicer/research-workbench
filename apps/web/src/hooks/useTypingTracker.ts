'use client';

import { useRef, useCallback, useEffect } from 'react';

interface UseTypingTrackerOptions {
  onStartTyping: () => void;
  onStopTyping: () => void;
  /** Idle timeout in ms before auto-stopping (default: 2000) */
  idleTimeout?: number;
}

/**
 * Tracks local typing activity and fires start/stop callbacks with debounce.
 * Automatically stops after `idleTimeout` ms of inactivity.
 */
export function useTypingTracker({
  onStartTyping,
  onStopTyping,
  idleTimeout = 2000,
}: UseTypingTrackerOptions) {
  const isTypingRef = useRef(false);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const stopTyping = useCallback(() => {
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onStopTyping();
    }
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, [onStopTyping]);

  const startTyping = useCallback(() => {
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onStartTyping();
    }

    // Reset idle timer
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }
    idleTimerRef.current = setTimeout(() => {
      stopTyping();
    }, idleTimeout);
  }, [onStartTyping, idleTimeout, stopTyping]);

  const handleInput = useCallback(() => {
    startTyping();
  }, [startTyping]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, []);

  return {
    handleInput,
    stopTyping,
    isTyping: isTypingRef,
  };
}
