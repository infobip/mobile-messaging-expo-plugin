# OneSignal Expo Plugin - Research Report

## Overview

The OneSignal Expo plugin (`onesignal-expo-plugin` v2.0.4) is a mature Expo Config Plugin that automates native iOS and Android configuration for push notifications, including iOS Notification Service Extension (NSE) support. It was developed in collaboration with SweetGreen.

**Repository**: `onesignal-expo-plugin`
**Dependencies**: `@expo/image-utils` (for Android icon resizing)
**Dev Dependencies**: `expo-module-scripts`, `oxlint`, `prettier`, `typescript`

---

## 1. Plugin Entry Point

### `app.plugin.js`
```js
module.exports = require('./build/onesignal/withOneSignal.js');
```

Simple re-export from the build directory. The TypeScript source is compiled to `build/` and the built files + template files are shipped via npm (`"files": ["build", "app.plugin.js"]`).

### `withOneSignal.ts` (Main Entry)
```ts
import { ConfigPlugin } from '@expo/config-plugins';

const withOneSignal: ConfigPlugin<OneSignalPluginProps> = (config, props) => {
  if (!props) throw new Error('...');
  validatePluginProps(props);
  config = withOneSignalIos(config, props);
  config = withOneSignalAndroid(config, props);
  return config;
};
```

**Pattern**: The main entry validates props, then delegates to platform-specific handlers. Each handler is a composition of smaller, focused config plugins.

---

## 2. Configuration Schema (Plugin Props)

```ts
type OneSignalPluginProps = {
  mode: Mode;                      // REQUIRED: "development" | "production" - APNs environment
  devTeam?: string;                // Apple Team ID (e.g., "91SW8A37CR")
  iPhoneDeploymentTarget?: string; // Min iOS version for NSE (default: "11.0")
  smallIcons?: string[];           // Android small notification icon paths
  smallIconAccentColor?: string;   // Android accent color (e.g., "#FF0000")
  largeIcons?: string[];           // Android large notification icon paths
  iosNSEFilePath?: string;         // Path to custom NSE implementation file
};
```

**Validation** (`helpers.ts`): Validates types of all props and rejects unknown properties with clear error messages.

---

## 3. iOS Modifications (The Complex Part)

The iOS configuration is composed of 7 separate config plugins applied in sequence:

```ts
export const withOneSignalIos: ConfigPlugin<OneSignalPluginProps> = (config, props) => {
  config = withAppEnvironment(config, props);          // 1. APS entitlement
  config = withRemoteNotificationsPermissions(config, props); // 2. Background modes
  config = withAppGroupPermissions(config, props);     // 3. App groups entitlement
  config = withOneSignalPodfile(config, props);        // 4. Podfile modification
  config = withOneSignalNSE(config, props);            // 5. NSE file copying
  config = withOneSignalXcodeProject(config, props);   // 6. Xcode project modification
  config = withEasManagedCredentials(config, props);   // 7. EAS credentials config
  return config;
};
```

### 3.1 Entitlements: APS Environment (`withAppEnvironment`)

Uses `withEntitlementsPlist` (safe mod):
```ts
const withAppEnvironment: ConfigPlugin<OneSignalPluginProps> = (config, onesignalProps) => {
  return withEntitlementsPlist(config, (newConfig) => {
    newConfig.modResults['aps-environment'] = onesignalProps.mode;
    return newConfig;
  });
};
```
Sets `aps-environment` to either `"development"` or `"production"` based on the `mode` prop.

### 3.2 Background Modes (`withRemoteNotificationsPermissions`)

Uses `withInfoPlist` (safe mod):
```ts
const withRemoteNotificationsPermissions: ConfigPlugin<OneSignalPluginProps> = (config) => {
  return withInfoPlist(config, (newConfig) => {
    if (!Array.isArray(newConfig.modResults.UIBackgroundModes)) {
      newConfig.modResults.UIBackgroundModes = [];
    }
    for (const key of ['remote-notification']) {
      if (!newConfig.modResults.UIBackgroundModes.includes(key)) {
        newConfig.modResults.UIBackgroundModes.push(key);
      }
    }
    return newConfig;
  });
};
```
Adds `remote-notification` to `UIBackgroundModes` array, idempotently.

### 3.3 App Groups (`withAppGroupPermissions`)

