import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import {
  collection, doc, setDoc, getDocs,
  deleteDoc, serverTimestamp
} from 'firebase/firestore';
import { auth, db as firebaseDb } from '../firebase/firebase';
import { db_instance } from '../database/db';

export default function CloudSyncScreen({ navigation, route }) {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return unsubscribe;
  }, []);

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
      setEmail('');
      setPassword('');
    } catch (err) {
      console.log('Auth error:', err);
      let message = 'Something went wrong';
      if (err.code === 'auth/user-not-found') message = 'No account found with this email';
      if (err.code === 'auth/wrong-password') message = 'Incorrect password';
      if (err.code === 'auth/email-already-in-use') message = 'Email already registered';
      if (err.code === 'auth/weak-password') message = 'Password must be at least 6 characters';
      if (err.code === 'auth/invalid-email') message = 'Invalid email address';
      if (err.code === 'auth/invalid-credential') message = 'Invalid email or password';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    Alert.alert(
      'Upload to Cloud',
      'This will upload all your encrypted passwords to the cloud. Your passwords are encrypted before leaving your device.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upload',
          onPress: async () => {
            setSyncing(true);
            try {
              const items = db_instance.getAllSync('SELECT * FROM vault');
              const userVaultRef = collection(firebaseDb, 'users', user.uid, 'vault');

              for (const item of items) {
                await setDoc(doc(userVaultRef, item.id.toString()), {
                  title: item.title,
                  username: item.username || '',
                  password: item.password,
                  category: item.category || '',
                  url: item.url || '',
                  breach_count: item.breach_count || 0,
                  created_at: item.created_at,
                  updated_at: item.updated_at,
                  synced_at: serverTimestamp()
                });
              }

              const now = new Date().toLocaleString();
              setLastSync(now);
              Alert.alert('✅ Upload Complete', `${items.length} passwords uploaded successfully!`);
            } catch (err) {
              console.log("Upload error:", err);
              console.log("Code:", err.code);
              console.log("Message:", err.message);

              Alert.alert(
                "Upload Error",
                `${err.code}\n\n${err.message}`
              );
            } finally {
              setSyncing(false);
            }
          }
        }
      ]
    );
  };

  const handleDownload = async () => {
    Alert.alert(
      'Download from Cloud',
      'This will download your cloud passwords to this device. Existing local passwords will be kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Download',
          onPress: async () => {
            setSyncing(true);
            try {
              const userVaultRef = collection(firebaseDb, 'users', user.uid, 'vault');
              const snapshot = await getDocs(userVaultRef);

              if (snapshot.empty) {
                Alert.alert('No Data', 'No passwords found in the cloud.');
                return;
              }

              let added = 0;
              let skipped = 0;

              snapshot.forEach((docSnap) => {
                const data = docSnap.data();
                const existing = db_instance.getFirstSync(
                  'SELECT * FROM vault WHERE title = ? AND username = ?',
                  [data.title, data.username]
                );

                if (!existing) {
                  db_instance.runSync(
                    'INSERT INTO vault (title, username, password, category, url, breach_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [data.title, data.username, data.password, data.category, data.url, data.breach_count || 0, data.created_at, data.updated_at]
                  );
                  added++;
                } else {
                  skipped++;
                }
              });

              const now = new Date().toLocaleString();
              setLastSync(now);
              Alert.alert('✅ Download Complete', `${added} passwords added, ${skipped} already existed.`);
            } catch (err) {
              console.log("Download error:", err);
              console.log("Code:", err.code);
              console.log("Message:", err.message);

              Alert.alert(
                "Download Error",
                `${err.code}\n\n${err.message}`
              );
            } finally {
              setSyncing(false);
            }
          }
        }
      ]
    );
  };

  const handleDeleteCloud = async () => {
    Alert.alert(
      '⚠️ Delete Cloud Data',
      'This will permanently delete all your passwords from the cloud. Local passwords are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSyncing(true);
            try {
              const userVaultRef = collection(firebaseDb, 'users', user.uid, 'vault');
              const snapshot = await getDocs(userVaultRef);
              for (const docSnap of snapshot.docs) {
                await deleteDoc(doc(userVaultRef, docSnap.id));
              }
              setLastSync(null);
              Alert.alert('✅ Deleted', 'All cloud data has been deleted.');
            } catch (err) {
              console.log("Delete error:", err);
              console.log("Code:", err.code);
              console.log("Message:", err.message);

              Alert.alert(
                "Delete Error",
                `${err.code}\n\n${err.message}`
              );
            } finally {
              setSyncing(false);
            }
          }
        }
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out of cloud sync?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => await signOut(auth)
        }
      ]
    );
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
          <Text style={styles.headerTitle}>Cloud Sync</Text>
          <View style={{ width: 60 }} />
        </View>

        {!user ? (
          <>
            {/* Info Box */}
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>☁️ Encrypted Cloud Backup</Text>
              <Text style={styles.infoText}>
                Your passwords are <Text style={styles.infoHighlight}>encrypted on your device</Text> before being uploaded. We never see your actual passwords.
              </Text>
            </View>

            {/* Auth Toggle */}
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleButton, isLogin && styles.toggleActive]}
                onPress={() => setIsLogin(true)}
              >
                <Text style={[styles.toggleText, isLogin && styles.toggleTextActive]}>
                  Sign In
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleButton, !isLogin && styles.toggleActive]}
                onPress={() => setIsLogin(false)}
              >
                <Text style={[styles.toggleText, !isLogin && styles.toggleTextActive]}>
                  Create Account
                </Text>
              </TouchableOpacity>
            </View>

            {/* Auth Form */}
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#666"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#666"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />

            <TouchableOpacity
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleAuth}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#0a0a0a" size="small" />
              ) : (
                <Text style={styles.buttonText}>
                  {isLogin ? 'Sign In' : 'Create Account'}
                </Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            {/* Logged in view */}
            <View style={styles.accountBox}>
              <Text style={styles.accountIcon}>☁️</Text>
              <Text style={styles.accountEmail}>{user.email}</Text>
              <Text style={styles.accountStatus}>Connected</Text>
            </View>

            {lastSync && (
              <Text style={styles.lastSync}>Last sync: {lastSync}</Text>
            )}

            {syncing && (
              <View style={styles.syncingRow}>
                <ActivityIndicator color="#00ff9d" size="small" />
                <Text style={styles.syncingText}>Syncing...</Text>
              </View>
            )}

            <TouchableOpacity
              style={[styles.button, syncing && styles.buttonDisabled]}
              onPress={handleUpload}
              disabled={syncing}
            >
              <Text style={styles.buttonText}>⬆️ Upload to Cloud</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.downloadButton, syncing && styles.buttonDisabled]}
              onPress={handleDownload}
              disabled={syncing}
            >
              <Text style={styles.buttonText}>⬇️ Download from Cloud</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.deleteButton, syncing && styles.buttonDisabled]}
              onPress={handleDeleteCloud}
              disabled={syncing}
            >
              <Text style={styles.deleteButtonText}>🗑️ Delete Cloud Data</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.signOutButton}
              onPress={handleSignOut}
            >
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>

            {/* Privacy Note */}
            <View style={styles.privacyNote}>
              <Text style={styles.privacyText}>
                🔒 Your passwords are AES-256 encrypted before leaving your device. Firebase only stores encrypted data.
              </Text>
            </View>
          </>
        )}
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
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginBottom: 20,
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  toggleActive: {
    backgroundColor: '#00ff9d',
  },
  toggleText: {
    color: '#666',
    fontWeight: 'bold',
    fontSize: 14,
  },
  toggleTextActive: {
    color: '#0a0a0a',
  },
  input: {
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
    color: '#ffffff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  button: {
    backgroundColor: '#00ff9d',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
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
  },
  downloadButton: {
    backgroundColor: '#45b7d1',
  },
  deleteButton: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#ff6b6b',
  },
  deleteButtonText: {
    color: '#ff6b6b',
    fontSize: 16,
    fontWeight: 'bold',
  },
  accountBox: {
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
    padding: 24,
    marginHorizontal: 20,
    marginBottom: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#333',
  },
  accountIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  accountEmail: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  accountStatus: {
    color: '#00ff9d',
    fontSize: 13,
  },
  lastSync: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
  },
  syncingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  syncingText: {
    color: '#00ff9d',
    fontSize: 14,
    marginLeft: 8,
  },
  signOutButton: {
    padding: 16,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 8,
  },
  signOutText: {
    color: '#666',
    fontSize: 15,
  },
  privacyNote: {
    marginHorizontal: 20,
    marginTop: 16,
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