# Research Report: CleverTap and Iterable Expo Config Plugins

## 1. CleverTap Expo Plugin (`@clevertap/clevertap-expo-plugin` v0.0.4)

### 1.1 Architecture Overview

**Entry point:** `app.plugin.js` -> `build/src/withClevertap.js`

The plugin follows a two-branch structure:
- `withCleverTapAndroid(config, props)` - all Android modifications
- `withCleverTapIos(config, props)` - all iOS modifications

It also uses Expo's **expo-module** system with:
- `expo-module.config.json` declaring an `appDelegateSubscriber: "CleverTapAppDelegate"` (iOS)
- Native Kotlin lifecycle listeners for Android (via `CleverTapPackage.kt`)

**Source layout:**
```
src/
  withClevertap.ts            # Main entry, validates required props
  withCleverTapAndroid.ts     # Android orchestrator
  withCleverTapIOS.ts         # iOS orchestrator (withClevertapIos)
  android_config/
    manifest/withCleverTapAndroidManifest.ts
    gradle/withClevertapAndroidAppBuildGradle.ts
    gradle/withCleverTapAndroidAppRootBuildGradle.ts
    io/withCleverTapAndroidCopyFiles.ts
    res/withCleverTapAndroidResources.ts
    utility/constants.ts
    utility/utils.ts
    utility/androidAppDepsTemplate.ts
  iOS_config/
    withCleverTapInfoPlist.ts
    withCleverTapPodfile.ts
    withCleverTapNotificationServiceExtension.ts
    withCleverTapNotificationContentExtension.ts
    withCleverTapBridgingHeader.ts
    IOSConstants.ts
    FileManager.ts
    NSUpdaterManager.ts
types/
  types.ts, androidTypes.ts, iOSTypes.ts
```

### 1.2 Configuration Schema (Props)

```typescript
type CleverTapPluginProps = {
  accountId: string;          // REQUIRED
  accountToken: string;       // REQUIRED
  accountRegion?: string;
  proxyDomain?: string;
  spikyProxyDomain?: string;
  logLevel?: number;
  disableAppLaunchedEvent?: boolean;
  handshakeDomain?: string;
  encryptionLevel?: 0 | 1;
  encryptionInTransit?: boolean;
  customIdentifiers?: string;
  ios?: {
    mode: string;             // "development" | "production" - REQUIRED for iOS
    deviceFamily?: string;
    disableIDFV?: boolean;
    enableFileProtection?: boolean;
    enableURLDelegateChannels?: [number];
    notifications?: {
      notificationCategories?: NotificationCategory[];
      enablePushInForeground?: boolean;
      enableRichMedia?: boolean;
      enablePushImpression?: boolean;
      enablePushTemplate?: boolean;
      iosNSEFilePath?: string;
      iosNCEFilePath?: string;
      iosPushAppGroup?: string;
    };
  };
  android: {
    features: {
      enablePush?: boolean;
      enablePushTemplates?: boolean;
      enableInApp?: boolean;
      enableInbox?: boolean;
      enableMediaForInAppsInbox?: boolean;
      enableInstallReferrer?: boolean;
      enableHmsPush?: boolean;
      enableGoogleAdId?: boolean;
      enablePlayReview?: boolean;
    };
    customNotificationSound?: string | string[];
    backgroundSync?: string;
    defaultNotificationChannelId?: string;
    inAppExcludeActivities?: string;
    sslPinning?: string;
    registerActivityLifecycleCallbacks?: boolean;
  };
};
```

**Key observation:** The config is deeply nested and feature-rich but `android` is required (not optional) while `ios` is optional. This asymmetry could cause runtime errors.

### 1.3 iOS Implementation Details

#### Capabilities & Entitlements
- **aps-environment:** Set via `withEntitlementsPlist` based on `ios.mode` (development/production)
- **Background modes:** Adds `remote-notification` to `UIBackgroundModes` in Info.plist
- **App Groups:** Adds `com.apple.security.application-groups` entitlement with the `iosPushAppGroup` value

