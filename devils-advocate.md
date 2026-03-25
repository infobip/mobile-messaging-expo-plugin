# Devil's Advocate Analysis: Infobip Mobile Messaging Expo Config Plugin

**Date:** 2026-03-24
**Purpose:** Brutally honest risk assessment of every failure mode, edge case, and hidden complexity before implementation begins.

---

## 1. iOS Signing & Provisioning Nightmares

### 1.1 The NSE Provisioning Profile Problem

The Notification Service Extension (NSE) is a **separate binary** with its own bundle ID (`<main-bundle-id>.MobileMessagingNotificationExtension`). This means:

- **It needs its own App ID** registered on the Apple Developer Portal
- **It needs its own provisioning profile** (separate from the main app)
- **It needs the App Groups capability enabled** on BOTH the main App ID AND the extension App ID

**What can go wrong:**

```
Scenario: User runs `npx expo prebuild` locally, then opens Xcode and builds.
Result: Xcode says "No provisioning profile found for
        com.example.app.MobileMessagingNotificationExtension"
```

The user must manually create the App ID and provisioning profile on the Apple Developer Portal, or use EAS Build with managed credentials.

### 1.2 EAS Managed Credentials -- the "Happy Path" That Isn't Always Happy

EAS Build reads `config.extra.eas.build.experimental.ios.appExtensions` to know it needs to provision the extension target. But:

- **The API is `experimental`** -- the key path includes the literal word "experimental". This means Expo reserves the right to change or remove it. OneSignal has been using it for years, so it's unlikely to vanish, but API stability is NOT guaranteed.
- **EAS auto-provisioning requires the Apple Developer account to be connected.** If the user uses manual credentials (`"credentialsSource": "local"` in eas.json), they must create TWO provisioning profiles and configure `credentials.json` for both targets. The documentation burden here is significant.
- **EAS doesn't always handle entitlements per-target correctly.** From OneSignal's known issues: "EAS doesn't respect entitlement files on a per-target basis. If multiple entitlements files exist, it picks one and applies it to both targets." We must add the push capability entitlement to BOTH entitlement files as a workaround.

### 1.3 Development vs Distribution vs Ad Hoc

Each build type requires different provisioning profiles:

| Build Type | Main App Profile | NSE Profile | Notes |
|---|---|---|---|
| Development | iOS Development | iOS Development | Both need App Groups capability |
| Ad Hoc (Internal) | Ad Hoc Distribution | Ad Hoc Distribution | Both need device UDIDs |
| App Store | App Store Distribution | App Store Distribution | Both need App Groups capability |

That's 6 provisioning profiles to manage (3 for main app + 3 for NSE). EAS handles this automatically for managed credentials, but for local/manual credentials, the user is on their own.

### 1.4 App Groups Capability Registration

The App Groups capability must be enabled on **both** App IDs in the Apple Developer Portal. If the user's Apple Developer account doesn't have App Groups enabled on the main app's App ID, the build will fail with a signing error.

**Failure scenario:**
```
User has been building their app fine for months without App Groups.
They add our plugin.
`npx expo prebuild` succeeds.
EAS Build fails with: "The entitlements 'com.apple.security.application-groups'
are not enabled for the App ID 'com.example.app'"
```

The user must go to the Apple Developer Portal and manually enable App Groups on their App ID, or use EAS capability sync (which handles this automatically, but only for managed credentials).

### 1.5 What About `npx expo prebuild` Without EAS?

If the user runs `npx expo prebuild` and then builds locally in Xcode (not via EAS), the NSE target will exist in the Xcode project but:

- No provisioning profile will be auto-created
- The user must manually configure signing in Xcode
- If they use `CODE_SIGN_STYLE = "Automatic"`, Xcode may prompt them to create the App ID and profile
- But if Automatic Signing fails (common in CI), they're stuck

**This is a documentation and support burden.** We need crystal-clear docs for both the EAS path and the local build path.

---

## 2. iOS Build Failures

### 2.1 MobileMessagingNotificationExtension Version Mismatch

