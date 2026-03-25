# Expo SDK & Config Plugin Research Report

**Date:** 2026-03-24
**Purpose:** Research latest Expo SDK version, config plugin APIs, and best practices for building the Infobip Mobile Messaging Expo plugin.

---

## 1. Latest Expo SDK Version

### Expo SDK 55 (Current Stable)
- **Released:** February 25, 2026
- **Latest patch:** 55.0.8 (published ~March 19, 2026)
- **React Native:** 0.83.1
- **React:** 19.2.0
- **Hermes:** v1 (major performance improvements, better ES6+ support)

### Key SDK 55 Changes
- **New package versioning:** All Expo packages now share the same major version as the SDK (e.g., `expo-camera@^55.0.0`), making compatibility obvious.
- **Legacy Architecture dropped:** SDK 55 no longer supports the old architecture -- only the New Architecture (Fabric/TurboModules).
- **Expo UI Library:** Approaching stable 1.0 (mid-2026), bridging SwiftUI and Jetpack Compose.
- **Expo Widgets:** New `expo-widgets` package for iOS Home Screen Widgets and Live Activities.

### Previous SDK
- **SDK 54:** React Native 0.81

### Release Cadence
- 3 SDK releases per year, with pre-release versions published between major releases.

---

## 2. Config Plugins API

### Core Concept
Config plugins use **mods** (modifiers) -- async functions that modify native project files during the `npx expo prebuild` process. This is central to Expo's **Continuous Native Generation (CNG)** philosophy: native projects are regenerated from config, not hand-maintained.

### Import Patterns

There are two valid import styles:

```typescript
// Preferred (ensures correct version matching your SDK):
import { ConfigPlugin, withInfoPlist } from 'expo/config-plugins';

// Also valid (direct package import):
import { ConfigPlugin, withInfoPlist } from '@expo/config-plugins';
```

The `expo/config-plugins` and `expo/config` packages are re-exported from the `expo` package. Importing through `expo` ensures version alignment.

### Available iOS Mod Plugins

| Mod | Purpose | Safety |
|-----|---------|--------|
| `withInfoPlist` | Modify `Info.plist` | Safe |
| `withEntitlementsPlist` | Modify `*.entitlements` | Safe |
| `withExpoPlist` | Modify `Expo.plist` | Safe |
| `withXcodeProject` | Modify `.xcodeproj` (parsed object) | Safe |
| `withPodfileProperties` | Modify `Podfile.properties.json` | Safe |
| `withAppDelegate` | Modify `AppDelegate` source | **Dangerous** |

### Available Android Mod Plugins

| Mod | Purpose | Safety |
|-----|---------|--------|
| `withAndroidManifest` | Modify `AndroidManifest.xml` | Safe |
| `withStringsXml` | Modify `strings.xml` | Safe |
| `withAndroidColors` | Modify `colors.xml` | Safe |
| `withAndroidColorsNight` | Modify `colors-night.xml` | Safe |
| `withAndroidStyles` | Modify `styles.xml` | Safe |
| `withGradleProperties` | Modify `gradle.properties` | Safe |
| `withMainActivity` | Modify `MainActivity` source | **Dangerous** |
| `withMainApplication` | Modify `MainApplication` source | **Dangerous** |
| `withProjectBuildGradle` | Modify root `build.gradle` | **Dangerous** |
| `withAppBuildGradle` | Modify app `build.gradle` | **Dangerous** |
| `withSettingsGradle` | Modify `settings.gradle` | **Dangerous** |

### `withDangerousMod`
- Used for direct file system access when no safe mod exists.
- Receives `config.modRequest.projectRoot` and `config.modRequest.platformProjectRoot`.
- Must be used sparingly -- regex-based file modification is fragile and version-sensitive.
- Requires re-verification with each SDK release.

### Plugin Structure Pattern

Every config plugin follows the same pattern:

```typescript
import { ConfigPlugin, withInfoPlist } from 'expo/config-plugins';

const withMyPlugin: ConfigPlugin<MyPluginProps> = (config, props) => {
  return withInfoPlist(config, (newConfig) => {
    newConfig.modResults['MyKey'] = props.myValue;
    return newConfig;
  });
};
```

The `modResults` object contains the parsed file content; the `modRequest` object provides paths and metadata.

---

## 3. Adding iOS Xcode Targets Programmatically

This is the most complex part of a push notification plugin -- adding the Notification Service Extension (NSE) target.

### Pattern from OneSignal (Reference Implementation)

OneSignal's approach uses `withXcodeProject` + `withDangerousMod`:

1. **Copy NSE source files** (via `withDangerousMod`):
   - `NotificationService.h`, `NotificationService.m`
   - `<TargetName>.entitlements`
   - `<TargetName>-Info.plist`