#### Info.plist Configuration
Adds many CleverTap-specific keys to Info.plist:
- `CleverTapAccountID`, `CleverTapToken`, `CleverTapRegion`
- `CleverTapProxyDomain`, `CleverTapSpikyProxyDomain`
- `CleverTapIdentifiers`, `CleverTapDisableAppLaunched`
- `CleverTapEncryptionLevel`, `CleverTapEncryptionInTransitEnabled`
- `CleverTapDisableIDFV`, `CleverTapHandshakeDomain`
- `CleverTapEnableFileProtection`
- Custom internal keys: `CTExpoLogLevel`, `CTExpoPushAppGroup`, `CTExpoNotificationProps`, `CTExpoURLDelegateChannels`

#### Notification Service Extension (NSE)
- **Uses `withDangerousMod`** to copy Swift extension files from the plugin's `ios/` directory
- Copies `NotificationService.swift`, `NotificationService-Info.plist`, `NotificationService.entitlements`
- Uses `NSUpdaterManager` to update plist templates (replacing `{{GROUP_IDENTIFIER}}`, `{{BUNDLE_VERSION}}`, etc.)
- **Uses `withXcodeProject`** to add the NSE target to the Xcode project:
  - Creates PBXGroup, adds to root group
  - Creates target via `xcodeProject.addTarget()`
  - Adds PBXSourcesBuildPhase, PBXResourcesBuildPhase, PBXFrameworksBuildPhase
  - Copies build settings (SWIFT_VERSION, CODE_SIGN_STYLE, DEVELOPMENT_TEAM, etc.) from main target
  - Sets bundle identifier as `${mainBundleId}.NotificationService`
- Supports **custom NSE file path** via `iosNSEFilePath` prop
- String replacement approach: modifies `NotificationService.swift` by replacing imports and base classes for rich media / push impressions

#### Notification Content Extension (NCE)
- Very similar pattern to NSE
- Copies `NotificationViewController.swift`, `MainInterface.storyboard`, entitlements, plist
- Adds `NotificationContent` target to Xcode project with UserNotifications + UserNotificationsUI frameworks

#### Podfile Modifications
- **Uses `withDangerousMod`** (not `withPodfile`) to directly read/write the Podfile
- Adds `clevertap-react-native` pod after `use_expo_modules!`
- Appends separate pod targets for NSE and NCE at the end of the Podfile

#### Bridging Header
- Checks for `sourceURL(for bridge: RCTBridge)` in AppDelegate.swift
- Creates or modifies bridging header to add `#import <React/RCTBridge.h>`

#### AppDelegate (Native Swift - ExpoAppDelegateSubscriber)
- Configures `CleverTap.setDebugLevel()`, `CleverTap.autoIntegrate()`
- Sets up notification categories from Info.plist
- Handles foreground push presentation
- Sets URL delegate for deep link channels
- Reads config from `Bundle.main.infoDictionary` (Info.plist keys set by config plugin)

### 1.4 Android Implementation Details

#### AndroidManifest.xml
- Uses `withAndroidManifest` with `AndroidConfig.Manifest` helpers
- Uses a **data-driven metadata config array** pattern (very clean):
  ```typescript
  const METADATA_CONFIGS: MetadataConfig[] = [
    { key: 'CLEVERTAP_ACCOUNT_ID', getValue: (props) => props.accountId },
    // ...more entries
  ];
  ```
- Adds FCM service (`FcmMessageListenerService`) and `CTNotificationIntentService` when push is enabled
- Adds `AD_ID` permission when Google Ad ID is enabled

#### build.gradle (App-level)
- Uses `withAppBuildGradle` with `mergeContents` from `@expo/config-plugins/build/utils/generateCode`
- Generates dependency blocks that check gradle properties at build time: `if (project.hasProperty('clevertapPushEnabled') && project.clevertapPushEnabled.toBoolean())`
- Adds Firebase/HMS plugins at the end of build.gradle
- Uses `withGradleProperties` to set feature flags and version properties

#### build.gradle (Root/Project-level)
- Uses `withProjectBuildGradle` and `withSettingsGradle`
- Adds Google Services classpath, HMS classpath, AGP classpath
- Adds Huawei maven repository to all `repositories {}` blocks

#### Resource Files
- Uses `withStringsXml` to add config strings (lifecycle callbacks, push templates, log level)
- Uses `withDangerousMod` to copy custom notification sound files to `res/raw/`
- Tracks copied sound files with a marker file for cleanup

### 1.5 Strengths