Uses `withEntitlementsPlist` (safe mod):
```ts
const withAppGroupPermissions: ConfigPlugin<OneSignalPluginProps> = (config) => {
  return withEntitlementsPlist(config, (newConfig) => {
    const APP_GROUP_KEY = 'com.apple.security.application-groups';
    if (!Array.isArray(newConfig.modResults[APP_GROUP_KEY])) {
      newConfig.modResults[APP_GROUP_KEY] = [];
    }
    const entitlement = `group.${newConfig?.ios?.bundleIdentifier || ''}.onesignal`;
    // Add only if not already present
    if (modResultsArray.indexOf(entitlement) !== -1) return newConfig;
    modResultsArray.push(entitlement);
    return newConfig;
  });
};
```

**Key pattern**: App group format is `group.<bundleIdentifier>.onesignal`. This is used for communication between the main app and the NSE.

### 3.4 Podfile Modification (`withOneSignalPodfile`)

Uses `withDangerousMod` (dangerous mod - direct filesystem access):
```ts
const withOneSignalPodfile: ConfigPlugin<OneSignalPluginProps> = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const iosRoot = path.join(config.modRequest.projectRoot, 'ios');
      updatePodfile(iosRoot).catch((err) => { OneSignalLog.error(err); });
      return config;
    },
  ]);
};
```

The `updatePodfile` function (`support/updatePodfile.ts`):
1. Reads existing Podfile
2. Checks if NSE target already exists (regex match)
3. If not, **appends** the following snippet to the Podfile:

```ruby
target 'OneSignalNotificationServiceExtension' do
  pod 'OneSignalXCFramework', '>= 5.0', '< 6.0'
  use_frameworks! :linkage => podfile_properties['ios.useFrameworks'].to_sym if podfile_properties['ios.useFrameworks']
end
```

**Important notes**:
- Uses `fs.appendFile` - simply appends to end of Podfile
- Idempotent via regex check: `/target 'OneSignalNotificationServiceExtension'/`
- The `use_frameworks!` line respects Expo's framework linkage settings
- The Podfile update is NOT awaited (fire-and-forget with `.catch()`)

### 3.5 Notification Service Extension Files (`withOneSignalNSE`)

Uses `withDangerousMod` (dangerous mod):

```ts
const withOneSignalNSE: ConfigPlugin<OneSignalPluginProps> = (config, props) => {
  const pluginDir = require.resolve('onesignal-expo-plugin/package.json');
  const sourceDir = path.join(pluginDir, '../build/support/serviceExtensionFiles/');

  return withDangerousMod(config, ['ios', async (config) => {
    const iosPath = path.join(config.modRequest.projectRoot, 'ios');

    // 1. Create NSE directory
    fs.mkdirSync(`${iosPath}/${NSE_TARGET_NAME}`, { recursive: true });

    // 2. Copy template files (header, entitlements, plist)
    for (const extFile of NSE_EXT_FILES) {
      await FileManager.copyFile(`${sourceDir}${extFile}`, `${iosPath}/${NSE_TARGET_NAME}/${extFile}`);
    }

    // 3. Copy NSE source (custom or default)
    const sourcePath = props.iosNSEFilePath ?? `${sourceDir}${NSE_SOURCE_FILE}`;
    await FileManager.copyFile(sourcePath, `${iosPath}/${NSE_TARGET_NAME}/${NSE_SOURCE_FILE}`);

    // 4. Update entitlements with actual group identifier
    const nseUpdater = new NseUpdaterManager(iosPath);
    await nseUpdater.updateNSEEntitlements(`group.${config.ios?.bundleIdentifier}.onesignal`);

    // 5. Update plist with version info
    await nseUpdater.updateNSEBundleVersion(config.ios?.buildNumber ?? '1');
    await nseUpdater.updateNSEBundleShortVersion(config?.version ?? '1.0');

    return config;
  }]);
};
```

**NSE Template Files** (in `src/support/serviceExtensionFiles/`):

1. **`NotificationService.h`** - Standard ObjC header extending `UNNotificationServiceExtension`
2. **`NotificationService.m`** - Implementation that delegates to OneSignal SDK:
   ```objc
   #import <OneSignalFramework/OneSignalFramework.h>
   // Calls OneSignal's didReceiveNotificationExtensionRequest and
   // serviceExtensionTimeWillExpireRequest
   ```