2. **Modify Xcode project** (via `withXcodeProject`):
   - Create `PBXGroup` for extension files
   - Add group to top-level project group
   - Workaround: ensure `PBXTargetDependency` and `PBXContainerItemProxy` objects exist
   - Call `xcodeProject.addTarget(name, 'app_extension', name, bundleId)`
   - Add build phases: `PBXSourcesBuildPhase`, `PBXResourcesBuildPhase`, `PBXFrameworksBuildPhase`
   - Set build settings: `DEVELOPMENT_TEAM`, `IPHONEOS_DEPLOYMENT_TARGET`, `TARGETED_DEVICE_FAMILY`, `CODE_SIGN_ENTITLEMENTS`, `CODE_SIGN_STYLE`
   - Add `DevelopmentTeam` target attribute to both new target and main target

3. **Modify Podfile** (via `withDangerousMod`):
   - Append NSE pod target block (e.g., `target 'OneSignalNotificationServiceExtension' do ... end`)
   - Check if already present to maintain idempotency

4. **Register with EAS credentials** (programmatic):
   - Set `config.extra.eas.build.experimental.ios.appExtensions` to declare the NSE target
   - Include `targetName`, `bundleIdentifier`, and `entitlements`

### Alternative: `@bacons/apple-targets`

Evan Bacon's community plugin provides a higher-level abstraction:
- Generates Apple targets from a `targets/` directory structure
- Each target has an `expo-target.config.js` for configuration
- Automatically mirrors app group entitlements
- Requires CocoaPods 1.16.2+, Xcode 16+, Expo SDK 53+
- Codesigning handled by EAS Build

### Key xcode Package APIs Used

The `xcode` npm package (used by `@expo/config-plugins` internally) provides:
- `pbxTargetByName(name)` -- check if target exists
- `addPbxGroup(files, name, path)` -- create file group
- `addToPbxGroup(uuid, parentKey)` -- nest group
- `addTarget(name, type, subfolder, bundleId)` -- create target
- `addBuildPhase(files, type, name, targetUuid)` -- add build phase
- `pbxXCBuildConfigurationSection()` -- access build settings
- `addTargetAttribute(key, value, target?)` -- set target attributes

---

## 4. Podfile Modification Strategies

### Recommended Approach: Avoid Direct Podfile Modification

Expo recommends interacting with the Podfile via:
1. **`withPodfileProperties`** -- safely modifies `Podfile.properties.json` (read by the Podfile template)
2. **Expo Autolinking hooks** -- programmatic interface via `expo-modules-autolinking`
3. **Write to JSON** and have the Podfile read static values

### When Direct Modification is Necessary

For NSE targets, direct Podfile modification is typically required. Best practices:

1. **Use `mergeContents`** from `@expo/config-plugins/build/utils/generateCode`:
   - Wraps content in `@generated begin/end` markers
   - Handles idempotency automatically
   - Prevents duplicate insertions

   ```typescript
   import { mergeContents } from '@expo/config-plugins/build/utils/generateCode';

   const result = mergeContents({
     src: podfileContent,
     newSrc: nseTargetBlock,
     tag: 'my-plugin-nse',
     anchor: /use_expo_modules!/,
     offset: 1,
     comment: '#',
   });
   ```

2. **Check with regex first** (simpler but less robust):
   ```typescript
   if (!podfile.match(/target 'MyNSE'/)) {
     fs.appendFileSync(podfilePath, nseSnippet);
   }
   ```

### OneSignal's Podfile Pattern

```ruby
target 'OneSignalNotificationServiceExtension' do
  pod 'OneSignalXCFramework', '>= 5.0', '< 6.0'
  use_frameworks! :linkage => podfile_properties['ios.useFrameworks'].to_sym if podfile_properties['ios.useFrameworks']
end
```

---

## 5. App Groups and Entitlements

### Setting Entitlements via Config Plugin

```typescript
import { ConfigPlugin, withEntitlementsPlist } from 'expo/config-plugins';

const withAppGroups: ConfigPlugin = (config) => {
  return withEntitlementsPlist(config, (newConfig) => {
    const APP_GROUP_KEY = 'com.apple.security.application-groups';
    if (!Array.isArray(newConfig.modResults[APP_GROUP_KEY])) {
      newConfig.modResults[APP_GROUP_KEY] = [];
    }
    const groups = newConfig.modResults[APP_GROUP_KEY] as string[];
    const groupId = `group.${newConfig.ios?.bundleIdentifier}.infobip`;
    if (!groups.includes(groupId)) {
      groups.push(groupId);
    }
    return newConfig;
  });
};
```

### App Groups in app.json

You can also declare entitlements directly:

```json
{
  "expo": {
    "ios": {
      "entitlements": {
        "com.apple.security.application-groups": [
          "group.com.example.myapp"
        ]
      }
    }
  }
}
```

