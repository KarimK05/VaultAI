import { useEffect, useRef, useCallback } from 'react';
import { AppState } from 'react-native';

const LOCK_TIMEOUT = 2 * 60 * 1000; // 2 minutes — change here to adjust

export const useAutoLock = (onLock) => {
  const timerRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  const resetTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      onLock();
    }, LOCK_TIMEOUT);
  }, [onLock]);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    resetTimer();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appStateRef.current === 'active' &&
        nextAppState.match(/inactive|background/)
      ) {
        // App went to background — lock immediately
        clearTimer();
        onLock();
      }
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        // App came back to foreground — restart timer
        resetTimer();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      clearTimer();
      subscription.remove();
    };
  }, [onLock, resetTimer, clearTimer]);

  return { resetTimer, clearTimer };
};