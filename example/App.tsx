//
//  App.tsx
//  InfobipExpoExample
//
//  Copyright (c) 2016-2025 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

import React, {Component} from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';

import {
  mobileMessaging,
  MobileMessagingError,
} from 'infobip-mobile-messaging-react-native-plugin';
import type {Configuration} from 'infobip-mobile-messaging-react-native-plugin';

import MyMessageStorage from './constants/MyMessageStorage';
import Colors from './constants/Colors';

import HomeScreen from './screens/HomeScreen';
import PersonalizeScreen from './screens/PersonalizeScreen';
import UserDataScreen from './screens/UserDataScreen';
import MessagesScreen from './screens/MessagesScreen';
import InboxScreen from './screens/InboxScreen';
import EventLogScreen from './screens/EventLogScreen';
import TestDeeplinkingScreen from './screens/TestDeeplinkingScreen';
import TestDeeplinkingScreen2 from './screens/TestDeeplinkingScreen2';
import EventLogStore from './constants/EventLogStore';

interface AppState {
  logInfo: string;
}

type RootStackParamList = {
  HomeScreen: undefined;
  PersonalizeScreen: undefined;
  UserDataScreen: undefined;
  MessagesScreen: undefined;
  InboxScreen: undefined;
  EventLogScreen: undefined;
  TestDeeplinkingScreen: undefined;
  TestDeeplinkingScreen2: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const myMessageStorage = MyMessageStorage;

async function persistEventLog(eventName: string, value: any): Promise<void> {
  try {
    await EventLogStore.add(eventName, value);
  } catch (error) {
    console.warn('Failed to persist event log entry', error);
  }
}

class App extends Component<{}, AppState> {
  configuration: Configuration = {
    applicationCode: '',
    ios: {
      notificationTypes: ['alert', 'badge', 'sound'],
    },
    android: {},
    messageStorage: myMessageStorage,
    inAppChatEnabled: false,
    fullFeaturedInAppsEnabled: true,

    logging: true,
  };

  subscriptions: any[] = [];

  constructor(props: {}) {
    super(props);
    this.state = {
      logInfo: '...',
    };
    this.initMobileMessaging();
  }

  componentDidMount() {
    const events = [
      ...mobileMessaging.supportedEvents,
    ];

    events.forEach((event: string) => {
      const subscription = mobileMessaging.subscribe(event, (value: any) => {
        this.handleMobileMessagingEvent(event, value);
      });
      this.subscriptions.push(subscription);
    });
  }

  componentWillUnmount() {
    this.subscriptions.forEach((subscription: any) => {
      mobileMessaging.unsubscribe(subscription);
    });
  }

  handleMobileMessagingEvent = (eventName: string, value: any) => {
    const eventInfo = `Event: ${eventName}, Data: ${JSON.stringify(value)}`;
    this.updateLogInfo(eventInfo);
    void persistEventLog(eventName, value);
  };

  initMobileMessaging() {
    mobileMessaging.init(
      this.configuration,
      () => {
        this.updateLogInfo('MobileMessaging started');
      },
      (error: MobileMessagingError) => {
        this.updateLogInfo('MobileMessaging error: ' + JSON.stringify(error));
      },
    );
  }

  updateLogInfo(info: string) {
    console.log(info);
    this.setState({logInfo: info});
  }

  render() {
    return (
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName="HomeScreen"
          screenOptions={{
            headerShown: true,
            contentStyle: {backgroundColor: Colors.tintWhite},
            headerTintColor: 'white',
            headerStyle: {backgroundColor: Colors.primary500},
          }}>
          <Stack.Screen
            name="HomeScreen"
            component={HomeScreen}
            options={{title: 'Infobip Push Example App'}}
          />
          <Stack.Screen
            name="MessagesScreen"
            component={MessagesScreen}
            options={{title: 'Messages'}}
          />
          <Stack.Screen
            name="InboxScreen"
            component={InboxScreen}
            options={{title: 'Inbox'}}
          />
          <Stack.Screen
            name="EventLogScreen"
            component={EventLogScreen}
            options={{title: 'Event Log'}}
          />
          <Stack.Screen
            name="PersonalizeScreen"
            component={PersonalizeScreen}
            options={{title: 'Personalize'}}
          />
          <Stack.Screen
            name="UserDataScreen"
            component={UserDataScreen}
            options={{title: 'Edit User Data'}}
          />
          <Stack.Screen
            name="TestDeeplinkingScreen"
            component={TestDeeplinkingScreen}
            options={{
              title: 'Test Deeplinking',
              headerStyle: {backgroundColor: Colors.primary500},
              headerTintColor: Colors.tintWhite,
              headerTitleStyle: {fontWeight: 'bold'},
            }}
          />
          <Stack.Screen
            name="TestDeeplinkingScreen2"
            component={TestDeeplinkingScreen2}
            options={{
              title: 'Test Deeplinking2',
              headerStyle: {backgroundColor: Colors.primary500},
              headerTintColor: Colors.tintWhite,
              headerTitleStyle: {fontWeight: 'bold'},
            }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    );
  }
}

export default App;
