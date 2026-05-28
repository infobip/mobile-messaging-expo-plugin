//
//  infobip-mobile-messaging.d.ts
//  MobileMessagingExpo
//
//  Copyright (c) 2016-2026 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

import 'infobip-mobile-messaging-react-native-plugin';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

declare module 'infobip-mobile-messaging-react-native-plugin' {
  export type Configuration = MobileMessagingReactNative.Configuration;
  export type UserData = MobileMessagingReactNative.UserData;
  export type UserIdentity = MobileMessagingReactNative.UserIdentity;
  export type Installation = MobileMessagingReactNative.Installation;
  export type Message = MobileMessagingReactNative.Message;
  export type MobileMessagingError = MobileMessagingReactNative.MobileMessagingError;
  export type MMInbox = MobileMessagingReactNative.MMInbox;
  export type Gender = MobileMessagingReactNative.Gender;
  export type DefaultMessageStorage = MobileMessagingReactNative.DefaultMessageStorage;
  export type CustomMessageStorage = MobileMessagingReactNative.CustomMessageStorage;
  export type PersonalizeContext = MobileMessagingReactNative.PersonalizeContext;
  export type Event = MobileMessagingReactNative.Event;

  // webRTCUI is exported as a class instance in the JS but missing from the .d.ts (v14.8.0 gap)
  export const webRTCUI: typeof WebRTCUI;

  // ChatException lives in the namespace but is not re-exported at the top level
  export type ChatException = MobileMessagingReactNative.ChatException;

  // ChatView, ChatViewHandle and ChatViewProps are exported from the JS component
  // but absent from the .d.ts (v14.8.0 gap)
  export interface ChatViewHandle {
    showThreadsList(): void;
    setExceptionHandler(
      exceptionHandler: ((exception: ChatException) => void) | null,
      onError?: (error: Error) => void
    ): void;
  }

  export interface ChatViewProps {
    style?: StyleProp<ViewStyle>;
    sendButtonColor?: string;
  }

  export const ChatView: ForwardRefExoticComponent<ChatViewProps & RefAttributes<ChatViewHandle>>;
}
