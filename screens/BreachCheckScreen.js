import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { checkPasswordBreach } from '../crypto/hibp';

export default function BreachCheckScreen({ navigation }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleCheck = async () => {
    if (!password.trim()) {
      Alert.alert('Error', 'Please enter a password to check');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const breachResult = await checkPasswordBreach(password);
      setResult(breachResult);
    } catch (err) {
      console.log('Breach check error:', err);
      Alert.alert('Error', 'Could not check password. Check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setPassword('');
    setResult(null);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Breach Check</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>🔍 How it works</Text>
          <Text style={styles.infoText}>
            We check your password against millions of known data breaches using the HaveIBeenPwned API.
            {'\n\n'}
            Your password <Text style={styles.infoHighlight}>never leaves your device</Text> — only the first 5 characters of its hash are sent, keeping your password completely private.
          </Text>
        </View>

        {/* Input */}
        <Text style={styles.label}>Enter a password to check</Text>
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Type or paste a password..."
            autoCapitalize="none"
            placeholderTextColor="#666"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setResult(null);
            }}
          />
          <TouchableOpacity
            style={styles.eyeButton}
            onPress={() => setShowPassword(!showPassword)}
          >
            <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
          </TouchableOpacity>
        </View>

        {/* Check Button */}
        <TouchableOpacity
          style={[styles.checkButton, (!password.trim() || loading) && styles.checkButtonDisabled]}
          onPress={handleCheck}
          disabled={!password.trim() || loading}
        >
          {loading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#0a0a0a" size="small" />
              <Text style={[styles.checkButtonText, { marginLeft: 8 }]}>
                Checking...
              </Text>
            </View>
          ) : (
            <Text style={styles.checkButtonText}>Check Password</Text>
          )}
        </TouchableOpacity>

        {/* Result */}
        {result && (
          <View style={[
            styles.resultBox,
            !result.checked ? styles.resultUnchecked :
              result.breached ? styles.resultBreached : styles.resultSafe
          ]}>
            {!result.checked ? (
              <>
                <Text style={styles.resultIcon}>⚠️</Text>
                <Text style={styles.resultTitle}>Check Failed</Text>
                <Text style={styles.resultText}>
                  Could not connect to the breach database. Check your internet connection and try again.
                </Text>
              </>
            ) : result.breached ? (
              <>
                <Text style={styles.resultIcon}>⚠️</Text>
                <Text style={styles.resultTitle}>Password Compromised!</Text>
                <Text style={styles.resultText}>
                  This password has been found in{' '}
                  <Text style={styles.resultCount}>
                    {result.count.toLocaleString()}
                  </Text>
                  {' '}data breaches.
                </Text>
                <Text style={styles.resultAdvice}>
                  You should never use this password. Change it immediately on any account using it.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.resultIcon}>✅</Text>
                <Text style={styles.resultTitle}>Password Not Found</Text>
                <Text style={styles.resultText}>
                  This password has not been found in any known data breaches.
                </Text>
                <Text style={styles.resultAdvice}>
                  Remember — this only checks known breaches. Always use strong, unique passwords.
                </Text>
              </>
            )}
          </View>
        )}

        {/* Clear Button */}
        {(password.length > 0 || result) && (
          <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
            <Text style={styles.clearButtonText}>Clear</Text>
          </TouchableOpacity>
        )}

        {/* Privacy Note */}
        <View style={styles.privacyNote}>
          <Text style={styles.privacyText}>
            🔒 Powered by HaveIBeenPwned API using k-anonymity.
            Your full password is never transmitted.
          </Text>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  inner: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  backButton: {
    color: '#00ff9d',
    fontSize: 16,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  infoBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  infoTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  infoText: {
    color: '#888',
    fontSize: 14,
    lineHeight: 22,
  },
  infoHighlight: {
    color: '#00ff9d',
    fontWeight: 'bold',
  },
  label: {
    color: '#666',
    fontSize: 13,
    marginHorizontal: 20,
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
  },
  input: {
    flex: 1,
    padding: 16,
    color: '#ffffff',
    fontSize: 16,
  },
  eyeButton: {
    padding: 16,
  },
  eyeText: {
    fontSize: 20,
  },
  checkButton: {
    backgroundColor: '#00ff9d',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 24,
  },
  checkButtonDisabled: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  checkButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultBox: {
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
  },
  resultBreached: {
    backgroundColor: '#2a0a0a',
    borderColor: '#ff6b6b',
  },
  resultSafe: {
    backgroundColor: '#0a2a0a',
    borderColor: '#00ff9d',
  },
  resultIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  resultTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  resultText: {
    color: '#cccccc',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  resultCount: {
    color: '#ff6b6b',
    fontWeight: 'bold',
  },
  resultAdvice: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  resultUnchecked: {
    backgroundColor: '#1a1a0a',
    borderColor: '#ffeaa7',
  },
  clearButton: {
    padding: 14,
    alignItems: 'center',
    marginHorizontal: 20,
  },
  clearButtonText: {
    color: '#666',
    fontSize: 15,
  },
  privacyNote: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  privacyText: {
    color: '#444',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});