3. **`OneSignalNotificationServiceExtension-Info.plist`** - Template with placeholders:
   - `{{BUNDLE_SHORT_VERSION}}` - replaced with app version
   - `{{BUNDLE_VERSION}}` - replaced with build number
   - Extension point: `com.apple.usernotifications.service`
   - Principal class: `NotificationService`
4. **`OneSignalNotificationServiceExtension.entitlements`** - Template with placeholder:
   - `{{GROUP_IDENTIFIER}}` - replaced with `group.<bundleId>.onesignal`

**NseUpdaterManager** uses regex replacement on the template files:
- `GROUP_IDENTIFIER_TEMPLATE_REGEX = /{{GROUP_IDENTIFIER}}/gm`
- `BUNDLE_SHORT_VERSION_TEMPLATE_REGEX = /{{BUNDLE_SHORT_VERSION}}/gm`
- `BUNDLE_VERSION_TEMPLATE_REGEX = /{{BUNDLE_VERSION}}/gm`

**Key pattern**: Monorepo support via `require.resolve('onesignal-expo-plugin/package.json')` to find the plugin directory regardless of node_modules location.

### 3.6 Xcode Project Modifications (`withOneSignalXcodeProject`)

Uses `withXcodeProject` (safe mod - uses `xcode` npm package):

This is the most complex part. It modifies the `.pbxproj` file to:

```ts
const withOneSignalXcodeProject: ConfigPlugin<OneSignalPluginProps> = (config, props) => {
  return withXcodeProject(config, (newConfig) => {
    const xcodeProject = newConfig.modResults;

    // Skip if target already exists (idempotent)
    if (xcodeProject.pbxTargetByName(NSE_TARGET_NAME)) return newConfig;

    // 1. Create PBXGroup for extension files
    const extGroup = xcodeProject.addPbxGroup(
      [...NSE_EXT_FILES, NSE_SOURCE_FILE],
      NSE_TARGET_NAME, NSE_TARGET_NAME
    );

    // 2. Add group to root project group (makes files visible in Xcode)
    // Finds the root group (no name, no path) and adds the extension group to it
    const groups = xcodeProject.hash.project.objects['PBXGroup'];
    Object.keys(groups).forEach((key) => {
      if (typeof groups[key] === 'object' && groups[key].name === undefined && groups[key].path === undefined) {
        xcodeProject.addToPbxGroup(extGroup.uuid, key);
      }
    });

    // 3. Workaround for xcode library bug - ensure PBXTargetDependency exists
    const projObjects = xcodeProject.hash.project.objects;
    projObjects['PBXTargetDependency'] = projObjects['PBXTargetDependency'] || {};
    projObjects['PBXContainerItemProxy'] = projObjects['PBXTargetDependency'] || {};

    // 4. Add NSE as app_extension target
    const nseTarget = xcodeProject.addTarget(
      NSE_TARGET_NAME, 'app_extension', NSE_TARGET_NAME,
      `${config.ios?.bundleIdentifier}.${NSE_TARGET_NAME}`
    );

    // 5. Add build phases
    xcodeProject.addBuildPhase(['NotificationService.m'], 'PBXSourcesBuildPhase', 'Sources', nseTarget.uuid);
    xcodeProject.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', nseTarget.uuid);
    xcodeProject.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', nseTarget.uuid);

    // 6. Configure build settings for the NSE target
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      if (configurations[key].buildSettings?.PRODUCT_NAME == `"${NSE_TARGET_NAME}"`) {
        const buildSettingsObj = configurations[key].buildSettings;
        buildSettingsObj.DEVELOPMENT_TEAM = props?.devTeam;
        buildSettingsObj.IPHONEOS_DEPLOYMENT_TARGET = props?.iPhoneDeploymentTarget ?? '11.0';
        buildSettingsObj.TARGETED_DEVICE_FAMILY = `"1,2"`;
        buildSettingsObj.CODE_SIGN_ENTITLEMENTS = `${NSE_TARGET_NAME}/${NSE_TARGET_NAME}.entitlements`;
        buildSettingsObj.CODE_SIGN_STYLE = 'Automatic';
      }
    }

    // 7. Set development team on both targets
    xcodeProject.addTargetAttribute('DevelopmentTeam', props?.devTeam, nseTarget);
    xcodeProject.addTargetAttribute('DevelopmentTeam', props?.devTeam);

    return newConfig;
  });
};
```