The RN plugin podspec pins `MobileMessaging/Core` to version `15.0.0`:
```ruby
# infobip-mobile-messaging-react-native-plugin.podspec
s.dependency "MobileMessaging/Core", "15.0.0"
```

Our config plugin will need to add a Podfile target for the NSE:
```ruby
target 'MobileMessagingNotificationExtension' do
  pod 'MobileMessagingNotificationExtension', '15.0.0'
end
```

**Critical question: What version do we pin?**

- If we hardcode `15.0.0` and the RN plugin updates to `15.1.0` or `16.0.0`, the Expo plugin becomes incompatible.
- If we use `~> 15.0`, patch versions are fine but minor version mismatches could cause runtime issues (shared storage format changes, keychain key prefix changes).
- The iOS SDK local podspec shows `14.4.3` but the RN plugin podspec says `15.0.0` -- there's already a discrepancy between the local source and what the RN plugin expects.

**Recommendation question:** Should we read the version from the RN plugin's podspec at prebuild time? This adds complexity but prevents version drift.

### 2.2 CocoaPods vs SPM

The Infobip iOS SDK supports both CocoaPods and SPM (has a `Package.swift`). But:

- **The RN plugin only supports CocoaPods** (no SPM integration)
- **React Native itself uses CocoaPods** for iOS dependency management
- **Expo projects use CocoaPods** for iOS

So SPM is not a concern for now. But if Expo ever moves to SPM (unlikely in the medium term), this becomes a rewrite.

### 2.3 `use_frameworks!` Conflicts

Expo projects can use frameworks in different modes:
- No `use_frameworks!` (default)
- `use_frameworks! :linkage => :static`
- `use_frameworks! :linkage => :dynamic`

The NSE target's Podfile block must respect the same framework linkage as the main target. OneSignal handles this:
```ruby
target 'OneSignalNotificationServiceExtension' do
  pod 'OneSignalXCFramework', '>= 5.0', '< 6.0'
  use_frameworks! :linkage => podfile_properties['ios.useFrameworks'].to_sym if podfile_properties['ios.useFrameworks']
end
```

We need to do the same. If we don't, and the user has `use_frameworks! :linkage => :static`, the NSE target will link dynamically (default), causing linker errors or runtime crashes.

### 2.4 What If Another Plugin Already Has an NSE?

**This is a real problem.** If the user has `expo-notifications` or another push plugin that creates its own NSE target:

1. **Two NSE targets cannot coexist** -- iOS only calls ONE Notification Service Extension per notification.
2. If the user has OneSignal's NSE AND ours, only one will be invoked (whichever is the "active" target in the Xcode project).
3. The Infobip NSE already handles this gracefully in the `NotificationService.swift`:
   ```swift
   if MobileMessagingNotificationServiceExtension.isCorrectPayload(...) {
       MobileMessagingNotificationServiceExtension.didReceive(...)
   } else {
       contentHandler(request.content)  // pass through to default
   }
   ```
   But this only works if OUR NSE is the one being invoked. If another plugin's NSE is called instead, Infobip notifications won't get delivery reports or rich media.

**There is no clean solution here.** We should document: "If using another push SDK that requires an NSE, use a custom NSE file that delegates to both SDKs."

### 2.5 Minimum iOS Deployment Target Conflicts

The Infobip iOS SDK requires `iOS 15.0` minimum. The RN plugin podspec declares:
```ruby
s.platforms = { :ios => "15.0" }
```

If the user's Expo project has a lower deployment target (e.g., `14.0`), `pod install` will warn or fail. The NSE target must also have a deployment target of `15.0+`.

With Expo SDK 55 (RN 0.83), the default iOS deployment target is typically `15.1+`, so this should be fine. But SDK 54 or earlier may have lower defaults.

### 2.6 Xcode Version Compatibility

The `MobileMessaging` pod uses Swift 5.5 and requires Xcode 14+. The `MobileMessagingNotificationExtension` podspec also declares Swift 5.5. Expo SDK 55 requires Xcode 16+, so this should not be an issue. But if we support older Expo SDK versions, Xcode compatibility becomes relevant.

---

## 3. Android Build Failures

### 3.1 google-services.json Missing or Misconfigured

