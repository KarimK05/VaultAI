import { useRef, useCallback } from 'react';
import { Alert } from 'react-native';

const RAPID_RETRIEVAL_LIMIT = 5;
const RAPID_RETRIEVAL_WINDOW = 30000; // 30 seconds
const MAX_FAILED_PINS = 3;
const COOLDOWN_DURATION = 30000; // 30 seconds
const UNUSUAL_HOURS_START = 2;
const UNUSUAL_HOURS_END = 5;

export const useAnomalyDetection = (onLock) => {
  const retrievalTimestamps = useRef([]);
  const failedPinAttempts = useRef(0);
  const cooldownActive = useRef(false);

  const checkUnusualHours = useCallback(() => {
    const hour = new Date().getHours();
    if (hour >= UNUSUAL_HOURS_START && hour < UNUSUAL_HOURS_END) {
      Alert.alert(
        '⚠️ Unusual Access Time',
        `Your vault is being accessed between ${UNUSUAL_HOURS_START}AM - ${UNUSUAL_HOURS_END}AM. If this wasn't you, lock the vault immediately.`,
        [
          { text: 'Lock Now', style: 'destructive', onPress: onLock },
          { text: "It's Me", style: 'cancel' }
        ]
      );
    }
  }, [onLock]);

  const recordRetrieval = useCallback(() => {
    const now = Date.now();

    // Remove timestamps outside the window
    retrievalTimestamps.current = retrievalTimestamps.current.filter(
      t => now - t < RAPID_RETRIEVAL_WINDOW
    );

    retrievalTimestamps.current.push(now);

    if (retrievalTimestamps.current.length >= RAPID_RETRIEVAL_LIMIT) {
      retrievalTimestamps.current = [];
      // Lock immediately — only once
      onLock();
      Alert.alert(
        '🚨 Suspicious Activity Detected',
        `${RAPID_RETRIEVAL_LIMIT} passwords were accessed in ${RAPID_RETRIEVAL_WINDOW / 1000} seconds. Vault has been locked for security.`
      );
    }
  }, [onLock]);

  const recordFailedPin = useCallback(() => {
    if (cooldownActive.current) return true;

    failedPinAttempts.current += 1;

    if (failedPinAttempts.current >= MAX_FAILED_PINS) {
      cooldownActive.current = true;
      failedPinAttempts.current = 0;

      setTimeout(() => {
        cooldownActive.current = false;
      }, COOLDOWN_DURATION);

      return true;
    }

    return false;
  }, []);

  const resetFailedPins = useCallback(() => {
    failedPinAttempts.current = 0;
  }, []);

  const isCooldownActive = useCallback(() => {
    return cooldownActive.current;
  }, []);

  return {
    recordRetrieval,
    recordFailedPin,
    resetFailedPins,
    isCooldownActive,
    checkUnusualHours,
  };
};