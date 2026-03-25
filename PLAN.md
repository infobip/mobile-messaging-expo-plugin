# Infobip Mobile Messaging Expo Config Plugin - Implementation Plan

**Date:** 2026-03-24
**Target Expo SDK:** 55 (React Native 0.83.1, React 19.2.0)
**Target RN Plugin:** infobip-mobile-messaging-react-native-plugin v14.8.0
**iOS SDK Version:** MobileMessaging 15.0.0
**Android SDK Version:** infobip-mobile-messaging-android-sdk 14.14.2

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Decision](#2-architecture-decision)
3. [Configuration Schema](#3-configuration-schema)
4. [Task Breakdown](#4-task-breakdown)
5. [iOS Implementation Details](#5-ios-implementation-details)
6. [Android Implementation Details](#6-android-implementation-details)
7. [Idempotency Strategy](#7-idempotency-strategy)
8. [Testing Strategy](#8-testing-strategy)
9. [Risks & Mitigations](#9-risks--mitigations)
10. [Open Questions](#10-open-questions)
11. [File Structure](#11-file-structure)
12. [Release & Maintenance](#12-release--maintenance)

---

## 1. Executive Summary

Build a standalone Expo config plugin (`infobip-mobile-messaging-expo-plugin`) that automates the native setup of the Infobip Mobile Messaging React Native plugin for Expo managed workflow projects. The plugin will handle:

- **iOS:** Push entitlements, background modes, App Groups, Info.plist keys, Notification Service Extension (NSE) target creation, Podfile modifications, AppDelegate integration, and EAS Build credential configuration
- **Android:** Google Services Gradle plugin setup, `google-services.json` copying, and optional deep link configuration

**Key insight from competitor analysis:** The Notification Service Extension target creation is the single most complex and error-prone piece. OneSignal's battle-tested approach (template files + Xcode project manipulation + Podfile + EAS credentials) is the gold standard. We adopt their proven patterns while incorporating improvements from Iterable (cleaner code, test suite, `withPodfile`, `createFileIfNoneExists`) and CleverTap (App Groups, data-driven AndroidManifest, custom NSE path support).

---

## 2. Architecture Decision

### Standalone Package (Recommended)

The config plugin should be a **standalone npm package** (`infobip-mobile-messaging-expo-plugin`), separate from the existing RN plugin. Reasons:

- All 3 competitors (OneSignal, CleverTap, Iterable) use standalone packages
- Independent release cycle -- can update for new Expo SDK without touching the RN plugin
- Cleaner dependency graph -- users only install when using Expo
- The RN plugin remains framework-agnostic (works with bare RN, Expo, etc.)

### Plugin Composition Pattern

Follow Iterable's `withPlugins()` composition pattern (Expo best practice):

```typescript
import { ConfigPlugin, withPlugins } from 'expo/config-plugins';

const withInfobipMobileMessaging: ConfigPlugin<PluginProps> = (config, props) => {
  validateProps(props);
  return withPlugins(config, [
    [withInfobipIos, props],
    [withInfobipAndroid, props],
  ]);
};
```

Each platform handler is itself a composition of focused sub-plugins.

### Directory Separation

Follow Iterable's pattern: keep config plugin code in `plugin/` directory, separate from any future native module code (if needed).

---

## 3. Configuration Schema

```typescript
type InfobipPluginProps = {
  // --- Required ---
  // (none -- all can have sensible defaults)

  // --- iOS ---
  iosMode?: 'development' | 'production'; // APS environment. Default: 'development'
  iosAppGroupSuffix?: string;             // App group suffix. Default: 'infobip'
                                          // Full ID: group.<bundleId>.<suffix>
  enableNotificationExtension?: boolean;  // Create NSE target. Default: true
  iosNSEFilePath?: string;               // Custom NotificationService.swift path
  iosDeploymentTarget?: string;          // NSE min iOS version. Default: '15.0'
  devTeam?: string;                      // Apple Team ID for code signing

  // --- Android ---
  enableGoogleServices?: boolean;         // Add Google Services plugin. Default: true
  googleServicesFilePath?: string;        // Path to google-services.json (falls back to
                                          // expo.android.googleServicesFile if not set)

  // --- Optional Features ---
  enableWebRTC?: boolean;                 // Enable WebRTC/In-App Calls. Default: false
  deepLinkScheme?: string;               // Custom deep link scheme (e.g., 'com.infobip.mobilemessaging')
};
```

**Design principles:**
- All props optional with sensible defaults (follow Iterable)
- Flat structure, no deeply nested objects (avoid CleverTap's complexity)
- Feature flags for optional capabilities (follow CleverTap's gradle properties pattern)
- Support custom NSE file path for power users (follow OneSignal/CleverTap)

---

## 4. Task Breakdown

### Phase 1: Project Scaffolding (Estimated: 2-3 days)

| # | Task | Priority | Details |
|---|------|----------|---------|
| 1.1 | Initialize npm package | P0 | `package.json` with name, version, entry point, peer deps (`expo: ">=55.0.0"`), dev deps (`expo-module-scripts`, `typescript`, `jest`, `jest-expo`) |
| 1.2 | Set up TypeScript config | P0 | `tsconfig.json` targeting ES2020, strict mode, output to `build/` |
| 1.3 | Create `app.plugin.js` entry point | P0 | `module.exports = require('./build/plugin/withInfobipMobileMessaging.js')` |
| 1.4 | Set up build scripts | P0 | `"build": "tsc && cp -a plugin/src/support build/plugin/support"` for copying NSE template files |
| 1.5 | Set up Jest test infrastructure | P1 | Jest config with `jest-expo` preset, mock configs, 80% coverage threshold (follow Iterable) |
| 1.6 | Create plugin types (`types.ts`) | P0 | `InfobipPluginProps` type + prop validation function |
| 1.7 | Create main entry (`withInfobipMobileMessaging.ts`) | P0 | Validates props, applies defaults, delegates to iOS/Android handlers |
| 1.8 | Add `.gitignore`, `LICENSE`, `README.md` scaffolding | P1 | Standard npm package files |

### Phase 2: iOS - Basic Config Plugin (Estimated: 3-4 days)

| # | Task | Priority | Details |
|---|------|----------|---------|
| 2.1 | `withInfobipEntitlements` - APS environment | P0 | Set `aps-environment` from `iosMode` prop using `withEntitlementsPlist` (safe mod). Direct assignment, idempotent. |
| 2.2 | `withInfobipEntitlements` - App Groups | P0 | Add `group.<bundleId>.<suffix>` to `com.apple.security.application-groups` array. Check with `.includes()` before adding. Handle non-array existing values. |
| 2.3 | `withInfobipInfoPlist` - Background Modes | P0 | Add `remote-notification` to `UIBackgroundModes`. Check with `.includes()` before adding. |
| 2.4 | `withInfobipInfoPlist` - App Group Key | P0 | Set `com.mobilemessaging.app_group` to `group.<bundleId>.<suffix>`. This is Infobip-specific; the SDK reads this key to know which app group to use. |
| 2.5 | `withInfobipAppDelegate` - SDK Installation | P0 | **Decision needed:** ExpoAppDelegateSubscriber (preferred) vs `withAppDelegate` dangerous mod. See [Section 5.4](#54-appdelegate-integration-the-hardest-decision). |
| 2.6 | Write unit tests for basic iOS mods | P1 | Test each mod function with mock configs. Verify idempotency (run twice, same result). |

### Phase 3: iOS - Notification Service Extension (Estimated: 5-7 days)

This is the **most complex and critical phase**.

| # | Task | Priority | Details |
|---|------|----------|---------|
| 3.1 | Create NSE template files | P0 | `NotificationService.swift`, `InfobipNotificationServiceExtension-Info.plist`, `InfobipNotificationServiceExtension.entitlements`. Use `{{PLACEHOLDER}}` pattern for dynamic values. |
| 3.2 | `withInfobipNSEFiles` - Copy template files | P0 | Use `withDangerousMod` to create NSE directory and write files. Use `createFileIfNoneExists` pattern (Iterable) unless using default templates. Replace `{{BUNDLE_VERSION}}`, `{{BUNDLE_SHORT_VERSION}}`, `{{GROUP_IDENTIFIER}}` placeholders. Support custom NSE via `iosNSEFilePath` prop. |
| 3.3 | `withInfobipPodfile` - NSE pod target | P0 | Use `withDangerousMod` + `mergeContents` (tagged blocks) to append NSE target block to Podfile. Include `MobileMessagingNotificationExtension` pod. Respect `podfile_properties['ios.useFrameworks']` linkage setting. Check for existing target before adding. |
| 3.4 | `withInfobipXcodeProject` - NSE target | P0 | Use `withXcodeProject` to: (1) Check if target exists via `pbxTargetByName()`, (2) Create PBXGroup, (3) Add to root group, (4) Add `app_extension` target, (5) Add build phases (Sources, Resources, Frameworks), (6) Configure build settings (DEVELOPMENT_TEAM, IPHONEOS_DEPLOYMENT_TARGET, CODE_SIGN_ENTITLEMENTS, CODE_SIGN_STYLE=Automatic, SWIFT_VERSION=5.5), (7) Set DevelopmentTeam target attribute. Guard BOTH target AND group (improve on OneSignal/CleverTap bugs). |
| 3.5 | `withInfobipEasCredentials` - EAS extension config | P0 | Inject `config.extra.eas.build.experimental.ios.appExtensions` with targetName, bundleIdentifier, and entitlements. Deduplicate by checking existing entries for same `targetName` (improve on OneSignal's gap). |
| 3.6 | NSE pod version strategy | P0 | **Decision needed:** How to determine the `MobileMessagingNotificationExtension` pod version. Options: (A) Accept as prop with default, (B) Read from RN plugin podspec at prebuild time via `require.resolve`, (C) Hardcode and release in lockstep with RN plugin. **Recommendation:** Option A with default matching current RN plugin version. Document version coupling clearly. |
| 3.7 | Write unit tests for NSE creation | P1 | Test Xcode project modification with mock pbxproj. Test Podfile mergeContents. Test template placeholder replacement. Test idempotency. |
| 3.8 | Write integration test for iOS prebuild | P1 | Create fixture Expo project, run prebuild, verify generated files. |

### Phase 4: Android Config Plugin (Estimated: 2-3 days)

| # | Task | Priority | Details |
|---|------|----------|---------|
| 4.1 | `withInfobipGoogleServicesPlugin` - Root build.gradle | P0 | Add `com.google.gms:google-services:4.4.2` classpath using `withProjectBuildGradle` + `mergeContents` with tagged block. Handle both Groovy and Kotlin DSL syntax. Check for existing classpath before adding. |
| 4.2 | `withInfobipGoogleServicesPlugin` - App build.gradle | P0 | Apply `com.google.gms.google-services` plugin using `withAppBuildGradle`. Check for existing `apply plugin` or `plugins { id(...) }` before adding. Handle both Groovy and KTS. |
| 4.3 | `withInfobipGoogleServicesFile` - Copy google-services.json | P0 | Use `withDangerousMod` to copy `google-services.json` from user-specified path or `expo.android.googleServicesFile` to `android/app/`. Print clear warning if file doesn't exist. |
| 4.4 | `withInfobipDeepLinks` - Optional deep link config | P2 | Use `withAndroidManifest` to add intent-filter with custom scheme if `deepLinkScheme` prop is set. |
| 4.5 | `withInfobipWebRTC` - Optional WebRTC config | P2 | Use `withGradleProperties` to set `withWebRTCUI=true` if `enableWebRTC` prop is set. Defer to later version. |
| 4.6 | Write unit tests for Android mods | P1 | Test gradle modifications, manifest changes, google-services.json copy. |

### Phase 5: Documentation & Polish (Estimated: 2-3 days)

| # | Task | Priority | Details |
|---|------|----------|---------|
| 5.1 | Write README.md | P0 | Installation, configuration, usage examples, EAS Build setup, local build setup, troubleshooting |
| 5.2 | Write EAS_SETUP.md | P0 | Detailed guide for EAS Build credential management: managed credentials (easy path), local credentials (manual path). Cover development, ad hoc, and App Store provisioning. |
| 5.3 | Write TROUBLESHOOTING.md | P1 | Common issues: NSE not working, provisioning errors, pod install failures, google-services.json errors, Expo Go incompatibility warning. |
| 5.4 | Create example app.json configuration | P0 | Show minimal and full configuration examples. |
| 5.5 | Add Expo Go incompatibility warning | P0 | Plugin should log a clear warning that it requires a development build and does NOT work with Expo Go. |
| 5.6 | Add prop validation with clear error messages | P1 | Validate all props at plugin entry. Reject unknown properties. Type-check values. |

### Phase 6: Testing & Validation (Estimated: 3-5 days)

| # | Task | Priority | Details |
|---|------|----------|---------|
| 6.1 | Unit test full suite | P0 | All mod functions, prop validation, idempotency, edge cases |
| 6.2 | Integration test: prebuild --clean | P0 | Fresh prebuild generates correct native project |
| 6.3 | Integration test: prebuild (re-run) | P0 | Second prebuild produces identical results (idempotency) |
| 6.4 | Manual test: EAS Build (development profile) | P0 | Build succeeds, push notifications work, NSE receives and processes |
| 6.5 | Manual test: EAS Build (production profile) | P0 | App Store build succeeds with correct provisioning |
| 6.6 | Manual test: Local build (Xcode) | P1 | Prebuild + Xcode build + manual signing works |
| 6.7 | Manual test: With expo-notifications | P1 | Verify no conflicts when both plugins are present |
| 6.8 | Manual test: Android debug + release | P0 | Both build types succeed, push works |
| 6.9 | Manual test: Monorepo setup | P2 | Verify `require.resolve` paths work in monorepo |
| 6.10 | Manual test: IPA archive (Archive in Xcode) | P1 | Verify NSE is included in the archive, correct provisioning applied |
| 6.11 | Manual test: --clean after config change | P1 | Change devTeam/appGroup, clean prebuild picks up new values |

---

## 5. iOS Implementation Details

### 5.1 Entitlements & Info.plist (Tasks 2.1-2.4)

Straightforward safe mod usage. Key patterns:

```typescript
// Entitlements - aps-environment (safe mod, scalar value)
withEntitlementsPlist(config, (newConfig) => {
  newConfig.modResults['aps-environment'] = props.iosMode;
  return newConfig;
});

// Entitlements - App Groups (safe mod, array with dedup)
withEntitlementsPlist(config, (newConfig) => {
  const key = 'com.apple.security.application-groups';
  const existing = newConfig.modResults[key];
  if (!Array.isArray(existing)) {
    newConfig.modResults[key] = [];
  }
  const groupId = `group.${newConfig.ios?.bundleIdentifier}.${props.iosAppGroupSuffix ?? 'infobip'}`;
  if (!newConfig.modResults[key].includes(groupId)) {
    newConfig.modResults[key].push(groupId);
  }
  return newConfig;
});

// Info.plist - Background Modes (safe mod, array with dedup)
withInfoPlist(config, (newConfig) => {
  if (!Array.isArray(newConfig.modResults.UIBackgroundModes)) {
    newConfig.modResults.UIBackgroundModes = [];
  }
  if (!newConfig.modResults.UIBackgroundModes.includes('remote-notification')) {
    newConfig.modResults.UIBackgroundModes.push('remote-notification');
  }
  return newConfig;
});

// Info.plist - Infobip App Group Key (safe mod, scalar)
withInfoPlist(config, (newConfig) => {
  newConfig.modResults['com.mobilemessaging.app_group'] =
    `group.${newConfig.ios?.bundleIdentifier}.${props.iosAppGroupSuffix ?? 'infobip'}`;
  return newConfig;
});
```

### 5.2 NSE Template Files (Task 3.1)

Three template files with `{{PLACEHOLDER}}` markers:

**`NotificationService.swift`:**
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

**`InfobipNotificationServiceExtension-Info.plist`:** (template with `{{BUNDLE_SHORT_VERSION}}`, `{{BUNDLE_VERSION}}`)

**`InfobipNotificationServiceExtension.entitlements`:** (template with `{{GROUP_IDENTIFIER}}`)

### 5.3 Podfile Modification (Task 3.3)

Use `mergeContents` for idempotent tagged insertion:

```typescript
import { mergeContents } from '@expo/config-plugins/build/utils/generateCode';

// IMPORTANT: Target name (InfobipNotificationServiceExtension) != Pod name (MobileMessagingNotificationExtension)
// They MUST differ to avoid CocoaPods conflicts.
const nseTarget = `
target 'InfobipNotificationServiceExtension' do
  use_frameworks! :linkage => podfile_properties['ios.useFrameworks'].to_sym if podfile_properties['ios.useFrameworks']
  use_frameworks! :linkage => ENV['USE_FRAMEWORKS'].to_sym if ENV['USE_FRAMEWORKS']
  pod 'MobileMessagingNotificationExtension', '${nseVersion}'
end
`;

const result = mergeContents({
  src: podfileContent,
  newSrc: nseTarget,
  tag: 'infobip-mobile-messaging-nse',
  anchor: /target\s+'[^']+'\s+do/,  // anchor after first target block
  offset: 0,
  comment: '#',
});
```

#### CocoaPods Linkage Strategy

The NSE target MUST match the main app's framework linkage or `pod install` / build will fail with linker errors. Expo's Podfile template checks two sources:

1. **`podfile_properties['ios.useFrameworks']`** -- set via `expo-build-properties` plugin in `app.json`:
   ```json
   ["expo-build-properties", { "ios": { "useFrameworks": "static" } }]
   ```
2. **`ENV['USE_FRAMEWORKS']`** -- environment variable fallback

We check BOTH in the NSE target block, matching Expo's own Podfile template exactly. This is the Iterable approach (most correct). OneSignal and CleverTap only check `podfile_properties`, missing the `ENV` fallback.

| Scenario | Config | Effect |
|----------|--------|--------|
| Default (no frameworks) | neither set | No `use_frameworks!` -- pods linked as static libraries |
| Static frameworks | `"useFrameworks": "static"` or `USE_FRAMEWORKS=static` | `use_frameworks! :linkage => :static` |
| Dynamic frameworks | `"useFrameworks": "dynamic"` or `USE_FRAMEWORKS=dynamic` | `use_frameworks! :linkage => :dynamic` |

**Known SDK 55 issue:** `use_frameworks! :linkage => :static` with RN 0.83 can cause header resolution errors. This is an Expo-level issue, not ours, but should be documented in TROUBLESHOOTING.md.

#### Main App Linkage -- No Action Needed

Both Infobip podspecs (`MobileMessaging.podspec` and `MobileMessagingNotificationExtension.podspec`) are **linkage-agnostic**:
- Neither declares `s.static_framework = true`
- Neither requires `:modular_headers => true` (unlike CleverTap which needs it for ObjC/Swift interop)
- Both work with all 3 linkage modes (no frameworks, static, dynamic)

The NSE pod (`MobileMessagingNotificationExtension`) is especially clean: pure Swift, only system frameworks (`UserNotifications`, `Security`), zero third-party dependencies, and `APPLICATION_EXTENSION_API_ONLY = YES`.

**Why only the NSE target needs explicit linkage:** In the Expo-generated Podfile, `use_frameworks!` is declared **inside the main app's `target` block**, NOT at the top level. CocoaPods scopes `use_frameworks!` per target block -- it does not propagate into other target blocks. Our NSE target is appended as a separate `target '...' do ... end` block at the end of the Podfile, so it does NOT inherit the main target's linkage setting.

However, `podfile_properties` IS defined at the top level (before any target blocks), so it's accessible inside our NSE target block. That's why our snippet works -- we read the same `podfile_properties` and `ENV` variables.

**Verified against actual Expo-generated Podfile:**
```ruby
# podfile_properties defined here (top level, accessible everywhere)
podfile_properties = JSON.parse(File.read(...)) rescue {}

target 'MyApp' do                    # <-- main app
  use_expo_modules!
  # ...
  use_frameworks! :linkage => podfile_properties['ios.useFrameworks'].to_sym if podfile_properties['ios.useFrameworks']
  use_frameworks! :linkage => ENV['USE_FRAMEWORKS'].to_sym if ENV['USE_FRAMEWORKS']
  # ...
end

# @generated begin infobip-mobile-messaging-nse    <-- our NSE, appended here
target 'InfobipNotificationServiceExtension' do
  use_frameworks! :linkage => podfile_properties['ios.useFrameworks'].to_sym if podfile_properties['ios.useFrameworks']
  use_frameworks! :linkage => ENV['USE_FRAMEWORKS'].to_sym if ENV['USE_FRAMEWORKS']
  pod 'MobileMessagingNotificationExtension', '15.0.0'
end
# @generated end infobip-mobile-messaging-nse
```

**Summary of linkage responsibility:**

| Target | Who handles linkage? | How? |
|---|---|---|
| Main app | Expo's Podfile template | `use_frameworks!` inside main target block, reading `podfile_properties` / `ENV` |
| NSE extension | Our config plugin | Explicit `use_frameworks!` in separate NSE target block, reading same `podfile_properties` / `ENV` |

No config plugin work needed for the main app's linkage.

### 5.4 AppDelegate Integration (The Hardest Decision)

**Option A: ExpoAppDelegateSubscriber (Recommended)**

Create a native Swift file via `expo-module.config.json`:

```json
{
  "ios": {
    "appDelegateSubscribers": ["InfobipMobileMessagingAppDelegate"]
  }
}
```

Native Swift subscriber:
```swift
import ExpoModulesCore
import MobileMessaging

public class InfobipMobileMessagingAppDelegate: ExpoAppDelegateSubscriber {
    public func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
    ) -> Bool {
        MobileMessagingPluginApplicationDelegate.install()
        return true
    }
}
```

**REJECTED** -- see analysis below.

**Option B: withAppDelegate dangerous mod**

Parse and modify the AppDelegate source file to inject code.

**REJECTED** -- fragile across Expo versions, same delegate-hijacking problem if injecting `install()`.

**Option C: ExpoAppDelegateSubscriber with explicit forwarding, NO `install()` (CHOSEN)**

Instead of calling `install()` (which hijacks `UIApplication.shared.delegate` and breaks Expo's subscriber chain), explicitly forward the 2 required callbacks to the SDK's static methods. This is the same pattern Iterable uses.

```swift
import ExpoModulesCore
import MobileMessaging

public class InfobipAppDelegate: ExpoAppDelegateSubscriber {

    public func application(_ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        MobileMessaging.didRegisterForRemoteNotificationsWithDeviceToken(deviceToken)
    }

    public func application(_ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        // Guard: only forward Infobip payloads to avoid log noise.
        // MM_MTMessage.isCorrectPayload checks for "messageId" key in the payload.
        // Non-Infobip payloads (OneSignal, Firebase, etc.) are silently skipped.
        // Without this guard, the SDK logs "Error while converting payload to MMMessage"
        // for every non-Infobip push and returns .failed -- safe but noisy.
        if MM_MTMessage.isCorrectPayload(userInfo) {
            MobileMessaging.didReceiveRemoteNotification(
                userInfo, fetchCompletionHandler: completionHandler)
        }
        // Note: we intentionally don't call completionHandler for non-Infobip payloads.
        // Expo dispatches to ALL subscribers -- another subscriber will handle its own payloads.
    }
}
```

**Why NOT `install()`:**

`MobileMessagingPluginApplicationDelegate.install()` is NOT swizzling -- it's **delegate hijacking**:
```objc
_applicationDelegate = [UIApplication sharedApplication].delegate;  // save current
[[UIApplication sharedApplication] setDelegate:self];               // REPLACE with proxy
```

It replaces `UIApplication.shared.delegate` (which in Expo is the Expo-managed delegate that dispatches to all subscribers). This **breaks Expo's subscriber chain** -- other subscribers (Iterable, CleverTap, expo-notifications) would stop receiving delegate callbacks.

`install()` only intercepts 2 methods (forwarding everything else via `forwardInvocation:`):
1. `didRegisterForRemoteNotificationsWithDeviceToken` -- captures APNs token
2. `didReceiveRemoteNotification:fetchCompletionHandler:` -- handles background push

We can do the same thing directly in a subscriber without hijacking the delegate.

**Why the `isCorrectPayload` guard:**

The SDK's internal chain: `didReceiveRemoteNotification` → `handleAPNSMessage` → `MM_MTMessage(payload:)`.
`MM_MTMessage` is a failable init that returns `nil` if `payload["messageId"]` is missing.
For non-Infobip payloads, this results in:
- `logError("Error while converting payload to MMMessage")` (noisy but not a crash)
- `completion(.failed(...))` → `UIBackgroundFetchResult.failed`

The guard prevents this noise for multi-provider setups.

**Multi-provider compatibility:**

| Scenario | Behavior |
|----------|----------|
| Infobip only | Token forwarded, Infobip pushes handled |
| Infobip + OneSignal | Both subscribers get token callback, each forwards to own SDK. Background push: `isCorrectPayload` routes only Infobip payloads to Infobip SDK. |
| Infobip + expo-notifications | Same -- each subscriber handles its own payloads |
| Infobip + CleverTap | Works, but CleverTap's `autoIntegrate()` also swizzles -- potential conflict at the CleverTap level, not ours |

**What about `UNUserNotificationCenter.delegate`?**

`install()` does NOT set this. The SDK sets it during `MobileMessaging.start()` (called from JS). The SDK has an `overridingNotificationCenterDeleageDisabled` flag -- if the user has another push SDK, they can disable this. For v1.0, we let the SDK handle it as-is (same behavior as manual RN plugin setup).

**Competitor comparison:**

| SDK | AppDelegate Approach | Delegate Safe? |
|-----|---------------------|----------------|
| OneSignal | No native code at all (JS init only) | Yes |
| Iterable | ExpoAppDelegateSubscriber, explicit forwarding | Yes |
| CleverTap | ExpoAppDelegateSubscriber, `autoIntegrate()` (swizzles) | Risky |
| **Infobip** | **ExpoAppDelegateSubscriber, explicit forwarding (no `install()`)** | **Yes** |

**Native module requirement:** The Expo plugin needs a small native iOS module (podspec + Swift file) that depends on the RN plugin's `MobileMessaging` pod. The `expo-module.config.json` declares the `appDelegateSubscribers`.

### 5.5 NSE Xcode Project Modification (Task 3.4)

Critical implementation with improvements over competitors:

```typescript
withXcodeProject(config, (newConfig) => {
  const xcodeProject = newConfig.modResults;
  const targetName = 'InfobipNotificationServiceExtension';

  // Guard 1: Check if target already exists
  if (xcodeProject.pbxTargetByName(targetName)) {
    console.log(`[infobip] ${targetName} target already exists, skipping.`);
    return newConfig;
  }

  // Guard 2: Check if group already exists (prevent orphaned groups)
  // Improvement over OneSignal which doesn't check this
  const groups = xcodeProject.hash.project.objects['PBXGroup'];
  const groupExists = Object.values(groups).some(
    (g) => typeof g === 'object' && g.name === targetName
  );
  if (groupExists) {
    console.log(`[infobip] ${targetName} group already exists, skipping.`);
    return newConfig;
  }

  // 1. Create PBXGroup
  const extGroup = xcodeProject.addPbxGroup(
    ['NotificationService.swift', `${targetName}.entitlements`, `${targetName}-Info.plist`],
    targetName, targetName
  );

  // 2. Add to root group
  // ... (find root group, addToPbxGroup)

  // 3. Ensure required objects exist (xcode library workaround)
  const projObjects = xcodeProject.hash.project.objects;
  projObjects['PBXTargetDependency'] = projObjects['PBXTargetDependency'] || {};
  projObjects['PBXContainerItemProxy'] = projObjects['PBXContainerItemProxy'] || {};

  // 4. Create app_extension target
  const bundleId = `${config.ios?.bundleIdentifier}.${targetName}`;
  const nseTarget = xcodeProject.addTarget(targetName, 'app_extension', targetName, bundleId);

  // 5. Add build phases
  xcodeProject.addBuildPhase(['NotificationService.swift'], 'PBXSourcesBuildPhase', 'Sources', nseTarget.uuid);
  xcodeProject.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', nseTarget.uuid);
  xcodeProject.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', nseTarget.uuid);

  // 6. Configure build settings
  const configurations = xcodeProject.pbxXCBuildConfigurationSection();
  for (const key in configurations) {
    if (configurations[key].buildSettings?.PRODUCT_NAME === `"${targetName}"`) {
      const bs = configurations[key].buildSettings;
      bs.DEVELOPMENT_TEAM = props.devTeam;
      bs.IPHONEOS_DEPLOYMENT_TARGET = props.iosDeploymentTarget ?? '15.0';
      bs.TARGETED_DEVICE_FAMILY = '"1,2"';
      bs.CODE_SIGN_ENTITLEMENTS = `${targetName}/${targetName}.entitlements`;
      bs.CODE_SIGN_STYLE = 'Automatic';
      bs.SWIFT_VERSION = '5.5';
      bs.GENERATE_INFOPLIST_FILE = 'NO'; // We provide our own
      bs.INFOPLIST_FILE = `${targetName}/${targetName}-Info.plist`;
    }
  }

  // 7. Set target attributes
  xcodeProject.addTargetAttribute('DevelopmentTeam', props.devTeam, nseTarget);
  xcodeProject.addTargetAttribute('DevelopmentTeam', props.devTeam);

  return newConfig;
});
```

### 5.6 EAS Credentials Config (Task 3.5)

Improved over OneSignal -- deduplicate by `targetName`:

```typescript
const targetName = 'InfobipNotificationServiceExtension';
const bundleId = `${config.ios?.bundleIdentifier}.${targetName}`;
const groupId = `group.${config.ios?.bundleIdentifier}.${props.iosAppGroupSuffix ?? 'infobip'}`;

const existingExtensions = config.extra?.eas?.build?.experimental?.ios?.appExtensions ?? [];
const filtered = existingExtensions.filter(
  (ext: any) => ext.targetName !== targetName
);

config.extra = {
  ...config.extra,
  eas: {
    ...config.extra?.eas,
    build: {
      ...config.extra?.eas?.build,
      experimental: {
        ...config.extra?.eas?.build?.experimental,
        ios: {
          ...config.extra?.eas?.build?.experimental?.ios,
          appExtensions: [
            ...filtered,
            {
              targetName,
              bundleIdentifier: bundleId,
              entitlements: {
                'com.apple.security.application-groups': [groupId],
                'aps-environment': props.iosMode ?? 'development',
              },
            },
          ],
        },
      },
    },
  },
};
```

---

## 6. Android Implementation Details

### 6.1 Google Services Gradle Plugin (Tasks 4.1-4.2)

```typescript
// Root build.gradle - add classpath
withProjectBuildGradle(config, (newConfig) => {
  if (!newConfig.modResults.contents) return newConfig;

  const { contents } = newConfig.modResults;

  // Check if already present
  if (contents.includes('com.google.gms:google-services')) {
    return newConfig;
  }

  // Use mergeContents for idempotent tagged insertion
  const result = mergeContents({
    src: contents,
    newSrc: "        classpath('com.google.gms:google-services:4.4.2')",
    tag: 'infobip-google-services-classpath',
    anchor: /dependencies\s*\{/,
    offset: 1,
    comment: '//',
  });

  newConfig.modResults.contents = result.contents;
  return newConfig;
});

// App build.gradle - apply plugin
withAppBuildGradle(config, (newConfig) => {
  if (!newConfig.modResults.contents) return newConfig;
  const { contents } = newConfig.modResults;

  // Check for existing plugin application (both Groovy and KTS syntax)
  if (contents.includes('com.google.gms.google-services')) {
    return newConfig;
  }

  // Append at end of file
  newConfig.modResults.contents = contents + "\napply plugin: 'com.google.gms.google-services'\n";
  return newConfig;
});
```

### 6.2 google-services.json Copy (Task 4.3)

```typescript
withDangerousMod(config, ['android', async (config) => {
  const projectRoot = config.modRequest.projectRoot;
  const destPath = path.join(projectRoot, 'android', 'app', 'google-services.json');

  // Priority: plugin prop > Expo config
  const sourcePath = props.googleServicesFilePath
    ?? config.android?.googleServicesFile;

  if (!sourcePath) {
    console.warn('[infobip] No google-services.json path provided. ' +
      'Set googleServicesFilePath in plugin props or ' +
      'android.googleServicesFile in app.json. ' +
      'Android push notifications will not work without Firebase configuration.');
    return config;
  }

  const resolvedSource = path.resolve(projectRoot, sourcePath);
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`[infobip] google-services.json not found at: ${resolvedSource}`);
  }

  fs.copyFileSync(resolvedSource, destPath);
  return config;
}]);
```

---

## 7. Idempotency Strategy

Every modification MUST be idempotent. Strategy per modification type:

| Modification | Strategy | Pattern |
|---|---|---|
| Entitlements (scalar) | Direct assignment | `modResults[key] = value` |
| Entitlements (array) | Check `.includes()` before push | `if (!arr.includes(val)) arr.push(val)` |
| Info.plist (scalar) | Direct assignment | `modResults[key] = value` |
| Info.plist (array) | Check `.includes()` before push | Same as entitlements |
| Podfile | `mergeContents` with tagged blocks | `@generated begin/end` markers |
| Xcode project | `pbxTargetByName()` + group check | Early return if exists |
| build.gradle | `mergeContents` with tagged blocks | `@generated begin/end` markers |
| google-services.json | File copy (overwrite OK) | `fs.copyFileSync` |
| NSE template files | `createFileIfNoneExists` for custom, always overwrite for default | Preserves user customizations |
| EAS appExtensions | Filter by `targetName` then add | Prevents duplicates |

**Additional protections:**
- Handle non-array existing values for entitlement arrays (fix CleverTap's bug)
- Use synchronous file operations (fix CleverTap's race condition with async appendFile)
- Guard both Xcode target AND group (fix OneSignal's gap)

---

## 8. Testing Strategy

### Unit Tests (Automated, CI)

- **Framework:** Jest with `jest-expo` preset
- **Coverage threshold:** 80% minimum
- **What to test:**
  - Each mod function with mock config objects
  - Prop validation (valid and invalid inputs)
  - Idempotency (apply mod twice, assert same result)
  - Edge cases (missing values, empty arrays, non-array existing values)
  - Template placeholder replacement
  - `mergeContents` results for Podfile and Gradle

### Integration Tests (Automated, CI - requires macOS)

- Create a fixture Expo project in `__fixtures__/`
- Run `npx expo prebuild --no-install` programmatically
- Assert generated file contents:
  - `ios/<AppName>/Info.plist` contains expected keys
  - `ios/<AppName>/<AppName>.entitlements` has correct values
  - `ios/<AppName>.xcodeproj/project.pbxproj` contains NSE target
  - `ios/Podfile` contains NSE pod target
  - `android/app/build.gradle` contains Google Services plugin
  - `android/build.gradle` contains Google Services classpath
  - `android/app/google-services.json` exists

### Manual Tests (Pre-release)

- EAS Build development profile (iOS + Android)
- EAS Build production/App Store profile (iOS)
- Local Xcode build with manual signing
- Push notification delivery and display
- NSE delivery reports
- Rich push (image attachments)
- Coexistence with `expo-notifications`
- Clean prebuild after config changes

---

## 9. Risks & Mitigations

### Critical Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| NSE provisioning fails on local builds | Users can't build locally | HIGH | Document EAS as recommended path. Provide step-by-step local signing guide. |
| App group misconfigured, NSE silently fails | No delivery reports, no rich push | MEDIUM | Validate at prebuild time (check bundleId exists). Add runtime warning in SDK. |
| Pod version mismatch between RN plugin and NSE | Build failure or runtime data corruption | MEDIUM | Accept version as prop with default. Document version coupling. Consider reading from RN plugin podspec. |
| AppDelegate install() not called / called too late | Push notifications not received | MEDIUM | Use ExpoAppDelegateSubscriber, test execution order thoroughly. |
| Conflict with other NSE plugins | Only one NSE can be active per notification | MEDIUM | Document limitation. Support custom NSE file path for multi-SDK setups. |
| Expo SDK upgrade breaks dangerous mods | Build failure after upgrade | HIGH | Minimize dangerous mods. Test against SDK betas in CI. Pin supported SDK versions. |

### Moderate Risks

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| `use_frameworks!` linkage mismatch for NSE | Pod install or linker errors | LOW | Read `podfile_properties['ios.useFrameworks']` in NSE Podfile block |
| google-services.json missing on Android | Android push doesn't work | HIGH | Clear error message at prebuild. Leverage `expo.android.googleServicesFile`. |
| Gradle KTS vs Groovy syntax | Gradle modification fails | MEDIUM | Check file extension. Support both syntaxes. Fall back to WarningAggregator. |
| `aps-environment` conflict with other plugins | Wrong push environment | LOW | Document plugin ordering in `app.json plugins` array. |
| EAS `experimental` appExtensions API changes | NSE signing breaks on new EAS | LOW | Pin tested EAS CLI versions. Monitor Expo changelog. |

---

## 10. Open Questions & Resolved Decisions

### RESOLVED

1. **Standalone package** -- Confirmed. Separate npm package, not shipped inside the RN plugin.

2. **NSE target naming** -- Resolved. Xcode target: `InfobipNotificationServiceExtension`. Pod: `MobileMessagingNotificationExtension`. Different names to avoid CocoaPods conflicts.

3. **NSE pod version** -- Resolved. Always matches the native iOS SDK version.

4. **NSE opt-in/opt-out** -- Resolved. Opt-out (enabled by default, `enableNotificationExtension: false` to disable).
   - OneSignal: Always creates NSE, no opt-out
   - CleverTap: Opt-in (`enableRichMedia: true` required)
   - Iterable: Opt-out (`autoConfigurePushNotifications: false`, all-or-nothing)

5. **WebRTC/In-App Chat** -- Deferred to v1.1+.

6. **Minimum Expo SDK** -- SDK 55 only for v1.0.

7. **AppDelegate integration** -- Resolved. ExpoAppDelegateSubscriber with explicit forwarding of 2 delegate callbacks (no `install()`). Include `MM_MTMessage.isCorrectPayload` guard for multi-provider safety. See Section 5.4 for full analysis.

### STILL OPEN

8. **RN plugin version coupling** -- Release in lockstep or use compatibility matrix?

---

## 11. File Structure

```
infobip-mobile-messaging-expo-plugin/
├── app.plugin.js                          # Entry point -> build/plugin/withInfobipMobileMessaging.js
├── package.json
├── tsconfig.json
├── jest.config.js
├── LICENSE
├── README.md
├── EAS_SETUP.md
├── TROUBLESHOOTING.md
├── plugin/
│   ├── src/
│   │   ├── withInfobipMobileMessaging.ts  # Main entry, validates props, composes plugins
│   │   ├── types.ts                       # InfobipPluginProps type definition
│   │   ├── helpers.ts                     # Prop validation, logging utilities
│   │   ├── ios/
│   │   │   ├── withInfobipIos.ts          # iOS orchestrator (composes all iOS mods)
│   │   │   ├── withInfobipEntitlements.ts # APS environment + App Groups
│   │   │   ├── withInfobipInfoPlist.ts    # Background modes + app group key
│   │   │   ├── withInfobipNSEFiles.ts     # NSE template file creation
│   │   │   ├── withInfobipPodfile.ts      # Podfile NSE target addition
│   │   │   ├── withInfobipXcodeProject.ts # Xcode project NSE target creation
│   │   │   ├── withInfobipEasCredentials.ts # EAS appExtensions config
│   │   │   └── constants.ts               # Target names, file names, defaults
│   │   ├── android/
│   │   │   ├── withInfobipAndroid.ts      # Android orchestrator
│   │   │   ├── withInfobipGoogleServices.ts # Gradle plugin + classpath
│   │   │   ├── withInfobipGoogleServicesFile.ts # google-services.json copy
│   │   │   ├── withInfobipDeepLinks.ts    # Optional deep link intent-filter
│   │   │   └── constants.ts               # Gradle versions, defaults
│   │   └── support/
│   │       ├── nseTemplates/
│   │       │   ├── NotificationService.swift
│   │       │   ├── InfobipNotificationServiceExtension-Info.plist
│   │       │   └── InfobipNotificationServiceExtension.entitlements
│   │       └── FileManager.ts             # File utility (createFileIfNoneExists, etc.)
│   └── __tests__/
│       ├── __mocks__/                     # Mock Expo configs, mock pbxproj
│       ├── withInfobipEntitlements.test.ts
│       ├── withInfobipInfoPlist.test.ts
│       ├── withInfobipNSEFiles.test.ts
│       ├── withInfobipPodfile.test.ts
│       ├── withInfobipXcodeProject.test.ts
│       ├── withInfobipGoogleServices.test.ts
│       ├── withInfobipEasCredentials.test.ts
│       ├── helpers.test.ts
│       └── integration/
│           └── prebuild.test.ts           # Full prebuild integration test
├── ios/                                   # Native iOS module (AppDelegateSubscriber)
│   ├── InfobipMobileMessagingAppDelegate.swift
│   └── InfobipMobileMessagingExpoPlugin.podspec
├── expo-module.config.json                # Declares appDelegateSubscribers
├── research-infobip-rn-plugin.md          # Research artifact
├── research-onesignal-expo.md             # Research artifact
├── research-clevertap-iterable-expo.md    # Research artifact
├── research-expo-latest.md                # Research artifact
└── devils-advocate.md                     # Risk analysis artifact
```

---

## 12. Release & Maintenance

### Version Strategy

- **v1.0.0:** Core push notification support (iOS + Android), NSE, EAS Build support
- **v1.1.0:** WebRTC/In-App Chat support, deep link configuration
- **v1.2.0+:** Feature additions based on user feedback

### Expo SDK Compatibility

- **v1.x:** Expo SDK 55
- New Expo SDK major versions require validation and potential updates to dangerous mods
- Plan for ~3 maintenance releases per year aligned with Expo SDK releases

### RN Plugin Version Coupling

- The config plugin must be compatible with the RN plugin version it targets
- When the RN plugin bumps native SDK versions, the config plugin's default NSE pod version must be updated
- Publish compatibility matrix in README

### CI Pipeline

- **On PR:** Unit tests + lint
- **On merge to main:** Unit tests + integration tests (macOS runner) + build
- **On release:** Publish to npm, test against latest Expo SDK

### npm Publication

```json
{
  "name": "infobip-mobile-messaging-expo-plugin",
  "files": [
    "build",
    "app.plugin.js",
    "ios",
    "expo-module.config.json",
    "plugin/src/support"
  ]
}
```

---

## Appendix A: Competitor Feature Comparison

| Feature | OneSignal | CleverTap | Iterable | **Infobip (Planned)** |
|---|---|---|---|---|
| iOS NSE | Yes (ObjC) | Yes (Swift) | Yes (Swift) | **Yes (Swift)** |
| iOS NCE | No | Yes | No | **No (v1.0)** |
| App Groups | Yes | Yes | No | **Yes** |
| Custom NSE path | Yes | Yes | No | **Yes** |
| EAS Build support | Yes | No (documented) | Yes | **Yes** |
| Test suite | No | No | Yes (80%) | **Yes (80%)** |
| `withPodfile` (safe) | No (dangerous) | No (dangerous) | Yes | **Yes** |
| Tagged Gradle blocks | No | Yes | No | **Yes** |
| Kotlin DSL support | No | No | Fallback | **Fallback** |
| Idempotent NSE files | No (overwrites) | No (overwrites) | Yes (createIfNone) | **Yes (createIfNone)** |
| EAS deduplication | No | No | No | **Yes** |
| Xcode group guard | No | No | Yes | **Yes** |
| WebRTC support | N/A | N/A | N/A | **v1.1** |
| HMS/Huawei | N/A | Yes | No | **No (v1.0)** |

## Appendix B: Key Constants

```typescript
// IMPORTANT: Target name MUST differ from pod name to avoid CocoaPods conflicts.
// Pod name is 'InfobipNotificationServiceExtension' so target is branded differently.
export const NSE_TARGET_NAME = 'InfobipNotificationServiceExtension';
export const NSE_SOURCE_FILE = 'NotificationService.swift';
export const NSE_PLIST_FILE = `${NSE_TARGET_NAME}-Info.plist`;
export const NSE_ENTITLEMENTS_FILE = `${NSE_TARGET_NAME}.entitlements`;
export const NSE_POD_NAME = 'MobileMessagingNotificationExtension';
// NSE pod version always matches the native iOS SDK version
export const NSE_DEFAULT_POD_VERSION = '15.0.0';
export const DEFAULT_IOS_DEPLOYMENT_TARGET = '15.0';
export const DEFAULT_APP_GROUP_SUFFIX = 'infobip';
export const INFOBIP_APP_GROUP_PLIST_KEY = 'com.mobilemessaging.app_group';
export const GOOGLE_SERVICES_CLASSPATH_VERSION = '4.4.2';
export const MERGE_TAG_PREFIX = 'infobip-mobile-messaging';
```

### Naming Convention Rationale

The Xcode target name MUST NOT match the CocoaPods pod name. CocoaPods generates
build targets for each pod, and if the extension target has the same name as the pod,
it causes conflicts during `pod install` and build resolution.

| Competitor | Xcode Target Name | Pod Name |
|---|---|---|
| OneSignal | `OneSignalNotificationServiceExtension` | `OneSignalXCFramework` |
| CleverTap | `NotificationService` | `CTNotificationService` |
| Iterable | `IterableExpoRichPush` | `Iterable-iOS-AppExtensions` |
| **Infobip** | **`InfobipNotificationServiceExtension`** | **`MobileMessagingNotificationExtension`** |