The Infobip Android SDK requires Firebase for push notifications. The user MUST provide a `google-services.json` file. Our config plugin needs to:

1. Apply `com.google.gms.google-services` Gradle plugin
2. Add the classpath dependency
3. Ensure `google-services.json` exists in `android/app/`

**Failure scenarios:**

- User forgets to add `google-services.json` -> build fails with a cryptic Gradle error
- User provides wrong `google-services.json` (wrong Firebase project) -> push registration silently fails at runtime
- Expo already has a `googleServicesFile` config field in `app.json`. Should we leverage it? (Iterable does.)

### 3.2 Multiple Plugins Applying Google Services

If the user has `expo-notifications` or another Firebase-dependent plugin, both may try to:
1. Add `com.google.gms:google-services` classpath
2. Apply `com.google.gms.google-services` plugin

This usually works fine (Gradle ignores duplicate `apply plugin` calls and duplicate classpath entries resolve to the latest version). But:

- **Version conflicts**: If plugin A adds `google-services:4.3.15` and we add `4.4.2`, Gradle picks the higher version. Usually fine, but COULD break if the older version is specifically required.
- **`mergeContents` from `@expo/config-plugins`** with tagged blocks helps here -- the same tagged block is idempotent, and different plugins use different tags.

### 3.3 ProGuard/R8 Rules

The RN plugin already ships `infobip-mm-proguard-rules.pro` as `consumerProguardFiles`. This means the rules are automatically included when the library is used. **No additional config plugin work needed.**

However, there's a subtle issue: the proguard file in the RN plugin keeps specific classes:
```
-keep class org.infobip.reactlibrary.mobilemessaging.Configuration* { *; }
-keep class com.infobip.webrtc.ui.InfobipRtcUi$Builder { *; }
```

If the user has aggressive R8 optimization (full mode), these rules may not be sufficient. But this is a pre-existing issue in the RN plugin, not something the Expo config plugin introduces.

### 3.4 Gradle Version Compatibility

The RN plugin's `build.gradle` uses Groovy DSL, not Kotlin DSL. Expo SDK 55 with RN 0.83 uses Kotlin DSL for some Gradle files (`settings.gradle.kts`, `build.gradle.kts`).

**Key questions:**
- Is the root `build.gradle` in Expo SDK 55 projects a `.gradle` or `.gradle.kts` file?
- Is the app `build.gradle` a `.gradle` or `.gradle.kts` file?

If Expo has moved to Kotlin DSL, our Groovy-based modifications (`apply plugin: 'com.google.gms.google-services'`) need to be in Kotlin syntax instead:
```kotlin
// Groovy:
apply plugin: 'com.google.gms.google-services'
// Kotlin DSL:
plugins { id("com.google.gms.google-services") }
```

**Iterable's plugin checks for this:**
```typescript
// Falls back to WarningAggregator if Kotlin DSL
```

We need to handle both.

### 3.5 AGP Version Conflicts

The RN plugin's `build.gradle` declares:
```groovy
classpath 'com.android.tools.build:gradle:8.11.1'
```

This is in the LIBRARY's buildscript, not the app's. Expo projects have their own AGP version. If there's a mismatch, Gradle may produce warnings or errors. This is a pre-existing RN plugin concern, not something we introduce.

### 3.6 `minSdkVersion` Requirements

The RN plugin declares `minSdk 21`. Expo SDK 55 projects default to `minSdkVersion 24`. This is fine (24 > 21). But if the user manually lowers their `minSdkVersion` below 21, the Infobip SDK will fail to compile.

---

## 4. Idempotency & Multi-Plugin Conflicts

### 4.1 `aps-environment` Overwrite Problem

Both `expo-notifications` and our plugin need to set `aps-environment`. It's a scalar value (last-write-wins):

```typescript
// Our plugin:
newConfig.modResults['aps-environment'] = props.mode; // "development"

// expo-notifications (if present):
newConfig.modResults['aps-environment'] = "development";
```

If both plugins set the same value, there's no conflict. But if our plugin sets `"production"` and another sets `"development"`, whichever runs LAST wins.