**Key build settings for NSE target**:
- `DEVELOPMENT_TEAM` - from `devTeam` prop
- `IPHONEOS_DEPLOYMENT_TARGET` - from `iPhoneDeploymentTarget` prop (default: `"11.0"`)
- `TARGETED_DEVICE_FAMILY` - `"1,2"` (iPhone + iPad)
- `CODE_SIGN_ENTITLEMENTS` - points to the NSE entitlements file
- `CODE_SIGN_STYLE` - `"Automatic"` (lets Xcode manage signing)

**NSE bundle identifier**: `<mainBundleId>.OneSignalNotificationServiceExtension`

### 3.7 EAS Managed Credentials (`withEasManagedCredentials`)

Modifies `config.extra` to tell EAS about the app extension:

```ts
export default function getEasManagedCredentialsConfigExtra(config: ExpoConfig) {
  return {
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
              ...(config.extra?.eas?.build?.experimental?.ios?.appExtensions ?? []),
              {
                targetName: NSE_TARGET_NAME,
                bundleIdentifier: `${config?.ios?.bundleIdentifier}.${NSE_TARGET_NAME}`,
                entitlements: {
                  'com.apple.security.application-groups': [
                    `group.${config?.ios?.bundleIdentifier}.onesignal`,
                  ],
                },
              },
            ],
          },
        },
      },
    },
  };
}
```

**This is critical for EAS builds**: It tells EAS to create/manage provisioning profiles for the NSE target and to sync the app groups entitlement. Without this, EAS builds would fail because the NSE target wouldn't have proper signing.

---

## 4. Android Modifications

Android is much simpler -- no NSE equivalent needed. Only deals with notification icons and accent colors.

### 4.1 Small Icons (`withSmallIcons`)

Uses `withDangerousMod` to write icon files to Android resource directories:

```ts
const SMALL_ICON_DIRS_TO_SIZE: { [name: string]: number } = {
  'drawable-mdpi': 24,
  'drawable-hdpi': 36,
  'drawable-xhdpi': 48,
  'drawable-xxhdpi': 72,
  'drawable-xxxhdpi': 96,
};
```

Uses `@expo/image-utils`'s `generateImageAsync` to resize icons for each density bucket.

### 4.2 Large Icons (`withLargeIcons`)

Same pattern as small icons but only one size:
```ts
const LARGE_ICON_DIRS_TO_SIZE = { 'drawable-xxxhdpi': 256 };
```

### 4.3 Accent Color (`withSmallIconAccentColor`)

Uses `withStringsXml` (safe mod) to add a string resource:
```ts
const withSmallIconAccentColor: ConfigPlugin<OneSignalPluginProps> = (config, onesignalProps) => {
  return withStringsXml(config, (config) => {
    const colorInARGB = `FF${onesignalProps.smallIconAccentColor?.replace('#', '')}`;
    // Adds: <string name="onesignal_notification_accent_color">FF<hex></string>
    // to strings.xml, idempotently
  });
};
```

**Notable**: No AndroidManifest.xml or build.gradle modifications. The OneSignal SDK handles its own initialization without manifest entries.

---

## 5. EAS Build Support

### Managed Credentials (Simple Path)
The plugin automatically injects EAS managed credentials config via `config.extra.eas.build.experimental.ios.appExtensions`. This tells EAS to:
- Create a provisioning profile for the NSE target
- Sync the app groups entitlement

### Local Credentials (Complex Path)
For apps with multiple capabilities, users need:
1. Set `"credentialsSource": "local"` in `eas.json`
2. Create two Apple identifiers: `<bundleId>` and `<bundleId>.OneSignalNotificationServiceExtension`
3. Add App Groups capability to both identifiers
4. Create AdHoc + AppStore provisioning profiles for both
5. Configure `credentials.json` with paths to provisioning profiles for both targets
6. Build with `EXPO_NO_CAPABILITY_SYNC` to prevent EAS from overwriting capabilities

### Key EAS Edge Case
EAS doesn't respect entitlement files on a per-target basis. If multiple entitlements files exist, it picks one and applies it to both targets. OneSignal mitigates this by adding the push capability to both entitlements files.

