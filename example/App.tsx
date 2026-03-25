import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, Platform, Alert } from 'react-native';

// @ts-ignore - RN plugin types
import { mobileMessaging } from 'infobip-mobile-messaging-react-native-plugin';

export default function App() {
  const [status, setStatus] = useState<string>('Initializing...');

  useEffect(() => {
    mobileMessaging.init(
      {
        applicationCode: 'Your application code',
        ios: {
          notificationTypes: ['alert', 'badge', 'sound'],
        },
        inAppChatEnabled: false,
        fullFeaturedInAppsEnabled: true,
        logging: true,
      },
      () => {
        console.log('MobileMessaging initialized successfully');
        setStatus('MobileMessaging initialized');
      },
      (error: any) => {
        console.error('MobileMessaging init error:', error);
        setStatus(`Init error: ${JSON.stringify(error)}`);
      }
    );

    // Subscribe to message received event
    mobileMessaging.subscribe('messageReceived', (message: any) => {
      console.log('Message received:', message);
      Alert.alert('Push Received', JSON.stringify(message.body || message));
    });

    return () => {
      mobileMessaging.unsubscribe('messageReceived');
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Infobip Expo Plugin POC</Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.info}>Platform: {Platform.OS}</Text>
      <Text style={styles.info}>
        Bundle: {Platform.OS === 'ios' ? 'com.infobip.mobilemessaging.reactnative.test' : 'com.example'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  status: {
    fontSize: 16,
    color: '#333',
    marginBottom: 10,
  },
  info: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
});
