import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    StyleSheet, FlatList, Alert, Modal,
    KeyboardAvoidingView, Platform, ScrollView,
    ActivityIndicator
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as LocalAuthentication from 'expo-local-authentication';
import { db_instance } from '../database/db';
import { encryptPassword, decryptPassword, clearKeyCache, verifyPassword } from '../crypto/encryption';
import { checkPasswordBreach } from '../crypto/hibp';
import { useAutoLock } from '../hooks/useAutoLock';
import { useMLAnomalyDetection } from '../hooks/useMLAnomalyDetection';
import { useAnomalyDetection } from '../hooks/useAnomalyDetection';

export default function VaultScreen({ navigation, route }) {
    const { masterKey } = route.params;
    const [passwords, setPasswords] = useState([]);
    const [search, setSearch] = useState('');
    const [modalVisible, setModalVisible] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [decryptedPassword, setDecryptedPassword] = useState('');
    const [addModal, setAddModal] = useState(false);
    const [editModal, setEditModal] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newCategory, setNewCategory] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [saving, setSaving] = useState(false);
    const [lockModal, setLockModal] = useState(false);
    const [lockPin, setLockPin] = useState('');
    const [lockError, setLockError] = useState('');
    const [cooldownActive, setCooldownActive] = useState(false);
    const [cooldownSeconds, setCooldownSeconds] = useState(0);

    const handleLock = useCallback(() => {
        logAndAnalyzeSession();
        clearKeyCache();
        setModalVisible(false);
        setAddModal(false);
        setEditModal(false);
        setShowPassword(false);
        setDecryptedPassword('');
        setLockPin('');
        setLockError('');
        setLockModal(true);
    }, [logAndAnalyzeSession]);

    const { resetTimer, clearTimer } = useAutoLock(handleLock);
    const {
        recordRetrieval,
        recordFailedPin,
        resetFailedPins,
        isCooldownActive,
        checkUnusualHours,
    } = useAnomalyDetection(handleLock);

    const {
        recordPasswordView,
        recordFailedPinML,
        logAndAnalyzeSession,
    } = useMLAnomalyDetection(handleLock);

    useEffect(() => {
        loadPasswords();
        checkUnusualHours();
    }, []);

    const startCooldown = (seconds) => {
        setCooldownActive(true);
        setCooldownSeconds(seconds);
        const interval = setInterval(() => {
            setCooldownSeconds(prev => {
                if (prev <= 1) {
                    clearInterval(interval);
                    setCooldownActive(false);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const handleUnlock = async () => {
        if (isCooldownActive()) {
            setLockError(`Too many attempts. Please wait ${cooldownSeconds} seconds.`);
            return;
        }
        try {
            const result = db_instance.getFirstSync('SELECT * FROM master LIMIT 1');
            const pinMatch = await verifyPassword(lockPin, result.pin_hash);
            if (pinMatch) {
                setLockModal(false);
                setLockPin('');
                setLockError('');
                resetFailedPins();
                resetTimer();
            } else {
                const lockedOut = recordFailedPin();
                if (lockedOut) {
                    recordFailedPinML();
                    setLockPin('');
                    setLockError('Too many attempts. Wait 30 seconds.');
                    startCooldown(30);
                } else {
                    recordFailedPinML();
                    setLockPin('');
                    setLockError('Incorrect PIN. Try again.');
                }
            }
        } catch (err) {
            console.log('Unlock error:', err);
            setLockError('Something went wrong.');
        }
    };

    const handleBiometricUnlock = async () => {
        try {
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: 'Unlock VaultAI',
                fallbackLabel: 'Use PIN Instead',
                disableDeviceFallback: false,
            });
            if (result.success) {
                setLockModal(false);
                setLockPin('');
                setLockError('');
                resetFailedPins();
                resetTimer();
            } else {
                setLockError('Biometric failed. Try your PIN.');
            }
        } catch (err) {
            console.log('Biometric unlock error:', err);
            setLockError('Biometric failed. Try your PIN.');
        }
    };

    const loadPasswords = () => {
        try {
            const result = db_instance.getAllSync('SELECT * FROM vault ORDER BY title ASC');
            setPasswords(result);
        } catch (err) {
            console.log('Load error:', err);
        }
    };

    const getPasswordStrength = (password) => {
        if (!password) return null;
        let score = 0;
        if (password.length >= 8) score++;
        if (password.length >= 12) score++;
        if (password.length >= 16) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[a-z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;
        if (score <= 3) return { label: 'Weak', color: '#ff6b6b' };
        if (score <= 5) return { label: 'Medium', color: '#ffeaa7' };
        return { label: 'Strong', color: '#00ff9d' };
    };

    const filteredPasswords = passwords.filter(item =>
        item.title.toLowerCase().includes(search.toLowerCase()) ||
        (item.category && item.category.toLowerCase().includes(search.toLowerCase()))
    );

    const handleAdd = async () => {
        if (!newTitle || !newPassword) {
            Alert.alert('Error', 'Title and password are required');
            return;
        }
        resetTimer();
        setSaving(true);
        try {
            const breachResult = await checkPasswordBreach(newPassword);
            if (!breachResult.checked) {
                Alert.alert(
                    '⚠️ Breach Check Failed',
                    'Could not connect to breach database. The password will be saved without a breach check.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Save Anyway', onPress: async () => await savePassword(0) }
                    ]
                );
                setSaving(false);
                return;
            }
            if (breachResult.breached) {
                setSaving(false);
                Alert.alert(
                    '⚠️ Password Breached!',
                    `This password has been found in ${breachResult.count.toLocaleString()} data breaches. We strongly recommend using a different password.\n\nDo you still want to save it?`,
                    [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Save Anyway',
                            style: 'destructive',
                            onPress: async () => await savePassword(breachResult.count)
                        }
                    ]
                );
                return;
            }
            await savePassword(0);
        } catch (err) {
            console.log('Add error:', err);
            Alert.alert('Error', 'Something went wrong');
        } finally {
            setSaving(false);
        }
    };

    const savePassword = async (breachCount) => {
        try {
            const encrypted = await encryptPassword(newPassword, masterKey);
            const now = new Date().toISOString();
            db_instance.runSync(
                'INSERT INTO vault (title, username, password, category, url, breach_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                [newTitle, newUsername, encrypted, newCategory, newUrl, breachCount, now, now]
            );
            setAddModal(false);
            setNewTitle('');
            setNewUsername('');
            setNewPassword('');
            setNewCategory('');
            setNewUrl('');
            loadPasswords();
            if (breachCount > 0) {
                Alert.alert('Saved ⚠️', `Password saved but found in ${breachCount.toLocaleString()} breaches. Consider changing it.`);
            } else {
                Alert.alert('✅ Password Saved', 'No breaches found. Your password looks safe!');
            }
        } catch (err) {
            console.log('Save error:', err);
            Alert.alert('Error', 'Something went wrong while saving');
        }
    };

    const openEditModal = async (item) => {
        resetTimer();
        const decrypted = await decryptPassword(item.password, masterKey);
        setNewTitle(item.title);
        setNewUsername(item.username || '');
        setNewPassword(decrypted);
        setNewCategory(item.category || '');
        setNewUrl(item.url || '');
        setModalVisible(false);
        setEditModal(true);
    };

    const handleEdit = async () => {
        if (!newTitle || !newPassword) {
            Alert.alert('Error', 'Title and password are required');
            return;
        }
        resetTimer();
        setSaving(true);
        try {
            const breachResult = await checkPasswordBreach(newPassword);
            if (!breachResult.checked) {
                Alert.alert(
                    '⚠️ Breach Check Failed',
                    'Could not connect to breach database. The password will be saved without a breach check.',
                    [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Save Anyway', onPress: async () => await updatePassword(0) }
                    ]
                );
                setSaving(false);
                return;
            }
            if (breachResult.breached) {
                setSaving(false);
                Alert.alert(
                    '⚠️ Password Breached!',
                    `This password has been found in ${breachResult.count.toLocaleString()} data breaches.\n\nDo you still want to save it?`,
                    [
                        { text: 'Cancel', style: 'cancel' },
                        {
                            text: 'Save Anyway',
                            style: 'destructive',
                            onPress: async () => await updatePassword(breachResult.count)
                        }
                    ]
                );
                return;
            }
            await updatePassword(0);
        } catch (err) {
            console.log('Edit error:', err);
            Alert.alert('Error', 'Something went wrong');
        } finally {
            setSaving(false);
        }
    };

    const updatePassword = async (breachCount) => {
        try {
            const encrypted = await encryptPassword(newPassword, masterKey);
            const now = new Date().toISOString();
            db_instance.runSync(
                'UPDATE vault SET title = ?, username = ?, password = ?, category = ?, url = ?, breach_count = ?, updated_at = ? WHERE id = ?',
                [newTitle, newUsername, encrypted, newCategory, newUrl, breachCount, now, selectedItem.id]
            );
            setEditModal(false);
            setNewTitle('');
            setNewUsername('');
            setNewPassword('');
            setNewCategory('');
            setNewUrl('');
            setSelectedItem(null);
            loadPasswords();
            if (breachCount > 0) {
                Alert.alert('Updated ⚠️', `Password updated but found in ${breachCount.toLocaleString()} breaches.`);
            } else {
                Alert.alert('✅ Updated', 'Password updated successfully!');
            }
        } catch (err) {
            console.log('Update error:', err);
            Alert.alert('Error', 'Something went wrong while updating');
        }
    };

    const handleDelete = (id) => {
        resetTimer();
        Alert.alert('Delete', 'Are you sure you want to delete this?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: () => {
                    db_instance.runSync('DELETE FROM vault WHERE id = ?', [id]);
                    setModalVisible(false);
                    loadPasswords();
                }
            }
        ]);
    };

    const handleCopyPassword = async (item) => {
        resetTimer();
        recordRetrieval();
        recordPasswordView();
        const decrypted = await decryptPassword(item.password, masterKey);
        await Clipboard.setStringAsync(decrypted);
        Alert.alert('Copied!', 'Password copied to clipboard. It will be cleared in 30 seconds.');
        setTimeout(async () => {
            try {
                const currentClipboard = await Clipboard.getStringAsync();
                if (currentClipboard === decrypted) {
                    await Clipboard.setStringAsync('');
                }
            } catch (err) {
                console.log('Clipboard clear error:', err);
            }
        }, 30000);
    };

    const openItem = async (item) => {
        resetTimer();
        setSelectedItem(item);
        setShowPassword(false);
        setDecryptedPassword('');
        setModalVisible(true);
    };

    const handleShowPassword = async () => {
        resetTimer();
        if (!showPassword) {
            recordRetrieval();
            recordPasswordView();
            const decrypted = await decryptPassword(selectedItem.password, masterKey);
            setDecryptedPassword(decrypted);
        } else {
            setDecryptedPassword('');
        }
        setShowPassword(!showPassword);
    };

    const getCategoryColor = (category) => {
        const colors = {
            banking: '#ff6b6b',
            social: '#4ecdc4',
            email: '#45b7d1',
            shopping: '#96ceb4',
            work: '#ffeaa7',
        };
        return colors[category?.toLowerCase()] || '#00ff9d';
    };

    const renderItem = ({ item }) => (
        <TouchableOpacity style={styles.card} onPress={() => openItem(item)}>
            <View style={styles.cardLeft}>
                <View style={[styles.categoryDot, { backgroundColor: getCategoryColor(item.category) }]} />
                <View>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardUsername}>{item.username || 'No username'}</Text>
                </View>
            </View>
            <View style={styles.cardRight}>
                {item.breach_count > 0 && (
                    <View style={styles.breachBadge}>
                        <Text style={styles.breachBadgeText}>⚠️ Breached</Text>
                    </View>
                )}
                <Text style={styles.cardCategory}>{item.category || 'general'}</Text>
            </View>
        </TouchableOpacity>
    );

    const strength = getPasswordStrength(newPassword);

    return (
        <View style={styles.container}>

            {/* Auto-lock Modal */}
            <Modal visible={lockModal} transparent animationType="fade">
                <View style={styles.lockOverlay}>
                    <View style={styles.lockBox}>
                        <Text style={styles.lockIcon}>🔒</Text>
                        <Text style={styles.lockTitle}>Vault Locked</Text>
                        <Text style={styles.lockSubtitle}>Enter your PIN to unlock</Text>
                        <TextInput
                            style={styles.lockInput}
                            placeholder="Enter PIN"
                            placeholderTextColor="#666"
                            secureTextEntry
                            keyboardType="numeric"
                            maxLength={6}
                            value={lockPin}
                            editable={!cooldownActive}
                            onChangeText={(text) => {
                                setLockPin(text);
                                setLockError('');
                            }}
                        />
                        {lockError ? <Text style={styles.lockError}>{lockError}</Text> : null}
                        {cooldownActive && (
                            <Text style={styles.cooldownText}>
                                Try again in {cooldownSeconds} seconds
                            </Text>
                        )}
                        <TouchableOpacity
                            style={[styles.lockButton, cooldownActive && styles.lockButtonDisabled]}
                            onPress={handleUnlock}
                            disabled={cooldownActive}
                        >
                            <Text style={styles.lockButtonText}>Unlock</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.biometricLockButton}
                            onPress={handleBiometricUnlock}
                        >
                            <Text style={styles.biometricLockText}>👆 Use Biometrics Instead</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.lockLogout}
                            onPress={() => {
                                setLockModal(false);
                                navigation.replace('Login');
                            }}
                        >
                            <Text style={styles.lockLogoutText}>Log out instead</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.logo}>VAULT<Text style={styles.logoAI}>_AI</Text></Text>
                <View style={styles.headerActions}>
                    <TouchableOpacity style={styles.headerBtn} onPress={handleLock}>
                        <Text style={styles.headerBtnText}>🔒 Lock</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.headerBtn}
                        onPress={() => {
                            Alert.alert('Log Out', 'Are you sure you want to log out?', [
                                { text: 'Cancel', style: 'cancel' },
                                {
                                    text: 'Log Out',
                                    style: 'destructive',
                                    onPress: () => {
                                        logAndAnalyzeSession();
                                        clearKeyCache();
                                        clearTimer();
                                        navigation.replace('Login');
                                    }
                                }
                            ]);
                        }}
                    >
                        <Text style={styles.headerBtnText}>🚪 Logout</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <TextInput
                style={styles.search}
                placeholder="Search passwords..."
                placeholderTextColor="#666"
                value={search}
                onChangeText={(text) => {
                    resetTimer();
                    setSearch(text);
                }}
            />

            <Text style={styles.count}>{filteredPasswords.length} passwords stored</Text>

            <FlatList
                data={filteredPasswords}
                keyExtractor={item => item.id.toString()}
                renderItem={renderItem}
                contentContainerStyle={styles.list}
                onScrollBeginDrag={resetTimer}
                ListEmptyComponent={
                    <Text style={styles.empty}>No passwords yet. Tap + to add one.</Text>
                }
            />

            <TouchableOpacity style={styles.fab} onPress={() => {
                resetTimer();
                setAddModal(true);
            }}>
                <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>

            {/* View Password Modal */}
            <Modal visible={modalVisible} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        {selectedItem && (
                            <>
                                <Text style={styles.modalTitle}>{selectedItem.title}</Text>
                                {selectedItem.breach_count > 0 && (
                                    <View style={styles.breachWarning}>
                                        <Text style={styles.breachWarningText}>
                                            ⚠️ Found in {selectedItem.breach_count.toLocaleString()} breaches — change this password!
                                        </Text>
                                    </View>
                                )}
                                <Text style={styles.modalLabel}>Username</Text>
                                <Text style={styles.modalValue}>{selectedItem.username || 'N/A'}</Text>
                                <Text style={styles.modalLabel}>Password</Text>
                                <Text style={styles.modalValue}>
                                    {showPassword ? decryptedPassword : '••••••••••••'}
                                </Text>
                                <Text style={styles.modalLabel}>Category</Text>
                                <Text style={styles.modalValue}>{selectedItem.category || 'General'}</Text>
                                <Text style={styles.modalLabel}>URL</Text>
                                <Text style={styles.modalValue}>{selectedItem.url || 'N/A'}</Text>

                                <TouchableOpacity style={styles.modalButton} onPress={handleShowPassword}>
                                    <Text style={styles.modalButtonText}>
                                        {showPassword ? 'Hide Password' : 'Show Password'}
                                    </Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.modalButton}
                                    onPress={() => handleCopyPassword(selectedItem)}
                                >
                                    <Text style={styles.modalButtonText}>Copy Password</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.modalButton, styles.editButton]}
                                    onPress={() => openEditModal(selectedItem)}
                                >
                                    <Text style={styles.modalButtonText}>Edit Password</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.modalButton, styles.deleteButton]}
                                    onPress={() => handleDelete(selectedItem.id)}
                                >
                                    <Text style={styles.modalButtonText}>Delete</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.modalClose}
                                    onPress={() => setModalVisible(false)}
                                >
                                    <Text style={styles.modalCloseText}>Close</Text>
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Add Password Modal */}
            <Modal visible={addModal} transparent animationType="slide">
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View style={styles.modalBox}>
                        <ScrollView>
                            <Text style={styles.modalTitle}>Add Password</Text>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Title (e.g. Netflix)"
                                placeholderTextColor="#666"
                                value={newTitle}
                                onChangeText={setNewTitle}
                            />
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Username or Email"
                                autoCapitalize="none"
                                placeholderTextColor="#666"
                                value={newUsername}
                                onChangeText={setNewUsername}
                            />
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Password"
                                autoCapitalize="none"
                                placeholderTextColor="#666"
                                secureTextEntry
                                value={newPassword}
                                onChangeText={setNewPassword}
                            />
                            {newPassword.length > 0 && strength && (
                                <View style={styles.strengthWrapper}>
                                    <View style={styles.strengthContainer}>
                                        <View style={styles.strengthBarBackground}>
                                            <View style={[
                                                styles.strengthBar,
                                                {
                                                    backgroundColor: strength.color,
                                                    width: strength.label === 'Weak' ? '33%' :
                                                        strength.label === 'Medium' ? '66%' : '100%'
                                                }
                                            ]} />
                                        </View>
                                        <Text style={[styles.strengthLabel, { color: strength.color }]}>
                                            {strength.label}
                                        </Text>
                                    </View>
                                    <Text style={[styles.strengthDescription, { color: strength.color }]}>
                                        {strength.label === 'Weak'
                                            ? '⚠️ Too short or missing uppercase, numbers, or symbols'
                                            : strength.label === 'Medium'
                                                ? '⚡ Add symbols or make it longer to strengthen it'
                                                : '✅ Great password! Long with mixed characters'}
                                    </Text>
                                </View>
                            )}
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Category (e.g. banking, social)"
                                placeholderTextColor="#666"
                                value={newCategory}
                                onChangeText={setNewCategory}
                            />
                            <TextInput
                                style={styles.modalInput}
                                placeholder="URL (optional)"
                                autoCapitalize="none"
                                placeholderTextColor="#666"
                                value={newUrl}
                                onChangeText={setNewUrl}
                            />
                            <TouchableOpacity
                                style={[styles.modalButton, saving && styles.modalButtonDisabled]}
                                onPress={handleAdd}
                                disabled={saving}
                            >
                                {saving ? (
                                    <View style={styles.savingRow}>
                                        <ActivityIndicator color="#0a0a0a" size="small" />
                                        <Text style={[styles.modalButtonText, { marginLeft: 8 }]}>
                                            Checking for breaches...
                                        </Text>
                                    </View>
                                ) : (
                                    <Text style={styles.modalButtonText}>Save Password</Text>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.modalClose}
                                onPress={() => setAddModal(false)}
                            >
                                <Text style={styles.modalCloseText}>Cancel</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Edit Password Modal */}
            <Modal visible={editModal} transparent animationType="slide">
                <KeyboardAvoidingView
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                >
                    <View style={styles.modalBox}>
                        <ScrollView>
                            <Text style={styles.modalTitle}>Edit Password</Text>
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Title (e.g. Netflix)"
                                placeholderTextColor="#666"
                                value={newTitle}
                                onChangeText={setNewTitle}
                            />
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Username or Email"
                                autoCapitalize="none"
                                placeholderTextColor="#666"
                                value={newUsername}
                                onChangeText={setNewUsername}
                            />
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Password"
                                autoCapitalize="none"
                                placeholderTextColor="#666"
                                secureTextEntry
                                value={newPassword}
                                onChangeText={setNewPassword}
                            />
                            {newPassword.length > 0 && strength && (
                                <View style={styles.strengthWrapper}>
                                    <View style={styles.strengthContainer}>
                                        <View style={styles.strengthBarBackground}>
                                            <View style={[
                                                styles.strengthBar,
                                                {
                                                    backgroundColor: strength.color,
                                                    width: strength.label === 'Weak' ? '33%' :
                                                        strength.label === 'Medium' ? '66%' : '100%'
                                                }
                                            ]} />
                                        </View>
                                        <Text style={[styles.strengthLabel, { color: strength.color }]}>
                                            {strength.label}
                                        </Text>
                                    </View>
                                    <Text style={[styles.strengthDescription, { color: strength.color }]}>
                                        {strength.label === 'Weak'
                                            ? '⚠️ Too short or missing uppercase, numbers, or symbols'
                                            : strength.label === 'Medium'
                                                ? '⚡ Add symbols or make it longer to strengthen it'
                                                : '✅ Great password! Long with mixed characters'}
                                    </Text>
                                </View>
                            )}
                            <TextInput
                                style={styles.modalInput}
                                placeholder="Category (e.g. banking, social)"
                                placeholderTextColor="#666"
                                value={newCategory}
                                onChangeText={setNewCategory}
                            />
                            <TextInput
                                style={styles.modalInput}
                                placeholder="URL (optional)"
                                autoCapitalize="none"
                                placeholderTextColor="#666"
                                value={newUrl}
                                onChangeText={setNewUrl}
                            />
                            <TouchableOpacity
                                style={[styles.modalButton, saving && styles.modalButtonDisabled]}
                                onPress={handleEdit}
                                disabled={saving}
                            >
                                {saving ? (
                                    <View style={styles.savingRow}>
                                        <ActivityIndicator color="#0a0a0a" size="small" />
                                        <Text style={[styles.modalButtonText, { marginLeft: 8 }]}>
                                            Checking for breaches...
                                        </Text>
                                    </View>
                                ) : (
                                    <Text style={styles.modalButtonText}>Update Password</Text>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.modalClose}
                                onPress={() => {
                                    setEditModal(false);
                                    setNewTitle('');
                                    setNewUsername('');
                                    setNewPassword('');
                                    setNewCategory('');
                                    setNewUrl('');
                                }}
                            >
                                <Text style={styles.modalCloseText}>Cancel</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0a0a0a',
        paddingTop: 60,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 20,
    },
    logo: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#ffffff',
        letterSpacing: 2,
    },
    logoAI: {
        color: '#00ff9d',
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    headerBtn: {
        backgroundColor: '#1a1a1a',
        borderRadius: 20,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: '#333',
    },
    headerBtnText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    search: {
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        padding: 14,
        marginHorizontal: 20,
        color: '#ffffff',
        fontSize: 15,
        borderWidth: 1,
        borderColor: '#333',
        marginBottom: 12,
    },
    count: {
        color: '#666',
        fontSize: 12,
        paddingHorizontal: 20,
        marginBottom: 8,
    },
    list: {
        paddingHorizontal: 20,
        paddingBottom: 100,
    },
    card: {
        backgroundColor: '#1a1a1a',
        borderRadius: 12,
        padding: 16,
        marginBottom: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#222',
    },
    cardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    cardRight: {
        alignItems: 'flex-end',
    },
    categoryDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 12,
    },
    cardTitle: {
        color: '#ffffff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    cardUsername: {
        color: '#666',
        fontSize: 13,
        marginTop: 2,
    },
    cardCategory: {
        color: '#666',
        fontSize: 12,
    },
    breachBadge: {
        backgroundColor: '#2a0a0a',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginBottom: 4,
        borderWidth: 1,
        borderColor: '#ff6b6b',
    },
    breachBadgeText: {
        color: '#ff6b6b',
        fontSize: 11,
        fontWeight: 'bold',
    },
    empty: {
        color: '#666',
        textAlign: 'center',
        marginTop: 60,
        fontSize: 15,
    },
    fab: {
        position: 'absolute',
        bottom: 30,
        right: 25,
        backgroundColor: '#00ff9d',
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 5,
    },
    fabText: {
        color: '#0a0a0a',
        fontSize: 32,
        fontWeight: 'bold',
        lineHeight: 36,
    },
    lockOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.95)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 30,
    },
    lockBox: {
        width: '100%',
        backgroundColor: '#1a1a1a',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333',
    },
    lockIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    lockTitle: {
        color: '#ffffff',
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    lockSubtitle: {
        color: '#666',
        fontSize: 14,
        marginBottom: 24,
    },
    lockInput: {
        width: '100%',
        backgroundColor: '#0a0a0a',
        borderRadius: 12,
        padding: 16,
        color: '#ffffff',
        fontSize: 16,
        borderWidth: 1,
        borderColor: '#333',
        textAlign: 'center',
        letterSpacing: 8,
        marginBottom: 12,
    },
    lockError: {
        color: '#ff6b6b',
        fontSize: 13,
        marginBottom: 12,
        textAlign: 'center',
    },
    cooldownText: {
        color: '#ffeaa7',
        fontSize: 13,
        marginBottom: 12,
        textAlign: 'center',
    },
    lockButton: {
        width: '100%',
        backgroundColor: '#00ff9d',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginTop: 4,
    },
    lockButtonDisabled: {
        backgroundColor: '#333',
    },
    lockButtonText: {
        color: '#0a0a0a',
        fontSize: 16,
        fontWeight: 'bold',
    },
    biometricLockButton: {
        marginTop: 12,
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#333',
        width: '100%',
        alignItems: 'center',
        backgroundColor: '#1a1a1a',
    },
    biometricLockText: {
        color: '#00ff9d',
        fontSize: 15,
        fontWeight: 'bold',
    },
    lockLogout: {
        marginTop: 16,
    },
    lockLogoutText: {
        color: '#666',
        fontSize: 14,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'flex-end',
    },
    modalBox: {
        backgroundColor: '#1a1a1a',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        maxHeight: '85%',
    },
    modalTitle: {
        color: '#ffffff',
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 20,
    },
    modalLabel: {
        color: '#666',
        fontSize: 12,
        marginBottom: 4,
        marginTop: 12,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    modalValue: {
        color: '#ffffff',
        fontSize: 16,
    },
    breachWarning: {
        backgroundColor: '#2a0a0a',
        borderRadius: 8,
        padding: 10,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#ff6b6b',
    },
    breachWarningText: {
        color: '#ff6b6b',
        fontSize: 13,
    },
    modalInput: {
        backgroundColor: '#0a0a0a',
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
        color: '#ffffff',
        fontSize: 15,
        borderWidth: 1,
        borderColor: '#333',
    },
    strengthWrapper: {
        marginBottom: 12,
        marginTop: -4,
    },
    strengthContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    strengthBarBackground: {
        flex: 1,
        height: 4,
        backgroundColor: '#333',
        borderRadius: 2,
        marginRight: 10,
    },
    strengthBar: {
        height: 4,
        borderRadius: 2,
    },
    strengthLabel: {
        fontSize: 12,
        fontWeight: 'bold',
        width: 50,
    },
    strengthDescription: {
        fontSize: 12,
        marginTop: 6,
        paddingHorizontal: 2,
    },
    modalButton: {
        backgroundColor: '#00ff9d',
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
        marginTop: 12,
    },
    modalButtonDisabled: {
        backgroundColor: '#1a1a1a',
        borderWidth: 1,
        borderColor: '#333',
    },
    savingRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    editButton: {
        backgroundColor: '#45b7d1',
    },
    deleteButton: {
        backgroundColor: '#ff6b6b',
    },
    modalButtonText: {
        color: '#0a0a0a',
        fontWeight: 'bold',
        fontSize: 15,
    },
    modalClose: {
        padding: 14,
        alignItems: 'center',
        marginTop: 8,
    },
    modalCloseText: {
        color: '#666',
        fontSize: 15,
    },
});