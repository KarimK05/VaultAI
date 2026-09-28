import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, RefreshControl
} from 'react-native';
import { db_instance } from '../database/db';
import { useMLAnomalyDetection } from '../hooks/useMLAnomalyDetection';

const ZSCORE_THRESHOLD = 2.0;

const calculateStats = (values) => {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
  return { mean: parseFloat(mean.toFixed(2)), stdDev: parseFloat(Math.sqrt(variance).toFixed(2)) };
};

const calculateZScore = (value, mean, stdDev) => {
  if (stdDev === 0) return 0;
  return parseFloat(Math.abs((value - mean) / stdDev).toFixed(2));
};

export default function DeveloperScreen() {
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);
  const [vaultCount, setVaultCount] = useState(0);
  const [masterExists, setMasterExists] = useState(false);
  const [auditCacheExists, setAuditCacheExists] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { getMLStats } = useMLAnomalyDetection(() => {});

  const loadData = () => {
    try {
      const behaviorLogs = db_instance.getAllSync(
        'SELECT * FROM behavior_log ORDER BY created_at DESC LIMIT 20'
      );
      setLogs(behaviorLogs);

      const vault = db_instance.getFirstSync('SELECT COUNT(*) as count FROM vault');
      setVaultCount(vault?.count || 0);

      const master = db_instance.getFirstSync('SELECT * FROM master LIMIT 1');
      setMasterExists(!!master);

      const auditCache = db_instance.getFirstSync('SELECT * FROM audit_cache LIMIT 1');
      setAuditCacheExists(!!auditCache);

      if (behaviorLogs.length >= 5) {
        const hourStats = calculateStats(behaviorLogs.map(l => l.hour_of_access));
        const viewStats = calculateStats(behaviorLogs.map(l => l.passwords_viewed));
        const durationStats = calculateStats(behaviorLogs.map(l => l.session_duration));
        const pinStats = calculateStats(behaviorLogs.map(l => l.failed_pins));
        setStats({ hourStats, viewStats, durationStats, pinStats });
      }
    } catch (err) {
      console.log('Dev screen error:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
    setRefreshing(false);
  };

  const mlStats = getMLStats();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.inner}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#00ff9d" />}
    >
      <Text style={styles.title}>🛠️ Developer Panel</Text>
      <Text style={styles.subtitle}>Pull down to refresh</Text>

      {/* System Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>System Status</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Master Credentials</Text>
          <Text style={[styles.rowValue, { color: masterExists ? '#00ff9d' : '#ff6b6b' }]}>
            {masterExists ? '✅ Set' : '❌ Not Set'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Vault Passwords</Text>
          <Text style={styles.rowValue}>{vaultCount} stored</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Audit Cache</Text>
          <Text style={[styles.rowValue, { color: auditCacheExists ? '#00ff9d' : '#666' }]}>
            {auditCacheExists ? '✅ Cached' : 'Empty'}
          </Text>
        </View>
      </View>

      {/* ML Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ML Anomaly Detection</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Status</Text>
          <Text style={[styles.rowValue, { color: mlStats.hasBaseline ? '#00ff9d' : '#ffeaa7' }]}>
            {mlStats.hasBaseline ? '✅ Active' : '⏳ Learning'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Sessions Logged</Text>
          <Text style={styles.rowValue}>{mlStats.sessionCount}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Sessions Until Active</Text>
          <Text style={styles.rowValue}>
            {mlStats.hasBaseline ? 'Active now' : `${mlStats.sessionsNeeded} more needed`}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Z-Score Threshold</Text>
          <Text style={styles.rowValue}>{ZSCORE_THRESHOLD}</Text>
        </View>
      </View>

      {/* Baseline Stats */}
      {stats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Learned Behavioral Baseline</Text>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderText}>Feature</Text>
            <Text style={styles.tableHeaderText}>Mean</Text>
            <Text style={styles.tableHeaderText}>Std Dev</Text>
          </View>
          {[
            { label: 'Access Hour', stats: stats.hourStats },
            { label: 'Passwords Viewed', stats: stats.viewStats },
            { label: 'Session Duration (s)', stats: stats.durationStats },
            { label: 'Failed PINs', stats: stats.pinStats },
          ].map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <Text style={styles.tableCell}>{item.label}</Text>
              <Text style={styles.tableCell}>{item.stats.mean}</Text>
              <Text style={styles.tableCell}>{item.stats.stdDev}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Recent Sessions with Z-Scores */}
      {logs.length > 0 && stats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Sessions + Z-Scores</Text>
          <Text style={styles.sectionSubtitle}>Z &gt; {ZSCORE_THRESHOLD} = anomalous</Text>
          {logs.slice(0, 10).map((log, index) => {
            const hourZ = calculateZScore(log.hour_of_access, stats.hourStats.mean, stats.hourStats.stdDev);
            const viewZ = calculateZScore(log.passwords_viewed, stats.viewStats.mean, stats.viewStats.stdDev);
            const durZ = calculateZScore(log.session_duration, stats.durationStats.mean, stats.durationStats.stdDev);
            const pinZ = calculateZScore(log.failed_pins, stats.pinStats.mean, stats.pinStats.stdDev);
            const isAnomalous = hourZ > ZSCORE_THRESHOLD || viewZ > ZSCORE_THRESHOLD || durZ > ZSCORE_THRESHOLD || pinZ > ZSCORE_THRESHOLD;

            return (
              <View key={index} style={[styles.sessionCard, isAnomalous && styles.sessionCardAnomalous]}>
                <View style={styles.sessionHeader}>
                  <Text style={styles.sessionDate}>
                    {new Date(log.created_at).toLocaleString()}
                  </Text>
                  <Text style={[styles.sessionStatus, { color: isAnomalous ? '#ff6b6b' : '#00ff9d' }]}>
                    {isAnomalous ? '⚠️ Anomalous' : '✅ Normal'}
                  </Text>
                </View>
                <View style={styles.sessionRow}>
                  <Text style={styles.sessionLabel}>Hour: {log.hour_of_access}:00</Text>
                  <Text style={[styles.sessionZ, { color: hourZ > ZSCORE_THRESHOLD ? '#ff6b6b' : '#666' }]}>
                    Z={hourZ}
                  </Text>
                </View>
                <View style={styles.sessionRow}>
                  <Text style={styles.sessionLabel}>Passwords viewed: {log.passwords_viewed}</Text>
                  <Text style={[styles.sessionZ, { color: viewZ > ZSCORE_THRESHOLD ? '#ff6b6b' : '#666' }]}>
                    Z={viewZ}
                  </Text>
                </View>
                <View style={styles.sessionRow}>
                  <Text style={styles.sessionLabel}>Duration: {log.session_duration}s</Text>
                  <Text style={[styles.sessionZ, { color: durZ > ZSCORE_THRESHOLD ? '#ff6b6b' : '#666' }]}>
                    Z={durZ}
                  </Text>
                </View>
                <View style={styles.sessionRow}>
                  <Text style={styles.sessionLabel}>Failed PINs: {log.failed_pins}</Text>
                  <Text style={[styles.sessionZ, { color: pinZ > ZSCORE_THRESHOLD ? '#ff6b6b' : '#666' }]}>
                    Z={pinZ}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {logs.length > 0 && !stats && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Sessions</Text>
          <Text style={styles.learningText}>
            ⏳ {logs.length}/5 sessions logged. {5 - logs.length} more needed to activate ML baseline.
          </Text>
          {logs.map((log, index) => (
            <View key={index} style={styles.sessionCard}>
              <Text style={styles.sessionDate}>{new Date(log.created_at).toLocaleString()}</Text>
              <Text style={styles.sessionLabel}>Hour: {log.hour_of_access}:00 | Viewed: {log.passwords_viewed} | Duration: {log.session_duration}s | Failed PINs: {log.failed_pins}</Text>
            </View>
          ))}
        </View>
      )}

      {logs.length === 0 && (
        <View style={styles.section}>
          <Text style={styles.emptyText}>No behavioral sessions logged yet. Use the vault and lock it to generate session data.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  inner: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  subtitle: {
    color: '#666',
    fontSize: 13,
    marginBottom: 24,
  },
  section: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  sectionTitle: {
    color: '#00ff9d',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionSubtitle: {
    color: '#666',
    fontSize: 12,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  rowLabel: {
    color: '#888',
    fontSize: 14,
  },
  rowValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  tableHeader: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  tableHeaderText: {
    flex: 1,
    color: '#666',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  tableCell: {
    flex: 1,
    color: '#ffffff',
    fontSize: 13,
  },
  sessionCard: {
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#222',
  },
  sessionCardAnomalous: {
    borderColor: '#ff6b6b',
    backgroundColor: '#1a0a0a',
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sessionDate: {
    color: '#666',
    fontSize: 11,
  },
  sessionStatus: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  sessionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sessionLabel: {
    color: '#888',
    fontSize: 12,
  },
  sessionZ: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  learningText: {
    color: '#ffeaa7',
    fontSize: 14,
    marginBottom: 12,
    lineHeight: 20,
  },
  emptyText: {
    color: '#666',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});