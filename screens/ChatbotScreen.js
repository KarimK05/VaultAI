import React, { useState, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, FlatList, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import axios from 'axios';
import { db_instance } from '../database/db';
import { decryptPassword } from '../crypto/encryption';
import { useMLAnomalyDetection } from '../hooks/useMLAnomalyDetection';
import { GEMINI_URL } from '../config';

const SYSTEM_PROMPT = `You are VaultAI, a security-focused assistant built into a password manager app. 
You help users with:
- Generating strong passwords based on context (banking, social media, email, etc.)
- Analyzing password strength and identifying weak patterns
- Security advice and password hygiene tips
- Detecting phishing URLs when users paste them
- Searching their vault using natural language

Rules you must follow:
- NEVER ask for or store actual passwords
- If a user pastes what looks like a real password, warn them not to share real passwords
- Keep responses short, friendly and human-like
- Stay on topic - only help with password security related questions
- If asked something unrelated, politely redirect to password security topics
- For banking accounts always recommend 16+ character passwords
- Always identify weak human patterns like seasons, years, names, keyboard walks (qwerty, 12345)`;

const getPasswordMetadata = async (masterKey) => {
  try {
    const items = db_instance.getAllSync('SELECT * FROM vault');

    const decryptedItems = await Promise.all(items.map(async (item) => {
      const decrypted = await decryptPassword(item.password, masterKey);
      return { ...item, decrypted };
    }));

    const passwordCounts = decryptedItems.reduce((acc, item) => {
      acc[item.decrypted] = (acc[item.decrypted] || 0) + 1;
      return acc;
    }, {});

    return decryptedItems.map(item => ({
      title: item.title,
      category: item.category || 'general',
      length: item.decrypted.length,
      hasUppercase: /[A-Z]/.test(item.decrypted),
      hasLowercase: /[a-z]/.test(item.decrypted),
      hasNumbers: /[0-9]/.test(item.decrypted),
      hasSymbols: /[^A-Za-z0-9]/.test(item.decrypted),
      isReused: passwordCounts[item.decrypted] > 1,
      reusedCount: passwordCounts[item.decrypted],
      breach_count: item.breach_count || 0,
    }));
  } catch (err) {
    console.log('Metadata error:', err);
    return [];
  }
};

export default function ChatbotScreen({ navigation, route }) {
  const { masterKey } = route.params;
  const { getMLStats } = useMLAnomalyDetection(() => { });
  const [messages, setMessages] = useState([
    {
      id: '1',
      role: 'assistant',
      text: 'Hey! I\'m VaultAI 🔐\n\nI can help you:\n• Generate strong passwords\n• Analyze password strength\n• Give security tips\n• Detect phishing URLs\n• Search your vault\n• Audit your entire vault\n\nWhat would you like to do?'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const flatListRef = useRef(null);

  const handleMLStatus = () => {
    const stats = getMLStats();
    let message = '';
    if (!stats.hasBaseline) {
      message = `🤖 ML Anomaly Detection Status\n\nCurrently in learning mode.\n\nSessions logged: ${stats.sessionCount}/${5}\nSessions needed before ML activates: ${stats.sessionsNeeded}\n\nKeep using the app and the ML system will automatically build your personal behavioral baseline.`;
    } else {
      const b = stats.baseline;
      message = `🤖 ML Anomaly Detection Status\n\nStatus: ✅ Active\nSessions analyzed: ${stats.sessionCount}\n\nYour behavioral baseline:\n• Typical access hour: ${Math.round(b.hourStats.mean)}:00 (±${b.hourStats.stdDev.toFixed(1)}h)\n• Avg passwords viewed: ${b.viewStats.mean.toFixed(1)} (±${b.viewStats.stdDev.toFixed(1)})\n• Avg session duration: ${Math.round(b.durationStats.mean)}s (±${b.durationStats.stdDev.toFixed(1)}s)\n• Avg failed PINs: ${b.pinStats.mean.toFixed(2)}\n\nZ-score threshold: 2.0\nAny session deviating beyond 2 standard deviations from your baseline will be flagged.`;
    }
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      text: message
    }]);
  };

  const getVaultMetadata = () => {
    try {
      const result = db_instance.getAllSync('SELECT id, title, category, username, created_at FROM vault');
      return result.map(item => ({
        id: item.id,
        title: item.title,
        category: item.category || 'general',
        username: item.username || '',
        created_at: item.created_at,
      }));
    } catch (err) {
      return [];
    }
  };

  const handleSearch = async (userMessage) => {
    const lowerMsg = userMessage.toLowerCase();
    const isSearchQuery =
      (lowerMsg.includes('show me my') ||
        lowerMsg.includes('find my') ||
        lowerMsg.includes('get my') ||
        lowerMsg.includes('what is my') ||
        lowerMsg.includes('retrieve my') ||
        lowerMsg.includes('give me my') ||
        lowerMsg.includes('whats my') ||
        lowerMsg.includes("what's my") ||
        lowerMsg.includes('tell me my') ||
        lowerMsg.includes('password for my') ||
        lowerMsg.includes('password for')) &&
      !lowerMsg.includes('generate') &&
      !lowerMsg.includes('create') &&
      !lowerMsg.includes('make') &&
      !lowerMsg.includes('strong') &&
      !lowerMsg.includes('suggest');

    if (!isSearchQuery) return null;

    const vaultItems = getVaultMetadata();
    const stopWords = ['show', 'find', 'get', 'my', 'password', 'for', 'what', 'is', 'retrieve', 'me', 'the', 'a', 'an', 'give', 'whats', 'tell', 'again'];
    const keywords = lowerMsg.split(' ').filter(w => w.length > 1 && !stopWords.includes(w));

    for (const keyword of keywords) {
      const match = vaultItems.find(item =>
        item.title.toLowerCase().includes(keyword) ||
        item.category?.toLowerCase().includes(keyword)
      );
      if (match) {
        const fullItem = db_instance.getFirstSync('SELECT * FROM vault WHERE id = ?', [match.id]);
        const decrypted = await decryptPassword(fullItem.password, masterKey);
        return `I found **${match.title}** in your vault.\n\n👤 Username: ${match.username || 'N/A'}\n📁 Category: ${match.category || 'General'}\n\nFor security, I won’t display the password inside chat. Please open the vault entry to view or copy it.`;
      }
    }
    return null;
  };

  const handleSecurityAudit = async () => {
    const vaultItems = getVaultMetadata();
    if (vaultItems.length === 0) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        text: 'Your vault is empty! Add some passwords first and then I can audit them for you. 🔐'
      }]);
      return;
    }

    // Check audit cache first (5 minute cooldown)
    try {
      const cached = db_instance.getFirstSync(
        'SELECT * FROM audit_cache ORDER BY created_at DESC LIMIT 1'
      );
      if (cached) {
        const cacheAge = Date.now() - new Date(cached.created_at).getTime();
        const fiveMinutes = 5 * 60 * 1000;
        if (cacheAge < fiveMinutes) {
          const minutesLeft = Math.ceil((fiveMinutes - cacheAge) / 60000);
          setMessages(prev => [...prev, {
            id: Date.now().toString(),
            role: 'assistant',
            text: `📋 Here's your last audit (${minutesLeft} min until refresh):\n\n${cached.result}`
          }]);
          return;
        }
      }
    } catch (err) {
      console.log('Cache check error:', err);
    }

    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'user',
      text: '🛡️ Run a security audit on my vault'
    }]);
    setLoading(true);

    try {
      const metadata = await getPasswordMetadata(masterKey);

      // Group passwords locally first
      const critical = [];
      const warning = [];
      const secure = [];

      for (const item of metadata) {
        const isCritical = item.breach_count > 0 || item.length < 8;
        const isWarning = !isCritical && (
          item.isReused ||
          !item.hasSymbols ||
          !item.hasNumbers ||
          !item.hasUppercase
        );

        if (isCritical) critical.push(item);
        else if (isWarning) warning.push(item);
        else secure.push(item);
      }

      // If everything is perfect, skip Gemini entirely
      if (critical.length === 0 && warning.length === 0) {
        const perfectResult = `✅ Your vault looks great!\n\n🔒 All ${secure.length} passwords passed the local security check:\n• No breached passwords\n• No reused passwords\n• All passwords have good length and complexity\n\nKeep it up! Remember to update your passwords regularly.`;

        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          text: '🛡️ VAULT SECURITY AUDIT\n\n' + perfectResult
        }]);

        // Cache the result
        try {
          db_instance.runSync('DELETE FROM audit_cache');
          db_instance.runSync(
            'INSERT INTO audit_cache (result, created_at) VALUES (?, ?)',
            [perfectResult, new Date().toISOString()]
          );
        } catch (err) {
          console.log('Cache save error:', err);
        }
        return;
      }

      const auditPrompt = `Please audit these password vault entries. I have already grouped them locally:

CRITICAL (${critical.length} items - breached or too short):
${critical.map(item => `• ${item.title} (${item.category}): length=${item.length}, breached=${item.breach_count > 0 ? `yes (${item.breach_count} times)` : 'no'}`).join('\n') || 'None'}

WARNING (${warning.length} items - reused or missing complexity):
${warning.map(item => `• ${item.title} (${item.category}): length=${item.length}, reused=${item.isReused}, hasSymbols=${item.hasSymbols}, hasNumbers=${item.hasNumbers}`).join('\n') || 'None'}

SECURE (${secure.length} items) - already verified locally, no need to audit these.

Please provide:
1. Overall vault security score out of 10
2. Brief analysis of the Critical and Warning items only
3. Top 3 specific recommendations
Keep it concise.`;

      const response = await axios.post(GEMINI_URL, {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: auditPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1000 }
      });

      const auditResult = response.data.candidates[0].content.parts[0].text;
      const fullResult = `📊 Summary: ${critical.length} Critical, ${warning.length} Warning, ${secure.length} Secure\n\n${auditResult}`;

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        text: '🛡️ VAULT SECURITY AUDIT\n\n' + fullResult
      }]);

      // Cache the result
      try {
        db_instance.runSync('DELETE FROM audit_cache');
        db_instance.runSync(
          'INSERT INTO audit_cache (result, created_at) VALUES (?, ?)',
          [fullResult, new Date().toISOString()]
        );
      } catch (err) {
        console.log('Cache save error:', err);
      }

    } catch (err) {
      console.log('Audit error:', err.response?.data || err.message);
      Alert.alert('Error', 'Could not complete audit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setLoading(true);

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      text: userMessage
    };

    setMessages(prev => [...prev, userMsg]);

    try {
      const searchResult = await handleSearch(userMessage);
      if (searchResult) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          text: searchResult
        }]);
        return;
      }

      const vaultMetadata = getVaultMetadata();
      const vaultContext = vaultMetadata.length > 0
        ? `\n\nUser's vault has ${vaultMetadata.length} items.`
        : '';

      const response = await axios.post(GEMINI_URL, {
        system_instruction: { parts: [{ text: SYSTEM_PROMPT + vaultContext }] },
        contents: messages.slice(-6).map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.text }]
        })).concat([{ role: 'user', parts: [{ text: userMessage }] }]),
        generationConfig: { temperature: 0.7, maxOutputTokens: 500 }
      });

      const assistantText = response.data.candidates[0].content.parts[0].text;
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        text: assistantText
      }]);
    } catch (err) {
      console.log('Chatbot error:', err.response?.data || err.message);
      Alert.alert('Error', 'AI is unavailable. Check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    { label: '🔑 Generate Password', message: 'Generate a strong password for me', isAudit: false },
    { label: '🛡️ Security Audit', message: '', isAudit: true },
    { label: '🤖 ML Status', message: '', isAudit: false, isML: true },
    { label: '🔍 Check URL', message: 'I want to check if a URL is safe', isAudit: false },
    { label: '💡 Security Tips', message: 'Give me some password security tips', isAudit: false },
  ];

  return (
    <View style={styles.container}>
      {/* KeyboardAvoidingView wraps the whole UI logic */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Header with Notch Padding */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>VAULT<Text style={styles.headerAI}>_AI</Text></Text>
          <View style={styles.onlineIndicator}>
            <View style={styles.onlineDot} /><Text style={styles.onlineText}>Online</Text>
          </View>
        </View>

        {/* Fix #5: Scroll behavior */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <View style={[styles.messageBubble, item.role === 'user' ? styles.userBubble : styles.assistantBubble]}>
              <Text selectable style={item.role === 'user' ? styles.userText : styles.assistantText}>{item.text}</Text>
            </View>
          )}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
          keyboardShouldPersistTaps="handled"
        />

        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color="#00ff9d" size="small" />
            <Text style={styles.loadingText}>VaultAI is thinking...</Text>
          </View>
        )}

        {/* Restored Quick Actions */}
        <View style={styles.quickActions}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={quickActions}
            keyExtractor={item => item.label}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.quickAction}
                onPress={() => {
                  if (item.isAudit) handleSecurityAudit();
                  else if (item.isML) handleMLStatus();
                  else setInput(item.message);
                }}
              >
                <Text style={styles.quickActionText}>{item.label}</Text>
              </TouchableOpacity>
            )}
          />
        </View>

        {/* Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Ask VaultAI anything..."
            placeholderTextColor="#666"
            value={input}
            onChangeText={setInput}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || loading}
          >
            <Text style={styles.sendButtonText}>→</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40, // Restore notch padding
    paddingBottom: 15
  },
  backButton: { color: '#00ff9d', fontSize: 16 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff' },
  headerAI: { color: '#00ff9d' },
  onlineIndicator: { flexDirection: 'row', alignItems: 'center' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#00ff9d', marginRight: 4 },
  onlineText: { color: '#00ff9d', fontSize: 12 },
  messagesList: { paddingHorizontal: 16, paddingBottom: 20 },
  messageBubble: { maxWidth: '80%', borderRadius: 16, padding: 12, marginBottom: 10 },
  userBubble: { backgroundColor: '#00ff9d', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  assistantBubble: { backgroundColor: '#1a1a1a', alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#333' },
  userText: { color: '#0a0a0a', fontSize: 15 },
  assistantText: { color: '#ffffff', fontSize: 15, lineHeight: 22 },
  loadingContainer: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingBottom: 10 },
  loadingText: { color: '#666', marginLeft: 8 },
  quickActions: { paddingVertical: 10, paddingLeft: 10 },
  quickAction: { backgroundColor: '#1a1a1a', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, borderWidth: 1, borderColor: '#333' },
  quickActionText: { color: '#ffffff', fontSize: 13 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderColor: '#222', backgroundColor: '#0a0a0a' },
  input: { flex: 1, backgroundColor: '#1a1a1a', borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, color: '#ffffff', marginRight: 10, maxHeight: 100 },
  sendButton: { backgroundColor: '#00ff9d', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: '#1a1a1a' },
  sendButtonText: { color: '#0a0a0a', fontSize: 20, fontWeight: 'bold' },
});