1. **Very feature-rich** - covers push, in-app, inbox, rich media, push templates, HMS, encryption, etc.
2. **Data-driven metadata pattern** for AndroidManifest is clean and extensible
3. **Custom NSE/NCE file path support** - allows users to provide their own Swift files
4. **Gradle properties approach** - feature flags in gradle.properties allows build-time conditional dependencies
5. **App Group support** - handles app group entitlements for both main app and NSE
6. **Comprehensive logging** via `CleverTapLog` utility

### 1.6 Weaknesses

1. **No tests at all** - zero test files found in the project
2. **Uses `fs-extra` as dependency** but it's in devDependencies, not dependencies (could fail at runtime in some setups)
3. **Inconsistent file naming** - `withClevertap.ts` (lowercase t) vs `withCleverTapAndroid.ts` (uppercase T)
4. **Podfile modification uses `withDangerousMod`** instead of the safer `withPodfile` mod (Iterable does better here)
5. **`android` is required** in the type but `ios` is optional - doesn't guard against undefined `android.features`
6. **Destructured defaults pattern** in gradle files is fragile - deeply nested destructuring with defaults
7. **String replacement for Swift files** is brittle (replacing `UNNotificationServiceExtension` with `CTNotificationServiceExtension`)
8. **appendFile with callback** in Podfile modification - mixing async patterns (callback-based `fs.appendFile` inside a `withDangerousMod` async handler)
9. **Low Expo SDK compatibility** - uses `expo: 48.0.0` in devDependencies (quite old)
10. **No input validation** beyond accountId/accountToken - many optional fields could cause issues if wrong types are passed
11. **Version 0.0.4** - very early stage, likely unstable API

---

## 2. Iterable Expo Plugin (`@iterable/expo-plugin` v1.0.1)

### 2.1 Architecture Overview

**Entry point:** `app.plugin.js` -> `plugin/build/withIterable.js`

The plugin uses `withPlugins` from expo/config-plugins to compose:
1. `withStoreConfigValues` - stores config values in native storage (Info.plist / AndroidManifest)
2. `withPushNotifications` - configures push for both platforms
3. `withDeepLinks` - configures Android deep link launch mode

**Key difference from CleverTap:** Plugin code lives in a `plugin/` subdirectory (separate from the expo module code), with a clean separation between config plugin and native module.

**Source layout:**
```
plugin/
  src/
    withIterable.ts             # Main entry, sets defaults, composes plugins
    withIterable.types.ts       # Type definitions
    withStoreConfigValues.ts    # Stores config in native (Info.plist/AndroidManifest)
    withDeepLinks.ts            # Android deep links
    withPushNotifications/
      index.ts                  # Orchestrator
      withAndroidPushNotifications.ts
      withAndroidPushNotifications.constants.ts
      withAndroidPushNotifications.utils.ts
      withIosPushNotifications.ts
      withIosPushNotifications.constants.ts
      withIosPushNotifications.utils.ts
  __tests__/                    # Tests for each module
  __mocks__/                    # Mock configs for testing
```

### 2.2 Configuration Schema (Props)

```typescript
interface ConfigPluginProps {
  appEnvironment?: 'development' | 'production';  // default: 'development'
  autoConfigurePushNotifications?: boolean;         // default: true
  enableTimeSensitivePush?: boolean;                // default: true (iOS only)
  requestPermissionsForPushNotifications?: boolean; // default: false (iOS only)
}
```

**Key observation:** Very simple, minimal configuration. All props are optional with sensible defaults. Uses `Required<ConfigPluginProps>` internally (`ConfigPluginPropsWithDefaults`) after applying defaults.

### 2.3 iOS Implementation Details

#### Capabilities & Entitlements
- **aps-environment:** Set via `withEntitlementsPlist` based on `appEnvironment`
- **Time-sensitive notifications:** Adds `com.apple.developer.usernotifications.time-sensitive` entitlement
- **Background modes:** Adds `remote-notification` to `UIBackgroundModes`

#### Notification Service Extension
- **Target name:** `IterableExpoRichPush`
- **Uses `withDangerousMod`** to create NSE directory and files
- **File content is defined as constants** in `withIosPushNotifications.constants.ts` (not copied from disk)
  - `NS_MAIN_FILE_CONTENT`: Minimal Swift file extending `ITBNotificationServiceExtension`
  - `NS_PLIST_CONTENT`: Full Info.plist XML
  - `NS_ENTITLEMENTS_CONTENT`: Entitlements with app-sandbox and network-client
