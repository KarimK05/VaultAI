import React, { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, ScrollView, ActivityIndicator
} from 'react-native';
import axios from 'axios';
import { GEMINI_URL } from '../config';

const getPasswordStrength = (password) => {
    if (!password) return null;
    let score = 0;
    const feedback = [];

    if (password.length >= 8) score++;
    else feedback.push('Use at least 8 characters');

    if (password.length >= 12) score++;
    else if (password.length >= 8) feedback.push('Use at least 12 characters for better security');

    if (password.length >= 16) score++;
    else if (password.length >= 12) feedback.push('Use 16+ characters for maximum security');

    if (/[A-Z]/.test(password)) score++;
    else feedback.push('Add uppercase letters (A-Z)');

    if (/[a-z]/.test(password)) score++;
    else feedback.push('Add lowercase letters (a-z)');

    if (/[0-9]/.test(password)) score++;
    else feedback.push('Add numbers (0-9)');

    if (/[^A-Za-z0-9]/.test(password)) score++;
    else feedback.push('Add symbols (!@#$%^&*)');

    // Pattern detection
    if (/^[a-zA-Z]+\d+$/.test(password)) feedback.push('Avoid simple word+number patterns');
    if (/(.)\1{2,}/.test(password)) feedback.push('Avoid repeated characters');
    if (/^[A-Z][a-z]+\d+[^a-zA-Z0-9]?$/.test(password)) feedback.push('Avoid capitalized word + number patterns');

    let label, color, percentage;
    if (score <= 3) { label = 'Weak'; color = '#ff6b6b'; percentage = 25; }
    else if (score <= 5) { label = 'Medium'; color = '#ffeaa7'; percentage = 60; }
    else if (score <= 6) { label = 'Strong'; color = '#00ff9d'; percentage = 85; }
    else { label = 'Very Strong'; color = '#00ff9d'; percentage = 100; }

    return { label, color, percentage, score, feedback };
};

