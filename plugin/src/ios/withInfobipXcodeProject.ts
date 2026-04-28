//
//  withInfobipXcodeProject.ts
//  MobileMessagingExpo
//
//  Copyright (c) 2016-2026 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

import { ConfigPlugin, withXcodeProject } from 'expo/config-plugins';
import { InfobipPluginProps } from '../types';
import {
  NSE_TARGET_NAME,
  NSE_SOURCE_FILE,
  NSE_ENTITLEMENTS_FILE,
  NSE_PLIST_FILE,
  DEFAULT_IOS_DEPLOYMENT_TARGET,
} from './constants';

/**
 * Reads the main app's IPHONEOS_DEPLOYMENT_TARGET by scanning XCBuildConfiguration
 * for the configuration whose PRODUCT_NAME matches "$(TARGET_NAME)" — the main app
 * target pattern that Expo's default template emits.
 */
function resolveMainAppDeploymentTarget(xcodeProject: any): string | undefined {
  const configurations = xcodeProject.pbxXCBuildConfigurationSection();
  for (const key in configurations) {
    const entry = configurations[key];
    if (typeof entry !== 'object' || entry == null) continue;
    const bs = entry.buildSettings;
    if (!bs) continue;
    if (bs.PRODUCT_NAME === '"$(TARGET_NAME)"' || bs.PRODUCT_NAME === '$(TARGET_NAME)') {
      if (bs.IPHONEOS_DEPLOYMENT_TARGET) {
        return String(bs.IPHONEOS_DEPLOYMENT_TARGET);
      }
    }
  }
  return undefined;
}