**Plugin execution order** is determined by the order in `app.json`'s `plugins` array. We should document: "Place the Infobip plugin AFTER other notification plugins in the plugins array to ensure correct APS environment."

### 4.2 App Groups Naming Conflicts

Infobip requires a specific app group format. The SDK reads it from Info.plist key `com.mobilemessaging.app_group`. The app group ID itself can be anything (e.g., `group.com.example.app.infobip`).

But if the user already has app groups from another plugin (e.g., `group.com.example.app.onesignal`), our plugin must **ADD** to the array, not **REPLACE** it:

```typescript
// CORRECT: additive
if (!groups.includes(ourGroupId)) {
  groups.push(ourGroupId);
}

// WRONG: destructive
newConfig.modResults[APP_GROUP_KEY] = [ourGroupId];
```

All competitor plugins handle this correctly. We must too.

### 4.3 `UIBackgroundModes` Deduplication

Multiple plugins may add `remote-notification` to `UIBackgroundModes`. This is safe as long as we check:
```typescript
if (!modes.includes('remote-notification')) {
  modes.push('remote-notification');
}
```

### 4.4 Podfile Target Name Collision

Our NSE target name (`MobileMessagingNotificationExtension` or similar) must be unique. If another plugin uses the same name (unlikely but possible), the Podfile will have duplicate target blocks causing `pod install` to fail.

---

## 5. Expo Prebuild Edge Cases

### 5.1 `prebuild --clean` Destroys NSE Files

`npx expo prebuild --clean` deletes the entire `ios/` and `android/` directories and regenerates them from scratch. This is by design (CNG philosophy).

**Implication:** All NSE files (NotificationService.swift, entitlements, plist) are regenerated from templates every time. Any manual customization is lost. This is actually CORRECT behavior for CNG, but users who manually edit NSE files will be surprised.

**The user's custom NSE file path (`iosNSEFilePath` prop)** solves this -- they keep their custom file outside the generated `ios/` directory and it gets copied in during prebuild.

### 5.2 Expo Go Incompatibility

**The config plugin has ZERO effect in Expo Go.** Expo Go is a pre-built app that doesn't run prebuild. Push notifications through Infobip will not work in Expo Go because:

1. No NSE target
2. No `MobileMessagingPluginApplicationDelegate.install()` call
3. No app group entitlements
4. No push capability

We MUST document this prominently: "This plugin requires a development build. It does not work with Expo Go."

### 5.3 EAS Build vs Local Build Differences

| Feature | EAS Build | Local Build (`npx expo prebuild` + Xcode) |
|---|---|---|
| Provisioning | Automatic (managed) or manual | Manual only |
| App Groups registration | Automatic via capability sync | Manual |
| NSE signing | Automatic | Manual in Xcode |
| google-services.json | Must be in project | Must be in project |
| CI/CD | Built-in | DIY |

The config plugin itself works identically in both cases (it runs during prebuild). The difference is in the post-prebuild signing and building step. We must support both paths.

### 5.4 Managed Workflow vs Bare Workflow

- **Managed workflow** (with CNG): Config plugin runs during every prebuild. The generated native project is disposable. This is the ideal use case.
- **Bare workflow** (ejected): The user has a committed `ios/` and `android/` directory. Running prebuild will MODIFY their committed native code. Some users may not want this. They should use the manual setup instructions instead.

---

## 6. Infobip-Specific Concerns

### 6.1 AppDelegate Injection: `MobileMessagingPluginApplicationDelegate.install()`

This is the most critical iOS requirement. The RN plugin requires this call in `didFinishLaunchingWithOptions`. In Expo, the AppDelegate is generated.

**Options for injection:**

1. **`withAppDelegate` mod (dangerous):** Parse and modify the generated AppDelegate source. Fragile across Expo versions.
2. **ExpoAppDelegateSubscriber pattern:** Create a native Swift file that subscribes to app lifecycle events. CleverTap and Iterable use this approach via `expo-module.config.json`:
   ```json
   {
     "ios": {
       "appDelegateSubscribers": ["InfobipAppDelegate"]
     }
   }
   ```
   This is cleaner but requires the Expo Modules infrastructure.
