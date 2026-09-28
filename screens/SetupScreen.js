import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, KeyboardAvoidingView,
  Platform, ScrollView, ActivityIndicator
} from 'react-native';
import { hashPassword } from '../crypto/encryption';
import { db_instance } from '../database/db';

export default function SetupScreen({ navigation }) {
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSetup = async () => {
    if (!masterPassword || !confirmPassword || !pin || !confirmPin) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    if (masterPassword.length < 8) {
      Alert.alert('Error', 'Master password must be at least 8 characters');
      return;
    }
    if (masterPassword !== confirmPassword) {
      Alert.alert('Error', 'Master passwords do not match');
      return;
    }
    if (pin.length < 4) {
      Alert.alert('Error', 'PIN must be at least 4 digits');
      return;
    }
    if (!/^\d+$/.test(pin)) {
      Alert.alert('Error', 'PIN must contain numbers only');
      return;
    }
    if (pin !== confirmPin) {
      Alert.alert('Error', 'PINs do not match');
      return;
    }

    setLoading(true);
    try {
      // Prevent duplicate master entries
      const existing = db_instance.getFirstSync('SELECT * FROM master LIMIT 1');
      if (existing) {
        Alert.alert('Error', 'Vault already exists. Please log in instead.');
        navigation.replace('Login');
        return;
      }

      const passwordHash = await hashPassword(masterPassword);
      const pinHash = await hashPassword(pin);
      db_instance.runSync(
        'INSERT INTO master (password_hash, pin_hash) VALUES (?, ?)',
        [passwordHash, pinHash]
      );
      Alert.alert('✅ Vault Created', 'Your vault has been created successfully!', [
        { text: 'Continue', onPress: () => navigation.replace('Login') }
      ]);
    } catch (err) {
      console.log('Setup error:', err);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner}>
        <Text style={styles.logo}>VAULT<Text style={styles.logoAI}>_AI</Text></Text>
        <Text style={styles.subtitle}>Create your vault</Text>
        <Text style={styles.description}>
          Your master password and PIN are used to encrypt and protect your vault.
          They never leave your device.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Master Password (min 8 characters)"
          placeholderTextColor="#666"
          secureTextEntry
          value={masterPassword}
          onChangeText={setMasterPassword}
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm Master Password"
          placeholderTextColor="#666"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="PIN (min 4 digits)"
          placeholderTextColor="#666"
          secureTextEntry
          keyboardType="numeric"
          maxLength={6}
          value={pin}
          onChangeText={setPin}
          editable={!loading}
        />
        <TextInput
          style={styles.input}
          placeholder="Confirm PIN"
          placeholderTextColor="#666"
          secureTextEntry
          keyboardType="numeric"
          maxLength={6}
          value={confirmPin}
          onChangeText={setConfirmPin}
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSetup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0a0a0a" size="small" />
          ) : (
            <Text style={styles.buttonText}>Create Vault</Text>
          )}
        </TouchableOpacity>
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
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingVertical: 50,
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
    fontSize: 20,
    color: '#ffffff',
    marginBottom: 12,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 20,
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
});