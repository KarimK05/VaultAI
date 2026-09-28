import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import axios from 'axios';
import { GEMINI_URL } from '../config';

const MIN_LENGTH = 8;
const MAX_LENGTH = 128;

const SYSTEM_PROMPT = `You are a password security assistant.
The app generates passwords locally using cryptographically secure random bytes.
Your job is only to explain why the selected settings are strong.
Do not generate passwords.
Do not ask for passwords.
Respond with ONLY a JSON object in this exact format:
{"explanation":"brief explanation here"}`;

export default function PasswordGeneratorScreen() {
  const [context, setContext] = useState('');
  const [length, setLength] = useState('16');
  const [includeSymbols, setIncludeSymbols] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [includeUppercase, setIncludeUppercase] = useState(true);
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [explanation, setExplanation] = useState('');
  const [loading, setLoading] = useState(false);

  const getSecureRandomIndex = async (max) => {
    const bytes = await Crypto.getRandomBytesAsync(4);
    const randomNumber =
      bytes[0] * 256 ** 3 +
      bytes[1] * 256 ** 2 +
      bytes[2] * 256 +
      bytes[3];

    return randomNumber % max;
  };

  const secureShuffle = async (array) => {
    const shuffled = [...array];

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = await getSecureRandomIndex(i + 1);
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }

    return shuffled;
  };

  const validateLength = () => {
    const parsedLength = parseInt(length, 10);

    if (Number.isNaN(parsedLength)) {
      Alert.alert('Invalid Length', 'Please enter a valid password length.');
      return null;
    }

    if (parsedLength < MIN_LENGTH) {
      Alert.alert('Invalid Length', `Password length must be at least ${MIN_LENGTH} characters.`);
      return null;
    }

    if (parsedLength > MAX_LENGTH) {
      Alert.alert('Invalid Length', `Password length cannot exceed ${MAX_LENGTH} characters.`);
      return null;
    }

    return parsedLength;
  };

  const generateLocalSecurePassword = async (passwordLength) => {
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

    let charset = lowercase;
    const requiredSets = [lowercase];

    if (includeUppercase) {
      charset += uppercase;
      requiredSets.push(uppercase);
    }

    if (includeNumbers) {
      charset += numbers;
      requiredSets.push(numbers);
    }

    if (includeSymbols) {
      charset += symbols;
      requiredSets.push(symbols);
    }

    const passwordChars = [];

    for (const set of requiredSets) {
      const index = await getSecureRandomIndex(set.length);
      passwordChars.push(set[index]);
    }

    for (let i = passwordChars.length; i < passwordLength; i++) {
      const index = await getSecureRandomIndex(charset.length);
      passwordChars.push(charset[index]);
    }

    const shuffledPassword = await secureShuffle(passwordChars);
    return shuffledPassword.join('');
  };

  const getLocalExplanation = (passwordLength) => {
    const options = [];

    if (includeUppercase) options.push('uppercase letters');
    if (includeNumbers) options.push('numbers');
    if (includeSymbols) options.push('symbols');

    const optionsText = options.length > 0
      ? options.join(', ')
      : 'lowercase letters only';

    return `Generated locally using cryptographically secure random bytes. The password is ${passwordLength} characters long and includes ${optionsText}.`;
  };

  const getAIExplanation = async (passwordLength) => {
    const prompt = `Explain why these password settings are strong:
Context: ${context.trim() || 'general use'}
Length: ${passwordLength}
Includes uppercase: ${includeUppercase}
Includes numbers: ${includeNumbers}
Includes symbols: ${includeSymbols}

Do not generate a password. Give one short explanation and one recommendation.`;

    const response = await axios.post(GEMINI_URL, {
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 200
      }
    });

    const text = response.data.candidates[0].content.parts[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return parsed.explanation;
  };

  const handleGenerate = async () => {
    const passwordLength = validateLength();
    if (!passwordLength) return;

    setLoading(true);
    setGeneratedPassword('');
    setExplanation('');

    try {
      const password = await generateLocalSecurePassword(passwordLength);
      setGeneratedPassword(password);

      if (context.trim()) {
        try {
          const aiExplanation = await getAIExplanation(passwordLength);
          setExplanation(aiExplanation);
        } catch (aiErr) {
          console.log('AI explanation error:', aiErr.response?.data || aiErr.message);
          setExplanation(getLocalExplanation(passwordLength) + ' AI explanation unavailable, so local explanation was used.');
        }
      } else {
        setExplanation(getLocalExplanation(passwordLength));
      }
    } catch (err) {
      console.log('Generation error:', err);
      Alert.alert('Error', 'Could not generate password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!generatedPassword) return;

    await Clipboard.setStringAsync(generatedPassword);
    Alert.alert('Copied!', 'Password copied to clipboard. It will clear in 30 seconds.');

    setTimeout(async () => {
      try {
        await Clipboard.setStringAsync('');
      } catch (err) {
        console.log('Clipboard clear error:', err);
      }
    }, 30000);
  };

  const ToggleButton = ({ label, value, onToggle }) => (
    <TouchableOpacity
      style={[styles.toggle, value && styles.toggleActive]}
      onPress={onToggle}
      disabled={loading}
    >
      <Text style={[styles.toggleText, value && styles.toggleTextActive]}>
        {value ? '✓' : '✗'} {label}
      </Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
      <Text style={styles.title}>Password Generator</Text>
      <Text style={styles.subtitle}>
        Generate strong passwords locally using secure random bytes
      </Text>

      <View style={styles.securityNote}>
        <Text style={styles.securityNoteText}>
          🔒 Passwords are generated on your device using Expo Crypto. AI is only used for explanation when context is provided.
        </Text>
      </View>

      <Text style={styles.label}>What is this password for? (optional)</Text>
      <TextInput
        style={styles.input}
        placeholder="e.g. banking, Netflix, work email..."
        placeholderTextColor="#666"
        value={context}
        onChangeText={setContext}
        autoCapitalize="none"
        editable={!loading}
      />

      <Text style={styles.label}>Password Length</Text>
      <TextInput
        style={styles.input}
        placeholder="16"
        placeholderTextColor="#666"
        value={length}
        onChangeText={setLength}
        keyboardType="numeric"
        maxLength={3}
        editable={!loading}
      />

      <Text style={styles.label}>Include</Text>
      <View style={styles.toggleRow}>
        <ToggleButton
          label="Uppercase"
          value={includeUppercase}
          onToggle={() => setIncludeUppercase(!includeUppercase)}
        />
        <ToggleButton
          label="Numbers"
          value={includeNumbers}
          onToggle={() => setIncludeNumbers(!includeNumbers)}
        />
        <ToggleButton
          label="Symbols"
          value={includeSymbols}
          onToggle={() => setIncludeSymbols(!includeSymbols)}
        />
      </View>

      <TouchableOpacity
        style={[styles.generateButton, loading && styles.generateButtonDisabled]}
        onPress={handleGenerate}
        disabled={loading}
      >
        {loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#0a0a0a" size="small" />
            <Text style={[styles.generateButtonText, { marginLeft: 8 }]}>
              Generating...
            </Text>
          </View>
        ) : (
          <Text style={styles.generateButtonText}>
            {context.trim()
              ? '🤖 Generate Secure Password + AI Explanation'
              : '⚡ Generate Secure Password'}
          </Text>
        )}
      </TouchableOpacity>

      {generatedPassword !== '' && (
        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>Generated Password</Text>

          <Text style={styles.resultPassword} selectable>
            {generatedPassword}
          </Text>

          {explanation !== '' && (
            <Text style={styles.resultExplanation}>
              {explanation}
            </Text>
          )}

          <TouchableOpacity style={styles.copyButton} onPress={handleCopy}>
            <Text style={styles.copyButtonText}>Copy to Clipboard</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.regenerateButton}
            onPress={handleGenerate}
            disabled={loading}
          >
            <Text style={styles.regenerateButtonText}>↺ Regenerate</Text>
          </TouchableOpacity>
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
    marginBottom: 8,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
  },
  securityNote: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#222',
    marginBottom: 20,
  },
  securityNoteText: {
    color: '#888',
    fontSize: 12,
    lineHeight: 18,
  },
  label: {
    color: '#666',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    color: '#ffffff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  toggle: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#333',
    marginRight: 8,
    marginBottom: 8,
  },
  toggleActive: {
    backgroundColor: '#00ff9d22',
    borderColor: '#00ff9d',
  },
  toggleText: {
    color: '#666',
    fontSize: 13,
    fontWeight: 'bold',
  },
  toggleTextActive: {
    color: '#00ff9d',
  },
  generateButton: {
    backgroundColor: '#00ff9d',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  generateButtonDisabled: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#333',
  },
  generateButtonText: {
    color: '#0a0a0a',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  resultBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 20,
    marginTop: 24,
    borderWidth: 1,
    borderColor: '#333',
  },
  resultLabel: {
    color: '#666',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  resultPassword: {
    color: '#00ff9d',
    fontSize: 20,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 12,
    lineHeight: 28,
  },
  resultExplanation: {
    color: '#888',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  copyButton: {
    backgroundColor: '#00ff9d',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  copyButtonText: {
    color: '#0a0a0a',
    fontWeight: 'bold',
    fontSize: 15,
  },
  regenerateButton: {
    padding: 14,
    alignItems: 'center',
  },
  regenerateButtonText: {
    color: '#666',
    fontSize: 15,
  },
});