3. **Direct swizzling:** The `MobileMessagingPluginApplicationDelegate.install()` call itself does swizzling. If we call it early enough (e.g., in an AppDelegateSubscriber's `didFinishLaunchingWithOptions`), it should work.

**Risk with option 2/3:** The order of `AppDelegateSubscriber` execution is not guaranteed. If another subscriber registers for push notifications before ours calls `install()`, the Infobip SDK won't intercept the device token callback.

**Risk with option 1:** If Expo changes the AppDelegate template (e.g., from Swift to ObjC, or changes the method signature), our regex-based modification breaks. This has happened before with Expo SDK major version upgrades.

**Verified from source:** The RN plugin's Example uses a Swift AppDelegate with `import MobileMessaging` and `MobileMessagingPluginApplicationDelegate.install()`. The install method is defined in ObjC (`MobileMessagingPluginApplicationDelegate.h`).

### 6.2 App Group ID in Info.plist

The Infobip SDK reads the app group ID from a **non-standard Info.plist key**: `com.mobilemessaging.app_group`. This is confirmed in the source:

```swift
// MMNSEConstants.swift
enum InfoPlistKeys {
    static let appGroupId = "com.mobilemessaging.app_group"
}

// MMNSEUtils.swift
var appGroupId: String? {
    return self.object(forInfoDictionaryKey: MMNSEConsts.InfoPlistKeys.appGroupId) as? String
}
```

The NSE reads this from the **MAIN app's Info.plist** (not the NSE's Info.plist) via `Bundle.mainAppBundle`:
```swift
static var mainAppBundle: Bundle {
    var bundle = Bundle.main
    if bundle.bundleURL.pathExtension == "appex" {
        let url = bundle.bundleURL.deletingLastPathComponent().deletingLastPathComponent()
        if let otherBundle = Bundle(url: url) {
            bundle = otherBundle
        }
    }
    return bundle
}
```

**Critical implication:** We must set `com.mobilemessaging.app_group` in the MAIN app's Info.plist, not the NSE's. The NSE navigates up from its `appex` bundle to find the main app bundle and reads the key from there.

### 6.3 Keychain Access Group = App Group ID

From `MMNSEKeychain.swift`:
```swift
init(accessGroup: String?) {
    let sharedPrefix = accessGroup == nil ? "" : "shared."
    let bundleId = Bundle.mainAppBundle.bundleIdentifier ?? ""
    self.keyPrefix = sharedPrefix + MMNSEConsts.KeychainKeys.prefix + "/" + bundleId
    self.accessGroup = accessGroup
}
```

The keychain access group IS the app group ID. The NSE uses the app group ID as both:
1. **Keychain access group** (to read applicationCode and pushRegId)
2. **UserDefaults suite name** (to share message storage)

This means the App Groups entitlement serves double duty. If the app group is misconfigured, BOTH keychain access AND shared storage fail silently. The NSE will log:
```
"Could not start notification extension. ApplicationCode not found in keychain."
```

But users won't see this log unless they're actively debugging the extension.

### 6.4 WebRTC/In-App Chat Features

The RN plugin conditionally includes WebRTC:
```ruby
if defined?($WebRTCUIEnabled)
  s.dependency "MobileMessaging/WebRTCUI", mmVersion
end
```

And on Android:
```groovy
if (withWebRTCUI.toBoolean()) {
    implementation("com.infobip:infobip-rtc-ui:$mmVersion") { transitive = true }
}
```

**Question:** Does our config plugin need to support WebRTC configuration? If yes, we need:
- A `webRTCEnabled` prop
- Podfile property or global variable `$WebRTCUIEnabled = true`
- Android gradle property `withWebRTCUI=true`
- Additional camera/microphone permissions in Info.plist

**Recommendation:** Defer WebRTC support to a later version. Focus on core push notification functionality first.

### 6.5 Version Locking Between iOS SDK and NSE SDK

