'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_VISIBLE_MS = 220;

export function useWorkingOverlay(minVisibleMs = DEFAULT_VISIBLE_MS) {
  const [isWorking, setIsWorking] = useState(false);
  const paintTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (paintTimerRef.current !== null) {
      window.clearTimeout(paintTimerRef.current);
      paintTimerRef.current = null;
    }

    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const runWithOverlay = useCallback(
    (work: () => void) => {
      clearTimers();
      setIsWorking(true);

      paintTimerRef.current = window.setTimeout(() => {
        work();
        paintTimerRef.current = null;

        hideTimerRef.current = window.setTimeout(() => {
          setIsWorking(false);
          hideTimerRef.current = null;
        }, minVisibleMs);
      }, 0);
    },
    [clearTimers, minVisibleMs],
  );

  return {
    isWorking,
    runWithOverlay,
  };
}
