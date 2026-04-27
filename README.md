# Infobip Mobile Messaging Expo Plugin

[![npm](https://img.shields.io/npm/v/infobip-mobile-messaging-expo-plugin.svg)](https://www.npmjs.com/package/infobip-mobile-messaging-expo-plugin)

Expo config plugin for the [Infobip Mobile Messaging React Native SDK](https://github.com/infobip/mobile-messaging-react-native-plugin). Automates native project setup for push notifications, Notification Service Extension, Firebase, and deep linking.

For SDK usage (initialization, message handling, in-app chat, inbox, etc.), see the [React Native plugin wiki](https://github.com/infobip/mobile-messaging-react-native-plugin/wiki).

> **Expo Go is not supported.** This plugin requires a [development build](https://docs.expo.dev/develop/development-builds/introduction/) (Expo Go does not support config plugins).

## Compatibility

| Component | Version |
|:----------|:--------|
| Expo SDK | 55+ |
| React Native | 0.83+ |
| Infobip RN Plugin | 14.8.0+ |
| iOS SDK (MobileMessaging) | 15.0.0 |
| Android SDK | 14.14.2 |
| iOS Deployment Target | 15.1+ (Expo SDK 55 floor) |
| Android minSdkVersion | 24 (Expo SDK 55 floor; Infobip Android SDK supports 21+) |
| Xcode | 16+ |
| Node.js | 18+ |

## Installation

```bash
npm install infobip-mobile-messaging-expo-plugin infobip-mobile-messaging-react-native-plugin
```

Both packages are required. The Expo plugin handles native project configuration; the RN plugin provides the JavaScript API.

## Quick Start

1. Make sure to [set up your application in the Infobip portal](https://www.infobip.com/docs/mobile-app-messaging/getting-started#create-and-enable-a-mobile-application-profile), if you haven't already.

2. Add the plugin to your `app.json` (`expo.ios.bundleIdentifier` and `expo.android.package` are required):

   ```json
   {
     "expo": {
       "ios": {
         "bundleIdentifier": "com.example.myapp"
       },
       "android": {
         "package": "com.example.myapp",
         "googleServicesFile": "./google-services.json"
       },
       "plugins": [
         [
           "infobip-mobile-messaging-expo-plugin",
           {
             "iosMode": "development",
             "deepLinkScheme": "myapp"
           }
         ]
       ]
     }
   }
   ```

   > **Important:** Use `"iosMode": "development"` for development builds and `"iosMode": "production"` for App Store, TestFlight, and ad-hoc distribution. The value must match the provisioning profile's `aps-environment` -- a mismatch causes APNs to silently drop pushes (`BadDeviceToken` on the Infobip backend).

3. Generate native projects, then build:

   ```bash
   npx expo prebuild --clean
   # then either:
   npx expo run:ios          # local Xcode build
   # or:
   eas build --platform ios  # cloud / local EAS build
   ```

4. Initialize the SDK in your app code:

   ```typescript
   import { mobileMessaging } from 'infobip-mobile-messaging-react-native-plugin';

   mobileMessaging.init({
     applicationCode: '<your-application-code>',
     ios: {
       notificationTypes: ['alert', 'badge', 'sound'],
     },
   });
   ```

#### Full configuration reference, examples, and troubleshooting on the [wiki](https://github.com/infobip/mobile-messaging-expo-plugin/wiki).

## Further Reading

- [Configuration reference and examples](https://github.com/infobip/mobile-messaging-expo-plugin/wiki) -- all plugin props, minimal and full examples, linkage modes
- [EAS Build Setup](https://github.com/infobip/mobile-messaging-expo-plugin/wiki/EAS-Setup) -- credential management for iOS builds (managed and manual)
- [Troubleshooting](https://github.com/infobip/mobile-messaging-expo-plugin/wiki/Troubleshooting) -- common build errors and solutions
- [React Native Plugin Wiki](https://github.com/infobip/mobile-messaging-react-native-plugin/wiki) -- SDK initialization, message handling, in-app chat, inbox, and all runtime APIs

| If you have any questions or suggestions, feel free to send an email to support@infobip.com or create an [issue](https://github.com/infobip/mobile-messaging-expo-plugin/issues). |
|---|

## License

MIT