The RN plugin podspec locks to `MobileMessaging 15.0.0`. The NSE pod (`MobileMessagingNotificationExtension`) must be the SAME version because they share:
- Keychain key format (`MMNSEConsts.KeychainKeys.prefix`)
- UserDefaults storage format (noted in source: "Storage format is shared with DefaultSharedDataStorage")
- App group usage patterns

But the local iOS SDK shows version `14.4.3` in the podspec while the RN plugin expects `15.0.0`. This means the RN plugin is using a NEWER version of MobileMessaging than what's in the local iOS SDK git repo.

**For our config plugin:** We should either:
1. Read the version from the RN plugin's podspec at prebuild time (complex but correct)
2. Accept a version prop from the user (burden on user)
3. Use `~> 15.0` and hope for the best (risky)

### 6.6 Infobip's Firebase Requirement on Android

The Infobip Android SDK registers `MobileMessagingFirebaseService` in its manifest. This service handles `com.google.firebase.MESSAGING_EVENT`. Without Firebase (i.e., without `google-services.json` and the Google Services plugin), push notifications will NOT work on Android.

**Alternative noted in research:** Firebase options can be provided programmatically via `android.firebaseOptions` configuration key. But the standard path requires `google-services.json`.

Our config plugin should:
1. Check if `expo.android.googleServicesFile` is set in app config
2. If so, copy it to `android/app/google-services.json`
3. Add the Google Services Gradle plugin
4. If NOT set, print a clear warning (not fail -- the user may configure Firebase programmatically)

---

## 7. Testing & Maintenance Burden

### 7.1 How Do You Test a Config Plugin?

Config plugins modify Xcode projects and Android build files. To verify they work:

1. **Unit tests with mock configs** (Iterable approach): Parse a mock Xcode project, apply the plugin, assert changes. Doesn't catch real-world integration issues.
2. **Integration tests with `npx expo prebuild`**: Requires a real Expo project, runs prebuild, inspects generated files. Requires macOS for iOS tests.
3. **End-to-end tests**: Prebuild + build + install on device. Requires CI with Xcode and Android SDK.