---

## 6. Key Architectural Patterns

### 6.1 Safe Mods vs Dangerous Mods
- **Safe mods** (`withEntitlementsPlist`, `withInfoPlist`, `withXcodeProject`, `withStringsXml`): Used when Expo provides a typed API for the modification
- **Dangerous mods** (`withDangerousMod`): Used for direct filesystem access (Podfile editing, file copying, icon generation)

### 6.2 Idempotency
Every modification checks if it has already been applied:
- Entitlements check if value already exists in array
- Podfile checks via regex if NSE target block already exists
- Xcode project checks if target already exists via `pbxTargetByName`

### 6.3 Template System for NSE
Uses mustache-style `{{PLACEHOLDER}}` templates in plist and entitlements files, replaced at prebuild time via regex. This avoids complex plist parsing.

### 6.4 Monorepo Support
Uses `require.resolve('onesignal-expo-plugin/package.json')` to find plugin directory, which works regardless of hoisted node_modules.

### 6.5 Error Handling
- Validation at plugin entry (props)
- Mode assertion (required)
- Bundle identifier assertion for EAS
- FileManager wraps fs callbacks in promises with error logging
- Podfile update errors are caught but not blocking (fire-and-forget)

### 6.6 Build Script
```json
"build": "bun run lint && rm -rf build && tsc && cp -a src/support/serviceExtensionFiles build/support/"
```
Compiles TS to `build/`, then copies the native template files (`.h`, `.m`, `.plist`, `.entitlements`) since tsc doesn't copy non-TS files.

---

## 7. Constants Reference

```ts
export const IPHONEOS_DEPLOYMENT_TARGET = '11.0';
export const TARGETED_DEVICE_FAMILY = `"1,2"`;
export const NSE_TARGET_NAME = 'OneSignalNotificationServiceExtension';
export const NSE_SOURCE_FILE = 'NotificationService.m';
export const NSE_EXT_FILES = [
  'NotificationService.h',
  'OneSignalNotificationServiceExtension.entitlements',
  'OneSignalNotificationServiceExtension-Info.plist',
];
export const DEFAULT_BUNDLE_VERSION = '1';
export const DEFAULT_BUNDLE_SHORT_VERSION = '1.0';
```

---

## 8. Idempotency Deep Dive

A detailed analysis of how each modification handles repeated runs (e.g., `npx expo prebuild` run multiple times, or another plugin setting the same values).

### 8.1 `aps-environment` Entitlement -- NOT DEDUPLICATED (Overwrite)

```ts
// withOneSignalIos.ts:48
newConfig.modResults['aps-environment'] = onesignalProps.mode;
```

**Behavior**: Simple key assignment -- always overwrites. This is safe for idempotency (setting the same value twice is harmless) but has an **ordering concern**: if another plugin (e.g., `expo-notifications`) sets `aps-environment` to a different value, whichever plugin runs LAST wins. There is no check for an existing value and no conflict resolution. This is actually fine since it's a scalar value, not an array.

**Verdict**: Safe for repeated runs. Potential conflict with other plugins that set the same key (last-write-wins).

### 8.2 `UIBackgroundModes` -- PROPERLY DEDUPLICATED

```ts
// withOneSignalIos.ts:62-69
if (!Array.isArray(newConfig.modResults.UIBackgroundModes)) {
  newConfig.modResults.UIBackgroundModes = [];
}
for (const key of BACKGROUND_MODE_KEYS) {
  if (!newConfig.modResults.UIBackgroundModes.includes(key)) {
    newConfig.modResults.UIBackgroundModes.push(key);
  }
}
```

**Behavior**: Checks with `.includes()` before pushing. If `expo-notifications` or any other plugin already added `remote-notification`, it will NOT duplicate it.

**Verdict**: Fully idempotent and safe with other plugins.

### 8.3 App Groups Entitlement -- PROPERLY DEDUPLICATED

```ts
// withOneSignalIos.ts:84-94
if (!Array.isArray(newConfig.modResults[APP_GROUP_KEY])) {
  newConfig.modResults[APP_GROUP_KEY] = [];
}
const entitlement = `group.${newConfig?.ios?.bundleIdentifier || ''}.onesignal`;
if (modResultsArray.indexOf(entitlement) !== -1) {
  return newConfig;  // Already present, skip
}
modResultsArray.push(entitlement);
```

