import { useRef, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { db_instance } from '../database/db';

const MIN_SESSIONS_FOR_BASELINE = 5;
const ZSCORE_THRESHOLD = 2.0;

const calculateZScore = (value, mean, stdDev) => {
  if (stdDev === 0) return 0;
  return Math.abs((value - mean) / stdDev);
};

const calculateStats = (values) => {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);
  return { mean, stdDev };
};

export const useMLAnomalyDetection = (onLock) => {
  const sessionStartTime = useRef(Date.now());
  const passwordsViewedCount = useRef(0);
  const failedPinsCount = useRef(0);

  const recordPasswordView = useCallback(() => {
    passwordsViewedCount.current += 1;
  }, []);

  const recordFailedPinML = useCallback(() => {
    failedPinsCount.current += 1;
  }, []);

  const getBaseline = useCallback(() => {
    try {
      const logs = db_instance.getAllSync(
        'SELECT * FROM behavior_log ORDER BY created_at DESC LIMIT 50'
      );
      if (logs.length < MIN_SESSIONS_FOR_BASELINE) {
        return null;
      }

      const hourStats = calculateStats(logs.map(l => l.hour_of_access));
      const viewStats = calculateStats(logs.map(l => l.passwords_viewed));
      const durationStats = calculateStats(logs.map(l => l.session_duration));
      const pinStats = calculateStats(logs.map(l => l.failed_pins));

      return { hourStats, viewStats, durationStats, pinStats, sessionCount: logs.length };
    } catch (err) {
      console.log('Baseline error:', err);
      return null;
    }
  }, []);

  const analyzeSession = useCallback((sessionData, baseline) => {
    if (!baseline) return { anomalous: false, reasons: [] };

    const reasons = [];
    let anomalyScore = 0;

    const hourZ = calculateZScore(
      sessionData.hour,
      baseline.hourStats.mean,
      baseline.hourStats.stdDev
    );
    if (hourZ > ZSCORE_THRESHOLD) {
      reasons.push(`Unusual access time (Z-score: ${hourZ.toFixed(2)})`);
      anomalyScore += hourZ;
    }

    const viewZ = calculateZScore(
      sessionData.passwordsViewed,
      baseline.viewStats.mean,
      baseline.viewStats.stdDev
    );
    if (viewZ > ZSCORE_THRESHOLD) {
      reasons.push(`Unusual number of passwords viewed (Z-score: ${viewZ.toFixed(2)})`);
      anomalyScore += viewZ;
    }

    const durationZ = calculateZScore(
      sessionData.duration,
      baseline.durationStats.mean,
      baseline.durationStats.stdDev
    );
    if (durationZ > ZSCORE_THRESHOLD) {
      reasons.push(`Unusual session duration (Z-score: ${durationZ.toFixed(2)})`);
      anomalyScore += durationZ;
    }

    const pinZ = calculateZScore(
      sessionData.failedPins,
      baseline.pinStats.mean,
      baseline.pinStats.stdDev
    );
    if (pinZ > ZSCORE_THRESHOLD) {
      reasons.push(`Unusual failed PIN attempts (Z-score: ${pinZ.toFixed(2)})`);
      anomalyScore += pinZ;
    }

    return {
      anomalous: reasons.length > 0,
      reasons,
      anomalyScore: anomalyScore.toFixed(2),
    };
  }, []);

  const logAndAnalyzeSession = useCallback(() => {
    try {
      const now = new Date();
      const sessionDuration = Math.floor((Date.now() - sessionStartTime.current) / 1000);
      const sessionData = {
        hour: now.getHours(),
        passwordsViewed: passwordsViewedCount.current,
        duration: sessionDuration,
        failedPins: failedPinsCount.current,
      };

      // Get baseline before logging this session
      const baseline = getBaseline();

      // Analyze current session against baseline
      const analysis = analyzeSession(sessionData, baseline);

      // Log this session to build future baseline
      db_instance.runSync(
        'INSERT INTO behavior_log (hour_of_access, passwords_viewed, session_duration, failed_pins, created_at) VALUES (?, ?, ?, ?, ?)',
        [
          sessionData.hour,
          sessionData.passwordsViewed,
          sessionData.duration,
          sessionData.failedPins,
          now.toISOString()
        ]
      );

      // Keep only last 100 sessions to save space
      db_instance.runSync(
        'DELETE FROM behavior_log WHERE id NOT IN (SELECT id FROM behavior_log ORDER BY created_at DESC LIMIT 100)'
      );

      if (analysis.anomalous && baseline) {
        Alert.alert(
          '🤖 ML Anomaly Detected',
          `Suspicious behavior detected based on your personal usage pattern:\n\n${analysis.reasons.join('\n')}\n\nAnomaly Score: ${analysis.anomalyScore}\nBased on ${baseline.sessionCount} previous sessions.\n\nVault will be locked for security.`,
          [{ text: 'OK', onPress: onLock }]
        );
      }

      // Reset session counters
      passwordsViewedCount.current = 0;
      failedPinsCount.current = 0;
      sessionStartTime.current = Date.now();

    } catch (err) {
      console.log('ML analysis error:', err);
    }
  }, [getBaseline, analyzeSession, onLock]);

  const getMLStats = useCallback(() => {
    try {
      const count = db_instance.getFirstSync('SELECT COUNT(*) as count FROM behavior_log');
      const baseline = getBaseline();
      return {
        sessionCount: count?.count || 0,
        hasBaseline: baseline !== null,
        sessionsNeeded: Math.max(0, MIN_SESSIONS_FOR_BASELINE - (count?.count || 0)),
        baseline,
      };
    } catch (err) {
      return { sessionCount: 0, hasBaseline: false, sessionsNeeded: MIN_SESSIONS_FOR_BASELINE };
    }
  }, [getBaseline]);

  return {
    recordPasswordView,
    recordFailedPinML,
    logAndAnalyzeSession,
    getMLStats,
  };
};