export default function PasswordStrengthScreen() {
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState('');
    const [loading, setLoading] = useState(false);

    const strength = getPasswordStrength(password);

    const handleAIAnalysis = async () => {
        if (!password) return;
        setLoading(true);
        setAiAnalysis('');
        try {
            const prompt = `Analyze this password's security WITHOUT revealing it. Password characteristics:
- Length: ${password.length}
- Has uppercase: ${/[A-Z]/.test(password)}
- Has lowercase: ${/[a-z]/.test(password)}
- Has numbers: ${/[0-9]/.test(password)}
- Has symbols: ${/[^A-Za-z0-9]/.test(password)}
- Starts with capital: ${/^[A-Z]/.test(password)}
- Ends with number: ${/\d$/.test(password)}
- Has repeated chars: ${/(.)\1{2,}/.test(password)}
- Contains common patterns: ${/(?:password|123|abc|qwerty)/i.test(password)}

Provide a brief security analysis and 2-3 specific improvements. Be concise.`;

            const response = await axios.post(GEMINI_URL, {
                system_instruction: { parts: [{ text: 'You are a password security expert. Analyze password strength based on characteristics only, never ask for or repeat the actual password.' }] },
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.3, maxOutputTokens: 300 }
            });

            setAiAnalysis(response.data.candidates[0].content.parts[0].text);
        } catch (err) {
            console.log('AI analysis error:', err);
            setAiAnalysis('AI analysis unavailable. Check your connection.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.inner}>
            <Text style={styles.title}>Password Strength</Text>
            <Text style={styles.subtitle}>Check how strong your password is</Text>

            {/* Input */}
            <View style={styles.inputRow}>
                <TextInput
                    style={styles.input}
                    placeholder="Enter a password to analyze..."
                    placeholderTextColor="#666"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    autoCapitalize="none"
                />
                <TouchableOpacity
                    style={styles.eyeButton}
                    onPress={() => setShowPassword(!showPassword)}
                >
                    <Text style={styles.eyeText}>{showPassword ? '🙈' : '👁️'}</Text>
                </TouchableOpacity>
            </View>

            {/* Strength Meter */}
            {strength && (
                <>
                    <View style={styles.meterContainer}>
                        <View style={styles.meterBackground}>
                            <View style={[styles.meterFill, {
                                width: `${strength.percentage}%`,
                                backgroundColor: strength.color
                            }]} />
                        </View>
                        <Text style={[styles.strengthLabel, { color: strength.color }]}>
                            {strength.label}
                        </Text>
                    </View>

                    {/* Score */}
                    <View style={styles.scoreBox}>
                        <Text style={styles.scoreTitle}>Security Score</Text>
                        <Text style={[styles.scoreValue, { color: strength.color }]}>
                            {strength.score}/7
                        </Text>
                    </View>

                    {/* Checklist */}
                    <View style={styles.checklistBox}>
                        <Text style={styles.checklistTitle}>Password Criteria</Text>
                        {[
                            { label: 'At least 8 characters', pass: password.length >= 8 },
                            { label: 'At least 12 characters', pass: password.length >= 12 },
                            { label: 'At least 16 characters', pass: password.length >= 16 },
                            { label: 'Uppercase letters (A-Z)', pass: /[A-Z]/.test(password) },
                            { label: 'Lowercase letters (a-z)', pass: /[a-z]/.test(password) },
                            { label: 'Numbers (0-9)', pass: /[0-9]/.test(password) },
                            { label: 'Symbols (!@#$%)', pass: /[^A-Za-z0-9]/.test(password) },
                        ].map((item, index) => (
                            <View key={index} style={styles.checklistItem}>
                                <Text style={[styles.checklistIcon, { color: item.pass ? '#00ff9d' : '#ff6b6b' }]}>
                                    {item.pass ? '✓' : '✗'}
                                </Text>
                                <Text style={[styles.checklistText, { color: item.pass ? '#ffffff' : '#666' }]}>
                                    {item.label}
                                </Text>
                            </View>
                        ))}
                    </View>

                    {/* Feedback */}
                    {strength.feedback.length > 0 && (
                        <View style={styles.feedbackBox}>
                            <Text style={styles.feedbackTitle}>⚡ Improvements</Text>
                            {strength.feedback.map((tip, index) => (
                                <Text key={index} style={styles.feedbackItem}>• {tip}</Text>
                            ))}
                        </View>
                    )}

                    {/* AI Analysis Button */}
                    <TouchableOpacity
                        style={[styles.aiButton, loading && styles.aiButtonDisabled]}
                        onPress={handleAIAnalysis}
                        disabled={loading}
                    >
                        {loading ? (
                            <ActivityIndicator color="#0a0a0a" size="small" />
                        ) : (
                            <Text style={styles.aiButtonText}>🤖 Get AI Analysis</Text>
                        )}
                    </TouchableOpacity>

                    {/* AI Analysis Result */}
                    {aiAnalysis !== '' && (
                        <View style={styles.aiResultBox}>
                            <Text style={styles.aiResultTitle}>🤖 AI Security Analysis</Text>
                            <Text style={styles.aiResultText}>{aiAnalysis}</Text>
                        </View>
                    )}
                </>
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
        marginBottom: 32,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#333',
        marginBottom: 24,
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
    meterContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
        gap: 12,
    },
    meterBackground: {
        flex: 1,
        height: 8,
        backgroundColor: '#333',
        borderRadius: 4,
        overflow: 'hidden',
    },
    meterFill: {
        height: 8,
        borderRadius: 4,
    },
    strengthLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        width: 80,
    },
    scoreBox: {
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#333',
    },
    scoreTitle: {
        color: '#666',
        fontSize: 14,
    },
    scoreValue: {
        fontSize: 24,
        fontWeight: 'bold',
    },
    checklistBox: {
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#333',
    },
    checklistTitle: {
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 12,
    },
    checklistItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 10,
    },
    checklistIcon: {
        fontSize: 16,
        fontWeight: 'bold',
        width: 20,
    },
    checklistText: {
        fontSize: 14,
    },
    feedbackBox: {
        backgroundColor: '#1a1a0a',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#ffeaa7',
    },
    feedbackTitle: {
        color: '#ffeaa7',
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    feedbackItem: {
        color: '#888',
        fontSize: 13,
        marginBottom: 4,
        lineHeight: 20,
    },
    aiButton: {
        backgroundColor: '#00ff9d',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginBottom: 16,
    },
    aiButtonDisabled: {
        backgroundColor: '#1a1a1a',
        borderWidth: 1,
        borderColor: '#333',
    },
    aiButtonText: {
        color: '#0a0a0a',
        fontSize: 16,
        fontWeight: 'bold',
    },
    aiResultBox: {
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#333',
    },
    aiResultTitle: {
        color: '#00ff9d',
        fontSize: 14,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    aiResultText: {
        color: '#cccccc',
        fontSize: 14,
        lineHeight: 22,
    },
});