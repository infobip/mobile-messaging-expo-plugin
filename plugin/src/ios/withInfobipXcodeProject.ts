import { ConfigPlugin, withXcodeProject } from 'expo/config-plugins';
import { InfobipPluginProps } from '../types';
import {
  NSE_TARGET_NAME,
  NSE_SOURCE_FILE,
  NSE_ENTITLEMENTS_FILE,
  NSE_PLIST_FILE,
  DEFAULT_IOS_DEPLOYMENT_TARGET,
} from './constants';

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
    // Read deployment target from main app target to ensure NSE matches.
    // Mismatch causes: "compiling for iOS X, but module has minimum deployment target Y"
    let mainAppDeploymentTarget: string | undefined;
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    for (const key in configurations) {
      if (
        typeof configurations[key] === 'object' &&
        configurations[key].buildSettings?.PRODUCT_NAME === `"$(TARGET_NAME)"`
      ) {
        mainAppDeploymentTarget = configurations[key].buildSettings?.IPHONEOS_DEPLOYMENT_TARGET;
        if (mainAppDeploymentTarget) break;
      }
    }
    const deploymentTarget = props.iosDeploymentTarget ?? mainAppDeploymentTarget ?? DEFAULT_IOS_DEPLOYMENT_TARGET;
    for (const key in configurations) {
      if (
        typeof configurations[key] === 'object' &&
        configurations[key].buildSettings?.PRODUCT_NAME === `"${NSE_TARGET_NAME}"`
      ) {
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
      }
    }

    // 7. Set target attributes
    if (props.devTeam) {
      xcodeProject.addTargetAttribute('DevelopmentTeam', props.devTeam, nseTarget);
      xcodeProject.addTargetAttribute('DevelopmentTeam', props.devTeam);
    }

    return newConfig;
  });
};
