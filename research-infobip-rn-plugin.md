# Research Report: Infobip Mobile Messaging RN Plugin & Native SDKs

## Overview

This report documents all native modifications required by the Infobip Mobile Messaging React Native plugin (v14.8.0), referencing the iOS native SDK (v14.4.3 / podspec uses 15.0.0 in RN plugin) and the Android native SDK (v14.14.2 as used in RN plugin's build.gradle).

---

## 1. Current Manual Setup Steps for iOS

Based on the RN plugin README and the Example app:

1. Run `pod install` from `/ios` folder
2. In `AppDelegate`, import and install the plugin delegate:
   ```swift
   import MobileMessaging
   // In didFinishLaunchingWithOptions:
   MobileMessagingPluginApplicationDelegate.install()
   ```
3. Enable **Push Notifications** capability (creates entitlements with `aps-environment`)
4. Enable **Background Modes** capability with `remote-notification` checked
5. (Optional) Integrate the **Notification Service Extension** for rich push and delivery stats
6. (Optional) Add `com.mobilemessaging.app_group` to Info.plist and configure app group entitlements

### AppDelegate Modifications (from Example app)

File: `Example/ios/Example/AppDelegate.swift`

```swift
import MobileMessaging

func application(_ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
    MobileMessagingPluginApplicationDelegate.install()
    return true
}
```

The `MobileMessagingPluginApplicationDelegate.install()` call swizzles the AppDelegate to intercept:
- `didRegisterForRemoteNotificationsWithDeviceToken`
- `didReceiveRemoteNotification:fetchCompletionHandler:`
- `userNotificationCenter` delegate methods

---

## 2. Current Manual Setup Steps for Android

Based on the RN plugin README and the Example app:

1. Add Google Services classpath to root `android/build.gradle`:
   ```groovy
   classpath 'com.google.gms:google-services:4.4.2'
   ```
2. Apply Google Services plugin at end of `android/app/build.gradle`:
   ```groovy
   apply plugin: 'com.google.gms.google-services'
   ```
3. Add `google-services.json` to `android/app/`
4. (Optional) For Android 13+ handle POST_NOTIFICATIONS permission request

### No MainApplication Modifications Required

The Android plugin uses a library-level `AndroidManifest.xml` that merges automatically via the Android manifest merger. No manual `MainApplication.java` changes are needed.

---

## 3. iOS Notification Service Extension (NSE) Details

### Purpose
- More accurate delivery stats reporting
- Rich notification support (image/media attachments on lock screen)

### NSE Target Setup

A new **Notification Service Extension** target must be created in Xcode with:

- **Product Name**: `MobileMessagingNotificationServiceExtension` (or custom)
- **Bundle Identifier**: `<main-app-bundle-id>.notification-extension` (convention from Example)
- **Info.plist** (`MobileMessagingNotificationServiceExtension.plist`):
  - `NSExtensionPointIdentifier`: `com.apple.usernotifications.service`
  - `NSExtensionPrincipalClass`: `$(PRODUCT_MODULE_NAME).NotificationService`
- **Deployment Target**: iOS 15.0+

### NSE Source Code

File: `NotificationService.swift`

```swift
import UserNotifications
import MobileMessagingNotificationExtension

class NotificationService: UNNotificationServiceExtension {
    var contentHandler: ((UNNotificationContent) -> Void)?
    var originalContent: UNNotificationContent?

    override func didReceive(_ request: UNNotificationRequest,
                             withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        self.contentHandler = contentHandler
        self.originalContent = request.content
        if MobileMessagingNotificationServiceExtension.isCorrectPayload(
            request.content.userInfo as? [String: Any] ?? [:]) {
            MobileMessagingNotificationServiceExtension.didReceive(request, withContentHandler: contentHandler)
        } else {
            contentHandler(request.content)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        MobileMessagingNotificationServiceExtension.serviceExtensionTimeWillExpire()
        if let originalContent = originalContent {
            contentHandler?(originalContent)
        }
    }
}
```

### NSE Pod Dependency

In `Podfile`, a separate target for the NSE:

```ruby
target 'MobileMessagingNotificationServiceExtension' do
  pod 'MobileMessagingNotificationExtension', '15.0.0'
end
```

The `MobileMessagingNotificationExtension` pod is a lightweight, zero-dependency module (only `UserNotifications` and `Security` frameworks).

### NSE Entitlements

File: `MobileMessagingNotificationServiceExtension.entitlements`

```xml
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.com.infobip.mobilemessaging.reactnative</string>
    </array>
</dict>
```

### How the NSE Communicates with the Main App

1. **Keychain sharing via App Group**: The NSE reads the `applicationCode` and `pushRegId` from a shared keychain using the app group as the access group.
2. **UserDefaults sharing via App Group**: `UserDefaults(suiteName: appGroupId)` for shared message storage.
3. **Info.plist key**: The NSE reads the app group ID from `com.mobilemessaging.app_group` in the main app's Info.plist (via `Bundle.mainAppBundle.appGroupId`).

---

## 4. App Groups and Entitlements

### Required for both the main app and NSE:

**Main App Entitlements** (`Example.entitlements`):
```xml
<dict>
    <key>aps-environment</key>
    <string>development</string>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.<bundle-id></string>
    </array>
</dict>
```

**NSE Entitlements** (`MobileMessagingNotificationServiceExtension.entitlements`):
```xml
<dict>
    <key>com.apple.security.application-groups</key>
    <array>
        <string>group.<bundle-id></string>
    </array>
</dict>
```

Both must share the **same** app group identifier. The convention from the Example is `group.<main-bundle-id>`.

### Capabilities Required (Xcode)
1. **Push Notifications** (adds `aps-environment` to entitlements)
2. **Background Modes** > Remote notifications
3. **App Groups** (for NSE communication)
4. (Optional) **Keychain Sharing** (same app group, for shared credential access)

---

## 5. All Info.plist Modifications

### Main App Info.plist

| Key | Value | Purpose |
|-----|-------|---------|
| `UIBackgroundModes` | `["remote-notification"]` (minimum) | Required for background push handling |
| `com.mobilemessaging.app_group` | `group.<bundle-id>` | Required for NSE shared storage. The SDK reads this key to know which app group to use |
| `NSCameraUsageDescription` | String | Optional: if using WebRTC or chat with camera |
| `NSMicrophoneUsageDescription` | String | Optional: if using WebRTC calls |
| `NSPhotoLibraryUsageDescription` | String | Optional: if using chat attachments |
| `NSPhotoLibraryAddUsageDescription` | String | Optional: if using chat attachments |

### NSE Info.plist

| Key | Value | Purpose |
|-----|-------|---------|
| `NSExtension.NSExtensionPointIdentifier` | `com.apple.usernotifications.service` | Standard NSE identifier |
| `NSExtension.NSExtensionPrincipalClass` | `$(PRODUCT_MODULE_NAME).NotificationService` | Entry point class |

---

## 6. All AndroidManifest.xml Modifications

### From the RN Plugin Library Manifest (auto-merged)

These are declared in the plugin's `android/src/main/AndroidManifest.xml` and merge automatically:

**Permissions:**
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.WAKE_LOCK" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
<uses-permission android:name="android.permission.VIBRATE" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.USE_FULL_SCREEN_INTENT" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.CAMERA" />
```

**Services:**
```xml
<service
    android:name="org.infobip.mobile.messaging.platform.MobileMessagingJobService"
    android:enabled="false"
    android:exported="false"
    android:permission="android.permission.BIND_JOB_SERVICE" />
```

**Receivers:**
```xml
<receiver android:name="org.infobip.mobile.messaging.MobileMessagingConnectivityReceiver"
    android:enabled="false" android:exported="false">
    <intent-filter>
        <action android:name="android.net.conn.CONNECTIVITY_CHANGE" />
    </intent-filter>
</receiver>

<receiver android:name="org.infobip.mobile.messaging.interactive.notification.NotificationActionTapReceiver"
    android:exported="false"/>

<receiver android:name="org.infobip.reactlibrary.mobilemessaging.MessageEventReceiver"
    android:exported="false">
    <intent-filter>
        <action android:name="org.infobip.mobile.messaging.MESSAGE_RECEIVED" />
        <action android:name="org.infobip.mobile.messaging.NOTIFICATION_TAPPED" />
        <action android:name="org.infobip.mobile.messaging.interactive.NOTIFICATION_ACTION_TAPPED" />
    </intent-filter>
</receiver>

<receiver android:name="org.infobip.reactlibrary.mobilemessaging.RNMMChatEventReceiver"
    android:exported="false">
    <intent-filter>
        <action android:name="org.infobip.mobile.messaging.chat.UNREAD_MESSAGES_COUNTER_UPDATED"/>
    </intent-filter>
</receiver>
```

**Application attributes:**
```xml
<application
    tools:replace="android:usesCleartextTraffic"
    android:usesCleartextTraffic="true">
```

### From the Android Native SDK Manifest (transitive)

```xml
<service
    android:name="org.infobip.mobile.messaging.cloud.firebase.MobileMessagingFirebaseService"
    android:exported="false">
    <intent-filter>
        <action android:name="com.google.firebase.MESSAGING_EVENT" />
    </intent-filter>
</service>

<activity android:name="org.infobip.mobile.messaging.NotificationTapReceiverActivity"
    android:excludeFromRecents="true"
    android:exported="false"
    android:noHistory="true"
    android:taskAffinity=""
    android:theme="@android:style/Theme.Translucent.NoTitleBar" />
```

### User's App Manifest (Optional deep link)

From Example:
```xml
<intent-filter>
    <data android:scheme="com.infobip.mobilemessaging"/>
    <action android:name="android.intent.action.VIEW"/>
    <category android:name="android.intent.category.DEFAULT"/>
    <category android:name="android.intent.category.BROWSABLE"/>
</intent-filter>
```

---

## 7. All build.gradle Modifications

### Root `build.gradle`

```groovy
buildscript {
    dependencies {
        classpath("com.google.gms:google-services:4.4.2")
    }
}
```

### App `build.gradle`

```groovy
// At the end of the file:
apply plugin: 'com.google.gms.google-services'
```

### Optional Properties (set in root `gradle.properties` or `build.gradle ext`)

| Property | Default | Purpose |
|----------|---------|---------|
| `overrideGmsVersion` | `''` | Override `play-services-location` version |
| `overrideFirebaseVersion` | `''` | Override `firebase-messaging` version |
| `withWebRTCUI` | `false` | Enable WebRTC UI dependency |

### Dependencies (pulled automatically by the RN plugin library)

From `android/build.gradle` of the plugin:
```groovy
implementation "com.infobip:infobip-mobile-messaging-android-sdk:14.14.2@aar"
implementation "com.infobip:infobip-mobile-messaging-android-chat-sdk:14.14.2@aar"
implementation "com.infobip:infobip-mobile-messaging-android-inbox-sdk:14.14.2@aar"
implementation "com.infobip:infobip-mobile-messaging-android-resources:14.14.2@aar"
```

Transitive dependencies from the Android SDK:
```groovy
com.google.firebase:firebase-messaging
com.google.android.gms:play-services-base:18.2.0+
androidx.legacy:legacy-support-v4
androidx.appcompat:appcompat
androidx.work:work-runtime
com.google.code.gson:gson
```

---

## 8. AppDelegate / MainApplication Modifications

### iOS AppDelegate

**Required change**: Add `MobileMessagingPluginApplicationDelegate.install()` call in `didFinishLaunchingWithOptions`.

In Expo, the AppDelegate is managed. The Expo config plugin will need to:
- Import `MobileMessaging`
- Insert `MobileMessagingPluginApplicationDelegate.install()` in the `didFinishLaunchingWithOptions` method

### Android MainApplication

**No changes required**. The plugin uses manifest-merged components and initializes via JavaScript at runtime through `MobileMessaging.Builder`.

---

## 9. Pod / Framework Dependencies

### Main App (iOS)

From `infobip-mobile-messaging-react-native-plugin.podspec`:
```ruby
s.dependency "MobileMessaging/Core", "15.0.0"
s.dependency "MobileMessaging/InAppChat", "15.0.0"
s.dependency "MobileMessaging/Inbox", "15.0.0"
# Optional:
s.dependency "MobileMessaging/WebRTCUI", "15.0.0"  # if $WebRTCUIEnabled
```

`MobileMessaging/Core` subspecs framework requirements:
- `CoreData`
- `CoreTelephony`
- `SystemConfiguration`

### Notification Service Extension (iOS)

```ruby
pod 'MobileMessagingNotificationExtension', '15.0.0'
```

Frameworks: `UserNotifications`, `Security`

### Android

Maven dependencies (from plugin `build.gradle`):
```
com.infobip:infobip-mobile-messaging-android-sdk:14.14.2
com.infobip:infobip-mobile-messaging-android-chat-sdk:14.14.2
com.infobip:infobip-mobile-messaging-android-inbox-sdk:14.14.2
com.infobip:infobip-mobile-messaging-android-resources:14.14.2
```

Plus various AndroidX and Google Play Services dependencies (pulled transitively).

---

## 10. Firebase / FCM Setup Requirements

### Android

1. **google-services.json** must be placed in `android/app/`
2. **Google Services Gradle Plugin** must be applied:
   - Classpath: `com.google.gms:google-services:4.4.2`
   - Apply: `apply plugin: 'com.google.gms.google-services'`
3. The SDK registers a `MobileMessagingFirebaseService` in its manifest that handles `com.google.firebase.MESSAGING_EVENT`
4. **Alternative**: Firebase options can be provided programmatically via the `android.firebaseOptions` configuration key (handled in `Configuration.java` as `FirebaseOptions`), allowing use without `google-services.json`

### iOS

- Push notifications use **APNs directly** (not FCM)
- No Firebase dependency on iOS
- Requires an APNs certificate or key configured in the Infobip portal
- The `aps-environment` entitlement must match the provisioning profile (development/production)

---

## 11. Summary of What the Expo Config Plugin Must Automate

### iOS Config Plugin Tasks

1. **Info.plist modifications**:
   - Add `UIBackgroundModes` with `remote-notification`
   - Add `com.mobilemessaging.app_group` key with configured value

2. **Entitlements modifications** (main app):
   - Add `aps-environment` (push notifications capability)
   - Add `com.apple.security.application-groups` with app group ID

3. **AppDelegate modification**:
   - Import `MobileMessaging`
   - Insert `MobileMessagingPluginApplicationDelegate.install()` in `didFinishLaunchingWithOptions`

4. **Notification Service Extension target** (optional but recommended):
   - Create new NSE target in Xcode project
   - Add `NotificationService.swift` source file
   - Add NSE Info.plist
   - Add NSE entitlements with matching app group
   - Set bundle identifier to `<main-bundle-id>.notification-extension`
   - Add `MobileMessagingNotificationExtension` pod dependency (via Podfile modification)

5. **Podfile modifications**:
   - Add NSE target with `MobileMessagingNotificationExtension` pod

### Android Config Plugin Tasks

1. **Root build.gradle**:
   - Add `com.google.gms:google-services` classpath

2. **App build.gradle**:
   - Apply `com.google.gms.google-services` plugin

3. **google-services.json**:
   - Copy from user-specified path to `android/app/`

4. **AndroidManifest.xml**:
   - Most modifications are auto-merged from the library
   - Optional: add deep link intent filter if configured

### Complexity Assessment

| Area | Complexity | Notes |
|------|-----------|-------|
| iOS Info.plist | Low | Standard plist modification |
| iOS Entitlements | Low | Standard entitlements modification |
| iOS AppDelegate | Medium | Need to inject Swift code into managed AppDelegate |
| iOS NSE Target | **High** | Creating an entirely new Xcode target with source files, entitlements, Info.plist, and Podfile changes |
| Android build.gradle | Medium | Plugin classpath + apply changes |
| Android google-services.json | Low | File copy |
| Android Manifest | Low | Auto-merged; minimal manual changes |

The **iOS Notification Service Extension** is by far the most complex piece, requiring Xcode project manipulation (adding a new native target, build phases, source files, entitlements, and Podfile entries).