- **Uses `withXcodeProject`** for target configuration:
  - Same pattern as CleverTap: create target, add group, copy build settings from main target
  - Well-factored into utility functions (`addNotificationServiceTarget`, `addNotificationServiceGroup`, `updateBuildSettings`, `addBuildPhases`)
  - Uses `createFileIfNoneExists` - won't overwrite existing files

#### Podfile Modifications
- **Uses `withPodfile`** (the safe, non-dangerous mod) to append the NSE target
- Handles both `podfile_properties['ios.useFrameworks']` and `ENV['USE_FRAMEWORKS']`

#### AppDelegate (Native Swift - ExpoAppDelegateSubscriber)
- Sets `UNUserNotificationCenter.current().delegate = self`
- Conditionally requests push permissions based on `ITERABLE_REQUEST_PERMISSIONS_FOR_PUSH_NOTIFICATIONS` Info.plist key
- Handles device token registration via `IterableAPI.register(token:)`
- Handles deep links via `RCTLinkingManager`
- Handles remote notification background fetch via `IterableAppIntegration`
- Implements `UNUserNotificationCenterDelegate` for foreground notification display

#### Config Value Storage
- Uses `withInfoPlist` to store `ITERABLE_REQUEST_PERMISSIONS_FOR_PUSH_NOTIFICATIONS` in Info.plist
- Uses `withAndroidManifest` + `addMetaDataItemToMainApplication` for the same on Android
- Clean pattern: a `nativeKeyMap` maps JS config keys to native keys

### 2.4 Android Implementation Details

#### AndroidManifest.xml
- Adds `POST_NOTIFICATIONS` permission
- Stores config values as `<meta-data>` in the application tag

#### build.gradle (App-level)
- Adds `com.google.gms.google-services` apply plugin
- Adds Firebase BOM and Firebase Messaging dependencies
- Uses utility functions (`addAppDependency`, `addApplyPlugin`, `addProjectDependency`)
- **Checks for groovy language** before modifying - falls back to `WarningAggregator` if Kotlin DSL

#### build.gradle (Project-level)
- Adds `com.google.gms:google-services:4.4.2` classpath dependency

#### google-services.json
- Uses `withDangerousMod` to copy from `expo.android.googleServicesFile` path to `app/google-services.json`
- Leverages Expo's existing `googleServicesFile` config field (smart reuse)

#### Deep Links
- Sets `android:launchMode="singleTask"` on the main activity

### 2.5 Strengths

1. **Comprehensive test suite** - tests for each module with mock infrastructure
2. **Clean separation of concerns** - plugin code in `plugin/` dir, separate from native module code
3. **Uses `withPlugins`** for composition (Expo best practice)
4. **Uses `withPodfile`** instead of `withDangerousMod` for Podfile changes
5. **File content as constants** - NSE files defined inline, no file copy from disk needed
6. **Sensible defaults** - all props optional, uses `Required<>` type internally
7. **WarningAggregator** usage for non-fatal issues (e.g., Kotlin DSL build.gradle)
8. **Leverages existing Expo config** (`expo.android.googleServicesFile`)
9. **createFileIfNoneExists** - won't overwrite user customizations
10. **Good JSDoc documentation** with links to official setup docs
11. **Modern tooling** - commitlint, lefthook, release-it, yarn 4, jest-expo, 80% coverage threshold
12. **EAS Build integration** documented in example app.json (`extra.eas.build.experimental.ios.appExtensions`)
13. **Type-safe union for appEnvironment** - `'development' | 'production'`

### 2.6 Weaknesses

1. **No Notification Content Extension** - only Service Extension (no rich push templates)
2. **No App Group support** - NSE entitlements only have sandbox and network-client
3. **Hardcoded Firebase BOM version** (`32.8.1`) - not user-configurable
4. **No custom NSE file path support** - can't provide custom NotificationService.swift
5. **Limited Android configuration** - only POST_NOTIFICATIONS permission and Firebase setup
6. **No HMS/Huawei support**
7. **Deep links implementation is minimal** - only sets launchMode to singleTask

---

## 3. Comparison Table

