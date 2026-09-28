import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { initDatabase } from './database/db';
import LoginScreen from './screens/LoginScreen';
import SetupScreen from './screens/SetupScreen';
import VaultScreen from './screens/VaultScreen';
import ChatbotScreen from './screens/ChatbotScreen';
import BreachCheckScreen from './screens/BreachCheckScreen';
import CloudSyncScreen from './screens/CloudSyncScreen';
import PasswordGeneratorScreen from './screens/PasswordGeneratorScreen';
import PasswordStrengthScreen from './screens/PasswordStrengthScreen';
import DeveloperScreen from './screens/DeveloperScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ emoji, focused }) {
  return (
    <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>
  );
}

function MainTabs({ route }) {
  const { masterKey } = route.params;
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#0a0a0a',
          borderTopColor: '#222',
          borderTopWidth: 1,
          paddingBottom: 8,
          paddingTop: 8,
          height: 65,
        },
        tabBarActiveTintColor: '#00ff9d',
        tabBarInactiveTintColor: '#666',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: 'bold',
        },
      }}
    >
      <Tab.Screen
        name="Vault"
        component={VaultScreen}
        initialParams={{ masterKey }}
        options={{
          tabBarLabel: 'Vault',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔐" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Generator"
        component={PasswordGeneratorScreen}
        initialParams={{ masterKey }}
        options={{
          tabBarLabel: 'Generator',
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚡" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Strength"
        component={PasswordStrengthScreen}
        options={{
          tabBarLabel: 'Strength',
          tabBarIcon: ({ focused }) => <TabIcon emoji="💪" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="BreachCheck"
        component={BreachCheckScreen}
        options={{
          tabBarLabel: 'Breach',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🔍" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Chatbot"
        component={ChatbotScreen}
        initialParams={{ masterKey }}
        options={{
          tabBarLabel: 'AI Chat',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🤖" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="CloudSync"
        component={CloudSyncScreen}
        initialParams={{ masterKey }}
        options={{
          tabBarLabel: 'Cloud',
          tabBarIcon: ({ focused }) => <TabIcon emoji="☁️" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Developer"
        component={DeveloperScreen}
        initialParams={{ masterKey }}
        options={{
          tabBarLabel: 'Dev',
          tabBarIcon: ({ focused }) => <TabIcon emoji="🛠️" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [dbReady, setDbReady] = useState(false);
  const [dbError, setDbError] = useState(false);

  useEffect(() => {
    try {
      initDatabase();
      setDbReady(true);
    } catch (err) {
      console.log('DB Error:', err);
      setDbError(true);
    }
  }, []);

  if (dbError) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>
          Failed to initialize database.{'\n'}Please restart the app.
        </Text>
      </View>
    );
  }

  if (!dbReady) {
    return (
      <View style={styles.container}>
        <Text style={styles.logo}>VAULT<Text style={styles.logoAI}>_AI</Text></Text>
        <ActivityIndicator color="#00ff9d" size="large" style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0a0a0a' }
        }}
      >
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Setup" component={SetupScreen} />
        <Stack.Screen name="MainTabs" component={MainTabs} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#ffffff',
    letterSpacing: 2,
  },
  logoAI: {
    color: '#00ff9d',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
});