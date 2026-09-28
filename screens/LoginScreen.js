import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView,
  Platform, ActivityIndicator
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { verifyPassword, decryptPassword } from '../crypto/encryption';
import { db_instance } from '../database/db';

export default function LoginScreen({ navigation }) {
  const [masterPassword, setMasterPassword] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    checkIfSetup();
    checkBiometrics();
  }, []);

  const checkIfSetup = () => {
    try {
      const result = db_instance.getFirstSync('SELECT * FROM master LIMIT 1');
      if (!result) {
        navigation.replace('Setup');
      }
    } catch (err) {
      console.log('Check setup error:', err);
    } finally {
      setLoading(false);
    }
  };

  const checkBiometrics = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(compatible && enrolled);
    } catch (err) {
      console.log('Biometric check error:', err);
    }
  };

  const handleBiometricLogin = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock VaultAI',
        fallbackLabel: 'Use Password Instead',
        disableDeviceFallback: false,
      });

      if (result.success) {
        // Retrieve the actual master password stored securely
        const storedMasterKey = await SecureStore.getItemAsync('masterKey');
        if (storedMasterKey) {
          navigation.replace('MainTabs', { masterKey: storedMasterKey });
        } else {
          Alert.alert(
            'Biometrics Unavailable',
            'Please log in with your master password and PIN first to enable biometrics.'
          );
        }
      } else {
        Alert.alert('Authentication Failed', 'Could not verify your identity.');
      }
    } catch (err) {
      console.log('Biometric login error:', err);
      Alert.alert('Error', 'Biometric authentication failed.');
    }
  };

  const handleLogin = async () => {
    if (!masterPassword || !pin) {
      Alert.alert('Error', 'Please enter your master password and PIN');
      return;
    }
    setLoggingIn(true);
    try {
      const result = db_instance.getFirstSync('SELECT * FROM master LIMIT 1');
      if (!result) {
        Alert.alert('Error', 'No credentials found. Please set up the app.');
        return;
      }
      const passwordMatch = await verifyPassword(masterPassword, result.password_hash);
      const pinMatch = await verifyPassword(pin, result.pin_hash);
      if (passwordMatch && pinMatch) {
        // Test decryption before entering vault
        const testItem = db_instance.getFirstSync('SELECT * FROM vault LIMIT 1');
        if (testItem) {
          const testDecrypt = await decryptPassword(testItem.password, masterPassword);
          if (!testDecrypt) {
            Alert.alert(
              '⚠️ Decryption Error',
              'Your vault data appears to be corrupted or was encrypted with a different key. Would you like to reset the vault? This will delete all stored passwords.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Reset Vault',
                  style: 'destructive',
                  onPress: async () => {
                    db_instance.runSync('DELETE FROM vault');
                    db_instance.runSync('DELETE FROM master');
                    db_instance.runSync('DELETE FROM audit_cache');
                    await SecureStore.deleteItemAsync('masterKey');
                    Alert.alert('Reset Complete', 'Please set up your vault again.');
                    navigation.replace('Setup');
                  }
                }
              ]
            );
            return;
          }
        }
        await SecureStore.setItemAsync('masterKey', masterPassword);
        navigation.replace('MainTabs', { masterKey: masterPassword });
      } else {
        Alert.alert('Error', 'Incorrect master password or PIN');
      }
    } catch (err) {
      console.log('Login error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoggingIn(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <Text style={styles.logo}>VAULT<Text style={styles.logoAI}>_AI</Text></Text>
          <ActivityIndicator color="#00ff9d" size="large" style={{ marginTop: 20 }} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>VAULT<Text style={styles.logoAI}>_AI</Text></Text>
        <Text style={styles.subtitle}>Your secure password vault</Text>

        <TextInput
          style={styles.input}
          placeholder="Master Password"
          placeholderTextColor="#666"
          secureTextEntry
          autoCapitalize="none"
          value={masterPassword}
          onChangeText={setMasterPassword}
          editable={!loggingIn}
        />
        <TextInput
          style={styles.input}
          placeholder="PIN"
          placeholderTextColor="#666"
          secureTextEntry
          autoCapitalize="none"
          keyboardType="numeric"
          maxLength={6}
          value={pin}
          onChangeText={setPin}
          editable={!loggingIn}
        />

        <TouchableOpacity
          style={[styles.button, loggingIn && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loggingIn}
        >
          {loggingIn ? (
            <ActivityIndicator color="#0a0a0a" size="small" />
          ) : (
            <Text style={styles.buttonText}>Unlock Vault</Text>
          )}
        </TouchableOpacity>

        {biometricAvailable && (
          <TouchableOpacity
            style={styles.biometricButton}
            onPress={handleBiometricLogin}
            disabled={loggingIn}
          >
            <Text style={styles.biometricIcon}>👆</Text>
            <Text style={styles.biometricText}>Use Biometrics</Text>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  logo: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
    letterSpacing: 2,
  },
  logoAI: {
    color: '#00ff9d',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 50,
    letterSpacing: 1,
  },
  input: {
    width: '100%',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    color: '#ffffff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  button: {
    width: '100%',
    backgroundColor: '#00ff9d',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  buttonText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  biometricButton: {
    marginTop: 24,
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    width: '100%',
    backgroundColor: '#1a1a1a',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  biometricIcon: {
    fontSize: 22,
  },
  biometricText: {
    color: '#00ff9d',
    fontSize: 16,
    fontWeight: 'bold',
  },
});