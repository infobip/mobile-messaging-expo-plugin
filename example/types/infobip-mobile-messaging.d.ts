// Type re-exports for convenience
// The published RN plugin uses a namespace declaration.
// This module augmentation re-exports the namespace types as named exports.

import 'infobip-mobile-messaging-react-native-plugin';

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
}