export const withInfobipXcodeProject: ConfigPlugin<InfobipPluginProps> = (config, props) => {
  return withXcodeProject(config, (newConfig) => {
    const xcodeProject = newConfig.modResults;

    // Guard 1: Check if target already exists
    if (xcodeProject.pbxTargetByName(NSE_TARGET_NAME)) {
      console.log(`[infobip] ${NSE_TARGET_NAME} target already exists, skipping.`);
      return newConfig;
    }

    // Guard 2: Check if group already exists (prevent orphaned groups)
    const groups = xcodeProject.hash.project.objects['PBXGroup'];
    const groupExists = Object.values(groups).some(
      (g: any) => typeof g === 'object' && g !== null && g.name === NSE_TARGET_NAME
    );
    if (groupExists) {
      console.log(`[infobip] ${NSE_TARGET_NAME} group already exists, skipping.`);
      return newConfig;
    }

    // 1. Create PBXGroup with the 3 NSE files
    const extGroup = xcodeProject.addPbxGroup(
      [NSE_SOURCE_FILE, NSE_ENTITLEMENTS_FILE, NSE_PLIST_FILE],
      NSE_TARGET_NAME,
      NSE_TARGET_NAME
    );

    // 2. Add to root project group
    const rootGroupId = xcodeProject.getFirstProject().firstProject.mainGroup;
    xcodeProject.addToPbxGroup(extGroup.uuid, rootGroupId);

    // 3. Ensure required objects exist (xcode library workaround)
    const projObjects = xcodeProject.hash.project.objects;
    projObjects['PBXTargetDependency'] = projObjects['PBXTargetDependency'] || {};
    projObjects['PBXContainerItemProxy'] = projObjects['PBXContainerItemProxy'] || {};

    // 4. Create app_extension target
    const bundleId = `${config.ios?.bundleIdentifier}.${NSE_TARGET_NAME}`;
    const nseTarget = xcodeProject.addTarget(
      NSE_TARGET_NAME,
      'app_extension',
      NSE_TARGET_NAME,
      bundleId
    );

    // 5. Add build phases
    xcodeProject.addBuildPhase(
      [NSE_SOURCE_FILE],
      'PBXSourcesBuildPhase',
      'Sources',
      nseTarget.uuid
    );
    xcodeProject.addBuildPhase(
      [],
      'PBXResourcesBuildPhase',
      'Resources',
      nseTarget.uuid
    );
    xcodeProject.addBuildPhase(
      [],
      'PBXFrameworksBuildPhase',
      'Frameworks',
      nseTarget.uuid
    );

    // 6. Configure build settings
    // Deployment target resolution: explicit prop → main app IPHONEOS_DEPLOYMENT_TARGET → default.
    const deploymentTarget =
      props.iosDeploymentTarget ??
      resolveMainAppDeploymentTarget(xcodeProject) ??
      DEFAULT_IOS_DEPLOYMENT_TARGET;

    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    let matchCount = 0;
    for (const key in configurations) {
      if (
        typeof configurations[key] === 'object' &&
        (configurations[key].buildSettings?.PRODUCT_NAME === NSE_TARGET_NAME ||
         configurations[key].buildSettings?.PRODUCT_NAME === `"${NSE_TARGET_NAME}"`)
      ) {
        matchCount++;
        const bs = configurations[key].buildSettings;
        if (props.devTeam) {
          bs.DEVELOPMENT_TEAM = props.devTeam;
        }
        bs.IPHONEOS_DEPLOYMENT_TARGET = deploymentTarget;
        bs.TARGETED_DEVICE_FAMILY = '"1,2"';
        bs.CODE_SIGN_ENTITLEMENTS = `${NSE_TARGET_NAME}/${NSE_ENTITLEMENTS_FILE}`;
        bs.CODE_SIGN_STYLE = 'Automatic';
        bs.SWIFT_VERSION = '5.5';
        bs.GENERATE_INFOPLIST_FILE = 'NO';
        bs.INFOPLIST_FILE = `${NSE_TARGET_NAME}/${NSE_PLIST_FILE}`;
        bs.PRODUCT_NAME = `"${NSE_TARGET_NAME}"`;
        // Erase any bridging header inherited from the main target (mmine parity).
        // The xcode lib serializes the JS value verbatim into the pbxproj; a bare JS
        // empty string produces `= ;` which is a syntax error. Two embedded quote
        // chars produce `= "";` — a quoted empty string, which is what "erase" needs.
        bs.SWIFT_OBJC_BRIDGING_HEADER = '""';
      }
    }
    if (matchCount === 0) {
      console.warn(
        `[infobip] Could not locate XCBuildConfiguration entries for ${NSE_TARGET_NAME}; NSE build settings were not applied.`
      );
    }

    // 7. Set target attributes (scoped to the NSE target only).
    if (props.devTeam) {
      xcodeProject.addTargetAttribute('DevelopmentTeam', props.devTeam, nseTarget);
    }

    // 8. Set SystemCapabilities (App Groups) on the NSE target.
    try {
      const firstProject = xcodeProject.getFirstProject().firstProject;
      firstProject.attributes = firstProject.attributes || {};
      firstProject.attributes.TargetAttributes = firstProject.attributes.TargetAttributes || {};
      const targetAttrs = firstProject.attributes.TargetAttributes;
      targetAttrs[nseTarget.uuid] = targetAttrs[nseTarget.uuid] || {};
      targetAttrs[nseTarget.uuid].SystemCapabilities = {
        ...(targetAttrs[nseTarget.uuid].SystemCapabilities || {}),
        'com.apple.ApplicationGroups.iOS': { enabled: 1 },
      };
    } catch (e) {
      console.warn(`[infobip] Failed to set SystemCapabilities on ${NSE_TARGET_NAME}: ${e}`);
    }

    // 9. Embed the extension into the main app + add a target dependency.
    // Main target = the one with productType 'com.apple.product-type.application'.
    const nativeTargets = xcodeProject.hash.project.objects['PBXNativeTarget'] || {};
    let mainTarget: { uuid: string; target: any } | undefined;
    for (const uuid in nativeTargets) {
      if (uuid.endsWith('_comment')) continue;
      const t = nativeTargets[uuid];
      if (
        typeof t === 'object' &&
        t !== null &&
        (t.productType === '"com.apple.product-type.application"' ||
         t.productType === 'com.apple.product-type.application')
      ) {
        mainTarget = { uuid, target: t };
        break;
      }
    }

    if (!mainTarget) {
      console.warn('[infobip] Could not locate main app target; skipping NSE embed + dependency.');
      return newConfig;
    }

    // 9a. Add PBXTargetDependency (main → NSE), idempotent.
    const existingDeps: any[] = mainTarget.target.dependencies || [];
    const depsSection = xcodeProject.hash.project.objects['PBXTargetDependency'] || {};
    const alreadyDependsOnNse = existingDeps.some((dep: any) => {
      if (!dep || !dep.value) return false;
      const depObj = depsSection[dep.value];
      return depObj && depObj.target === nseTarget.uuid;
    });
    if (!alreadyDependsOnNse) {
      try {
        xcodeProject.addTargetDependency(mainTarget.target, [nseTarget.uuid]);
      } catch (e) {
        console.warn(`[infobip] Failed to add target dependency for ${NSE_TARGET_NAME}: ${e}`);
      }
    }

    // 9b. Add an "Embed App Extensions" copy-files build phase on the main target, idempotent.
    const copyFilesPhases = xcodeProject.hash.project.objects['PBXCopyFilesBuildPhase'] || {};
    let embedPhaseExists = false;
    for (const uuid in copyFilesPhases) {
      if (uuid.endsWith('_comment')) continue;
      const phase = copyFilesPhases[uuid];
      if (
        typeof phase === 'object' &&
        phase !== null &&
        (phase.name === 'Embed App Extensions' ||
         phase.name === '"Embed App Extensions"' ||
         phase.dstSubfolderSpec === 13)
      ) {
        // Verify this phase is attached to the main target.
        const mainPhases: any[] = mainTarget.target.buildPhases || [];
        if (mainPhases.some((p: any) => p.value === uuid)) {
          embedPhaseExists = true;
          break;
        }
      }
    }
    if (!embedPhaseExists) {
      try {
        xcodeProject.addBuildPhase(
          [`${NSE_TARGET_NAME}.appex`],
          'PBXCopyFilesBuildPhase',
          'Embed App Extensions',
          mainTarget.uuid,
          'app_extension'
        );
      } catch (e) {
        console.warn(`[infobip] Failed to add "Embed App Extensions" build phase: ${e}`);
      }
    }

    return newConfig;
  });
};