### EAS Capability Sync

EAS Build automatically synchronizes capabilities on the Apple Developer Console with your local entitlements. Merchant IDs, App Groups, and CloudKit Containers are auto-registered.

---

## 6. EAS Build: iOS Signing & Provisioning for Extensions

### How It Works

1. **Single target (default):** EAS automatically creates/manages distribution certificate + provisioning profile.
2. **Multiple targets (extensions):** Each target needs its own provisioning profile (can share the same distribution certificate).

### Declaring Extensions for EAS

```json
{
  "expo": {
    "extra": {
      "eas": {
        "build": {
          "experimental": {
            "ios": {
              "appExtensions": [
                {
                  "targetName": "MobileMessagingNotificationExtension",
                  "bundleIdentifier": "com.example.app.MobileMessagingNotificationExtension",
                  "entitlements": {
                    "com.apple.security.application-groups": [
                      "group.com.example.app.infobip"
                    ]
                  }
                }
              ]
            }
          }
        }
      }
    }
  }
}
```

### Credential Generation Flow

1. **Before build starts:** EAS CLI reads `appExtensions` to know what credentials are needed.
2. **Automatic mode:** EAS generates provisioning profiles for each target using the Apple Developer account.
3. **Manual mode:** Developers provide credentials via `credentials.json`.
4. **Bare projects:** EAS CLI auto-detects extensions from the Xcode project.

### Development vs Distribution Provisioning

- **Development:** Used for development builds (`eas build --profile development`). Uses iOS App Development provisioning profiles.
- **Distribution (App Store):** Used for production builds. Uses iOS App Store Distribution provisioning profiles.
- **Ad Hoc (Internal Distribution):** Used for `eas build --profile preview`. Requires device UDIDs in the provisioning profile.

Each extension target needs its own provisioning profile for each build type.

### Common Issues

- Provisioning profiles generated by EAS may not support certain capabilities (e.g., Family Controls).
- Framework targets may erroneously be asked for provisioning profiles even when code-signing isn't needed.
- The `appExtensions` config is under `experimental` -- API may change.

---

## 7. `expo-build-properties` Plugin

### Purpose
Customizes native build properties without ejecting. Modifies `android/gradle.properties` and `ios/Podfile.properties.json`.

### Configuration

```json
{
  "expo": {
    "plugins": [
      [
        "expo-build-properties",
        {
          "ios": {
            "deploymentTarget": "15.1",
            "useFrameworks": "static"
          },
          "android": {
            "compileSdkVersion": 35,
            "targetSdkVersion": 35,
            "buildToolsVersion": "35.0.0",
            "minSdkVersion": 24
          }
        }
      ]
    ]
  }
}
```

### Key iOS Properties
- `deploymentTarget` -- minimum iOS version
- `useFrameworks` -- `'static'` or `'dynamic'` for `use_frameworks!`
- `extraPods` -- additional CocoaPods for all targets
- `ccacheEnabled` -- C++ compiler cache
- `newArchEnabled` -- React Native new architecture

### Known Issue
The deployment target is set on the app target but not always on the project level, which can cause mismatches.

---

## 8. Competitor Plugin Patterns

### OneSignal (`onesignal-expo-plugin@2.0.4`)

**Dependencies:**
```json
{
  "devDependencies": {
    "expo-module-scripts": "^5.0.8",
    "typescript": "^5.9.3"
  },
  "dependencies": {
    "@expo/image-utils": "^0.8.8"
  }
}
```
- No `peerDependencies` on `expo` declared (relies on it being available in the host project)
- Uses `@expo/config-plugins` and `@expo/config-types` imports
- Build: TypeScript compilation + file copy for NSE source files
- Entry point: `app.plugin.js`

**Expo APIs Used:**
- `ConfigPlugin` from `@expo/config-plugins`
- `withEntitlementsPlist`, `withInfoPlist`, `withXcodeProject`, `withDangerousMod`
- `ExpoConfig` from `@expo/config-types`
- Direct `fs` and `path` for file operations in dangerous mods

**Architecture:**
- `withOneSignal.ts` -- entry point, composes all sub-plugins
- `withOneSignalIos.ts` -- iOS-specific: entitlements, Info.plist, Xcode project, Podfile, NSE
- `withOneSignalAndroid.ts` -- Android-specific: manifest, resources
- `support/` -- file management, NSE template files, Podfile update, EAS config

### CleverTap (`@clevertap/clevertap-expo-plugin@0.0.4`)