**Minimum viable testing:**
- Unit tests for each mod function with mock data
- A "snapshot test" that runs prebuild on a fixture project and compares output
- Manual testing for signing/provisioning (can't be automated without Apple Developer account)

### 7.2 CI/CD Requirements

- **macOS runners** required for iOS prebuild tests (Xcode project parsing)
- **Android SDK** required for Android tests
- **No Apple Developer account** needed for prebuild testing (only for actual builds)

### 7.3 Version Matrix

| Dimension | Values to Support |
|---|---|
| Expo SDK | 55 (primary), possibly 54 |
| React Native | 0.83 (SDK 55), possibly 0.81 (SDK 54) |
| Infobip RN Plugin | Current (14.8.0) and future versions |
| iOS SDK | 15.0.0 (pinned by RN plugin) |
| Android SDK | 14.14.2 (pinned by RN plugin) |
| Xcode | 16+ (for SDK 55) |
| Node.js | 18+ |

**Maintenance trigger events:**
- New Expo SDK release (3x/year)
- New Infobip RN plugin release (changes native SDK version pins)
- New React Native architecture changes
- Xcode/AGP major version changes

### 7.4 Who Maintains This?

This is a genuine concern. The Expo ecosystem moves fast:
- 3 SDK releases per year
- Config plugin APIs can change between major versions
- `withDangerousMod` modifications are the most fragile (regex-based file parsing)

The OneSignal plugin has 2+ years of maintenance history and still gets bug reports about edge cases. We should plan for:
- A dedicated owner/team
- CI that tests against Expo SDK betas
- Version-specific branches if needed

---

## 8. Gaps in Competitor Analysis

### 8.1 What Competitors Do That We Missed

1. **OneSignal** has `iosNSEFilePath` for custom NSE files. We should support this too, since users may want to add additional push providers alongside Infobip.

2. **CleverTap** supports Notification Content Extension (NCE) for custom notification UIs. Infobip doesn't need this currently, but it could become relevant.

3. **Iterable** uses `createFileIfNoneExists` to avoid overwriting user customizations. OneSignal always overwrites. We should use the Iterable approach to be less destructive.

4. **None of the competitors** handle the case where the user already has a different NSE target. They all create their own and hope for the best. This is a gap in the entire ecosystem.

### 8.2 Common Issues from Competitor GitHub Issues

Based on common patterns in push SDK expo plugin issues:

1. **"Build fails after upgrading Expo SDK"** -- the most common issue. Expo SDK upgrades change native project templates.
2. **"NSE not working / delivery reports not received"** -- usually a signing or entitlements misconfiguration.
3. **"Pod install fails"** -- version conflicts between the SDK pod and other pods.
4. **"Works on EAS but not locally"** -- signing differences between EAS managed and local builds.
5. **"Plugin breaks with expo-notifications"** -- conflict between multiple notification plugins.

### 8.3 Features Infobip Needs That No Competitor Supports

1. **Dual Info.plist key**: The `com.mobilemessaging.app_group` key is Infobip-specific and no competitor has to deal with this pattern. The SDK reads the app group ID from Info.plist rather than having it hardcoded in the NSE.

2. **AppDelegate swizzling via `MobileMessagingPluginApplicationDelegate.install()`**: This is unique to Infobip. Other SDKs (OneSignal, CleverTap, Iterable) use the ExpoAppDelegateSubscriber pattern or direct module initialization. Infobip's approach requires an explicit install call that swizzles the AppDelegate.

3. **Keychain sharing via App Groups**: While other plugins use App Groups for UserDefaults sharing, Infobip also uses the app group as a keychain access group. This is a more sensitive operation and may require additional Keychain Sharing entitlement (`keychain-access-groups`) on some configurations.

---

## 9. Summary: Top 10 Risks Ranked by Impact

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | NSE provisioning profile not auto-created for local builds | **HIGH** | HIGH | Clear docs, EAS recommended path |
| 2 | App group misconfigured, NSE silently fails | **HIGH** | MEDIUM | Validation at prebuild, runtime SDK logs |
| 3 | MobileMessagingNotificationExtension pod version mismatch | **HIGH** | MEDIUM | Read version from RN plugin podspec |
| 4 | `MobileMessagingPluginApplicationDelegate.install()` injection fragile across Expo versions | **HIGH** | MEDIUM | Use ExpoAppDelegateSubscriber if possible |
| 5 | Conflict with other NSE-creating plugins (expo-notifications) | **MEDIUM** | MEDIUM | Document limitation, support custom NSE |
| 6 | `use_frameworks!` linkage mismatch for NSE target | **MEDIUM** | LOW | Read `podfile_properties` |
| 7 | google-services.json missing on Android | **MEDIUM** | HIGH | Clear error message at prebuild |
| 8 | EAS `experimental` appExtensions API changes | **MEDIUM** | LOW | Pin tested Expo SDK versions |
| 9 | Gradle KTS vs Groovy syntax mismatch | **MEDIUM** | MEDIUM | Check file extension, dual syntax |
| 10 | Expo SDK upgrade breaks dangerous mods | **MEDIUM** | HIGH | CI with SDK betas, minimize dangerous mods |

---

## 10. Critical Questions Before Implementation

1. **Do we build this as a standalone config plugin or as part of the RN plugin package?** Standalone is cleaner but adds a dependency. Part of RN plugin means tighter version coupling. All competitors use standalone packages.

2. **Do we use ExpoAppDelegateSubscriber or withAppDelegate for the install() call?** The subscriber pattern is cleaner but requires expo-modules-core infrastructure. The withAppDelegate approach is simpler but more fragile.

3. **What is the minimum supported Expo SDK version?** SDK 55 only? SDK 54+? This affects which APIs we can use and how much compat code we need.

4. **Should we support WebRTC/In-App Chat config from day one?** This significantly increases scope. Recommend deferring.

5. **How do we handle the NSE pod version?** Hardcode, read from RN plugin, or accept as a prop?

6. **What happens when the Infobip RN plugin bumps its native SDK version?** Do we release in lockstep? Do we use semver ranges?

7. **Should the config plugin REQUIRE the NSE, or make it optional?** The NSE is "optional but recommended" per the manual setup. Making it opt-in reduces initial complexity but means less capable defaults.