**Behavior**: Uses `.indexOf()` to check if the specific app group string already exists. Only adds if not found. Also safe with other plugins that add different app groups (e.g., `group.com.example.app.somethingelse`) -- those are preserved.

**Verdict**: Fully idempotent and safe with other plugins.

### 8.4 Podfile NSE Target -- PROPERLY DEDUPLICATED (Regex Check)

```ts
// updatePodfile.ts:7-20
const podfile = await FileManager.readFile(`${iosPath}/Podfile`);
const matches = podfile.match(NSE_PODFILE_REGEX);
// NSE_PODFILE_REGEX = /target 'OneSignalNotificationServiceExtension'/

if (matches) {
  OneSignalLog.log('...already added to Podfile. Skipping...');
} else {
  fs.appendFile(`${iosPath}/Podfile`, NSE_PODFILE_SNIPPET, ...);
}
```

**Behavior**: Reads the Podfile, checks via regex for the target name string. Skips if already present.

**Weakness**: The regex only checks for the target name string. If someone manually modified the Podfile and the target block is malformed but contains the string, it would still skip. Conversely, if the Podfile is regenerated clean (e.g., `prebuild --clean`), it correctly re-adds the snippet.

**Verdict**: Idempotent for normal use. The `appendFile` approach is crude but works because Podfile targets can be appended at the end.

### 8.5 NSE File Copying -- NOT IDEMPOTENT (Always Overwrites)

```ts
// withOneSignalIos.ts:143-155
fs.mkdirSync(`${iosPath}/${NSE_TARGET_NAME}`, { recursive: true });
for (const extFile of NSE_EXT_FILES) {
  await FileManager.copyFile(`${sourceDir}${extFile}`, targetFile);
}
await FileManager.copyFile(sourcePath, targetFile);
```

**Behavior**: Always copies template files, overwriting any existing ones. Then always runs the regex replacements on the freshly copied templates.