**Dependencies:**
```json
{
  "devDependencies": {
    "expo": "48.0.0",
    "expo-module-scripts": "^3.0.4",
    "typescript": "^5.8.2"
  },
  "peerDependencies": {
    "expo": "*",
    "react": "*",
    "react-native": "*"
  }
}
```
- Declares `expo` as both a devDependency (pinned to SDK 48 -- quite old) and a wildcard peerDependency
- Uses `expo-module-scripts` for building
- Entry point: `app.plugin.js`

**Expo APIs Used:**
- `ConfigPlugin`, `withDangerousMod`, `withAndroidManifest`, `withSettingsGradle`, `withProjectBuildGradle`, `withAppBuildGradle`, `withGradleProperties`, `withStringsXml`
- `AndroidConfig` from `@expo/config-plugins`
- `ExpoConfig` from `expo/config`
- `mergeContents` from `@expo/config-plugins/build/utils/generateCode` -- for idempotent Gradle modifications
- Mixed import styles: both `expo/config-plugins` and `@expo/config-plugins`

---

## 9. Best Practices Summary (2026)

### Plugin Development

1. **Use safe mods over dangerous mods** whenever possible. Safe mods parse/serialize files properly and are idempotent.
2. **Use `mergeContents`** for any text-based file modifications (Gradle, Podfile) to ensure idempotency via generated markers.
3. **Test with `--clean` prebuild** (`npx expo prebuild --clean`) to verify clean generation.
4. **Avoid long-running tasks** in mods (no network requests, no Node module installation).
5. **Import from `expo/config-plugins`** (not `@expo/config-plugins`) to ensure version alignment -- though both work.
6. **Prefer `gradle.properties`** over direct Gradle file modification on Android.
7. **Prefer `Podfile.properties.json`** over direct Podfile modification on iOS (when possible).
8. **Register app extensions** with EAS via `extra.eas.build.experimental.ios.appExtensions` for proper credential generation.
9. **Support monorepos** by using `require.resolve('package-name/package.json')` for file paths.
10. **Set appropriate deployment targets** for extension targets to match or be compatible with the main app.

### Plugin Distribution

1. Entry point should be `app.plugin.js` in the package root.
2. Ship compiled JS (not TypeScript) in the `build/` directory.
3. Include static files (NSE templates, etc.) in the `files` array of `package.json`.
4. Declare `expo` as a `peerDependency` (wildcard `*` or range like `>=51.0.0`).
5. Keep `@expo/config-plugins` as a devDependency only (it's provided by the host project's `expo` installation).

### CNG Compatibility

1. Plugins must be **idempotent** -- running prebuild multiple times should produce the same result.
2. Never assume native project files exist from a previous run; always generate from scratch.
3. Use the `--clean` flag with prebuild for the safest regeneration.
4. Verify compatibility with each new SDK release, especially for dangerous mods.

---

## 10. Key Documentation Links

- [Expo SDK Reference](https://docs.expo.dev/versions/latest/)
- [Expo Config Plugins -- Introduction](https://docs.expo.dev/config-plugins/introduction/)
- [Expo Config Plugins -- Mods](https://docs.expo.dev/config-plugins/mods/)
- [Expo Config Plugins -- Dangerous Mods](https://docs.expo.dev/config-plugins/dangerous-mods/)
- [Expo Config Plugins -- Create and Use](https://docs.expo.dev/config-plugins/plugins/)
- [Expo Config Plugins -- Development for Libraries](https://docs.expo.dev/config-plugins/development-for-libraries/)
- [Expo Config Plugins -- Development and Debugging](https://docs.expo.dev/config-plugins/development-and-debugging/)
- [Expo iOS App Extensions](https://docs.expo.dev/build-reference/app-extensions/)
- [Expo iOS Capabilities](https://docs.expo.dev/build-reference/ios-capabilities/)
- [Expo Build Properties](https://docs.expo.dev/versions/latest/sdk/build-properties/)
- [Expo Autolinking](https://docs.expo.dev/modules/autolinking/)
- [Expo CNG](https://docs.expo.dev/workflow/continuous-native-generation/)
- [EAS Build Introduction](https://docs.expo.dev/build/introduction/)
- [Expo SDK 55 Changelog](https://expo.dev/changelog/sdk-55-beta)
- [@expo/config-plugins on npm](https://www.npmjs.com/package/@expo/config-plugins)
- [expo-build-properties on npm](https://www.npmjs.com/package/expo-build-properties)
- [OneSignal Expo Plugin](https://github.com/OneSignal/onesignal-expo-plugin)
- [CleverTap Expo Plugin](https://github.com/CleverTap/clevertap-expo-plugin)
- [@bacons/apple-targets](https://github.com/EvanBacon/expo-apple-targets)
- [expo-nse-plugin](https://github.com/pawicao/expo-nse-plugin)
- [generateCode.ts source](https://github.com/expo/expo/blob/main/packages/@expo/config-plugins/src/utils/generateCode.ts)