| Feature | CleverTap | Iterable |
|---------|-----------|----------|
| **Version / Maturity** | v0.0.4 (early) | v1.0.1 (more mature) |
| **Expo SDK Support** | 48+ (old) | 53+ (current) |
| **Test Suite** | None | Comprehensive (80% coverage threshold) |
| **Props Complexity** | Very complex, deeply nested | Simple, 4 optional props |
| **Props Validation** | Only accountId/accountToken | N/A (all optional with defaults) |
| **iOS NSE** | Yes (copy from disk + modify) | Yes (inline content constants) |
| **iOS NCE** | Yes | No |
| **Custom NSE Path** | Yes | No |
| **App Groups** | Yes | No |
| **Podfile Approach** | `withDangerousMod` | `withPodfile` (safer) |
| **Plugin Composition** | Manual `config = withX(config, props)` | `withPlugins()` (Expo pattern) |
| **Android Firebase** | Adds classpath + apply plugin | Same approach |
| **Android HMS/Huawei** | Full support | No |
| **Deep Links** | Delegated to native (URL delegate channels) | Sets singleTask launchMode |
| **Config Value Storage** | Info.plist keys + strings.xml | Info.plist + AndroidManifest meta-data |
| **File Organization** | src/ (mixed with module code) | plugin/ (separate from module) |
| **Build System** | expo-module-scripts | expo-module-scripts + jest-expo |
| **Warning System** | Custom `CleverTapLog` | Expo `WarningAggregator` |
| **Xcode Build Settings Copy** | Yes (manual loop) | Yes (extracted to utility) |
| **Groovy/KTS Check** | No | Yes (warns on non-groovy) |

---

## 4. Patterns to Adopt

### From Iterable (Recommended)
1. **`withPlugins()` for composition** - cleaner than sequential `config = withX(config, props)` calls
2. **`withPodfile` instead of `withDangerousMod`** for Podfile modifications
3. **Inline NSE file content as constants** - no dependency on file copying from plugin package
4. **Test infrastructure** - mock configs, jest-expo preset, coverage thresholds
5. **`WarningAggregator`** for non-fatal configuration issues
6. **Separate `plugin/` directory** from native module code
7. **Groovy/KTS language check** before modifying build.gradle
8. **`createFileIfNoneExists`** to avoid overwriting user customizations
9. **Leverage existing Expo config fields** (e.g., `googleServicesFile`)
10. **EAS Build `appExtensions` documentation** in example

### From CleverTap (Selectively)
1. **Data-driven metadata config array** for AndroidManifest - very extensible pattern
2. **Custom NSE/NCE file path support** - important for power users
3. **App Group support** - needed for cross-process data sharing (push impressions, etc.)
4. **Gradle properties for feature flags** - allows build-time conditional dependencies
5. **Notification categories support** - useful for actionable notifications

## 5. Patterns to Avoid

1. **No tests** (CleverTap) - always include tests
2. **`withDangerousMod` for Podfile** (CleverTap) - use `withPodfile` when available
3. **String replacement in Swift files** (CleverTap) - brittle, hard to maintain
4. **Required deeply nested props** (CleverTap's `android.features`) - keep config flat when possible
5. **Mixing callback-based and Promise-based fs operations** (CleverTap's `fs.appendFile` callback in async handler)
6. **Inconsistent naming** (CleverTap's `withClevertap` vs `withCleverTap`)
7. **`fs-extra` in devDependencies** when it's used at config plugin runtime (CleverTap)
8. **Hardcoded dependency versions** without override mechanism (both plugins)
9. **No Expo SDK version guard** - neither plugin checks for minimum Expo SDK compatibility

## 6. Key Takeaways for Infobip Plugin

1. **Keep configuration simple** with sensible defaults (follow Iterable pattern), but allow deep customization (follow CleverTap's feature flag approach)
2. **Separate plugin code from module code** (`plugin/` directory pattern from Iterable)
3. **Use safe mods where possible** (`withPodfile`, `withInfoPlist`, `withEntitlementsPlist`, `withAndroidManifest`) and reserve `withDangerousMod` for file operations only
4. **Include comprehensive tests** from day one (Iterable pattern)
5. **NSE/NCE setup** - use inline content constants (Iterable) but support custom file paths (CleverTap)
6. **Xcode project manipulation** - both plugins use essentially the same pattern for adding extension targets; this is a well-established approach
7. **Android gradle** - use `mergeContents` with tagged blocks for idempotent modifications
8. **Configuration storage** - use Info.plist (iOS) and AndroidManifest meta-data or strings.xml (Android) to pass config to native code at runtime
9. **AppDelegate subscriber** pattern via `expo-module.config.json` is the right approach for lifecycle integration