**This is intentional**: Because the files are templates with placeholders that need replacing, copying fresh templates and re-applying replacements is the correct approach. If the files already existed with replaced values, the regex would NOT match the placeholders (they'd already be replaced), so starting fresh each time is necessary.

**Verdict**: Not idempotent in the traditional sense, but correctly handles re-runs because it always starts from clean templates. Any manual edits to NSE files in `ios/OneSignalNotificationServiceExtension/` would be LOST on re-prebuild.

### 8.6 Xcode Project NSE Target -- PROPERLY DEDUPLICATED (Early Return)

```ts
// withOneSignalIos.ts:181-186
if (xcodeProject.pbxTargetByName(NSE_TARGET_NAME)) {
  OneSignalLog.log(`${NSE_TARGET_NAME} already exists in project. Skipping...`);
  return newConfig;
}
```

**Behavior**: Checks if the target already exists by name using the xcode library's `pbxTargetByName()`. If found, returns early -- skipping ALL Xcode project modifications (group creation, target creation, build phases, build settings).

**Weakness**: This is an all-or-nothing check. If the target exists but build settings are wrong (e.g., devTeam changed), the plugin will NOT update them. It simply skips everything.

**Verdict**: Idempotent but inflexible. To apply changed build settings, you'd need to remove the target first (e.g., `prebuild --clean`).

### 8.7 EAS appExtensions -- NOT DEDUPLICATED (Potential Duplicates)

```ts
// getEasManagedCredentialsConfigExtra.ts:17-29
appExtensions: [
  ...(config.extra?.eas?.build?.experimental?.ios?.appExtensions ?? []),
  {
    targetName: NSE_TARGET_NAME,
    bundleIdentifier: `${config?.ios?.bundleIdentifier}.${NSE_TARGET_NAME}`,
    entitlements: { ... },
  },
],
```

**Behavior**: Spreads existing `appExtensions` array and ALWAYS appends a new entry. There is NO check for whether an entry with the same `targetName` already exists.

**In practice this is fine** because: config plugins run once during prebuild, and `config.extra` starts fresh each time from the app.json/app.config.js. The spread preserves entries from OTHER plugins or user config, and since this function runs once per prebuild, there's only one OneSignal entry.

**Theoretical bug**: If the user also manually specifies the OneSignal NSE in their app.json `extra.eas.build.experimental.ios.appExtensions`, there would be a duplicate entry. EAS would likely handle this gracefully but it's technically a bug.

**Verdict**: Safe in practice (config is rebuilt from scratch each prebuild), but no deduplication logic exists. A different plugin adding the same targetName would result in duplicates.

### 8.8 Summary Table

| Modification | Idempotent? | Method | Risk with Other Plugins |
|---|---|---|---|
| `aps-environment` | Yes (overwrite) | Direct assignment | Last-write-wins conflict possible |
| `UIBackgroundModes` | Yes | `.includes()` check | None -- properly deduplicates |
| App Groups | Yes | `.indexOf()` check | None -- only checks own entry |
| Podfile NSE target | Yes | Regex string match | None -- unique target name |
| NSE template files | No (always overwrites) | Fresh copy + regex replace | N/A -- own files only |
| Xcode project target | Yes (early return) | `pbxTargetByName()` | Won't update stale settings |
| EAS appExtensions | No dedup | Array spread + append | Duplicate entries if manually set |

---

## 9. What They Do NOT Do (unchanged from original report)

- **No AndroidManifest modifications** - The OneSignal Android SDK handles its own initialization
- **No build.gradle modifications** - No custom Gradle plugins or dependencies injected
- **No runtime code injection** - Plugin only does build-time configuration
- **No Swift support for NSE** - Only Objective-C templates
- **No automatic `mode` switching** - Users must manually set "development" vs "production"
- **No custom NSE for anything but the .m file** - Header, plist, and entitlements are always from templates

---

## 9. Applicability to Infobip Mobile Messaging Plugin

### Directly Reusable Patterns:
1. **Plugin structure**: Entry point -> validate -> iOS + Android handlers -> composed small plugins
2. **NSE setup flow**: Copy template files, modify plist/entitlements with regex, modify Xcode project to add target
3. **Podfile modification**: Append NSE target with pod dependency
4. **EAS credentials**: Inject `config.extra.eas.build.experimental.ios.appExtensions`
5. **Xcode project manipulation**: Using `withXcodeProject` to add targets, groups, build phases, and build settings
6. **Idempotency patterns**: Always check before modifying

### Key Differences to Plan For:
1. **Different SDK**: Infobip MobileMessaging SDK instead of OneSignalXCFramework
2. **Different app group format**: Will need `group.<bundleId>.infobip` or similar
3. **Different NSE implementation**: Will delegate to Infobip's SDK methods instead of OneSignal's
4. **Potentially different Android requirements**: Infobip may need AndroidManifest changes, Firebase config, etc.
5. **Configuration props**: Will need Infobip-specific configuration (application code, etc.)
6. **Potentially Swift NSE**: Could support Swift-based NSE if Infobip SDK supports it

---

## 10. File Tree Summary

```
onesignal-expo-plugin/
├── app.plugin.js                          # Entry point (re-exports build)
├── package.json
├── tsconfig.json
├── src/
│   ├── onesignal/
│   │   ├── withOneSignal.ts               # Main plugin entry
│   │   ├── withOneSignalIos.ts            # All iOS modifications (7 sub-plugins)
│   │   └── withOneSignalAndroid.ts        # Android icon handling
│   ├── support/
│   │   ├── iosConstants.ts                # Constants and regex patterns
│   │   ├── updatePodfile.ts               # Podfile NSE target appending
│   │   ├── NseUpdaterManager.ts           # Template placeholder replacement
│   │   ├── FileManager.ts                 # Async fs wrapper
│   │   ├── OneSignalLog.ts                # Logger
│   │   ├── helpers.ts                     # Props validation
│   │   ├── eas/
│   │   │   └── getEasManagedCredentialsConfigExtra.ts  # EAS config injection
│   │   └── serviceExtensionFiles/
│   │       ├── NotificationService.h      # NSE ObjC header
│   │       ├── NotificationService.m      # NSE ObjC implementation
│   │       ├── OneSignalNotificationServiceExtension-Info.plist  # NSE plist template
│   │       └── OneSignalNotificationServiceExtension.entitlements # NSE entitlements template
│   └── types/
│       └── types.ts                       # Plugin props type + Mode enum
├── EAS.md
├── IOS_CREDENTIALS_EAS.md
└── README.md
```
