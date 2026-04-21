import * as fs from 'fs';
import * as path from 'path';
import { InfobipPluginProps } from './types';
import { DEFAULT_IOS_DEPLOYMENT_TARGET } from './ios/constants';

/**
 * Reads the iOS deployment target from Podfile.properties.json.
 * This is the source of truth for what CocoaPods compiles pods at
 * (Expo's Podfile: `platform :ios, podfile_properties['ios.deploymentTarget'] || '15.1'`).
 * Falls back to DEFAULT_IOS_DEPLOYMENT_TARGET if not set.
 */
export function resolveIosDeploymentTarget(projectRoot: string, explicitProp?: string): string {
  if (explicitProp) return explicitProp;

  try {
    const propsPath = path.join(projectRoot, 'ios', 'Podfile.properties.json');
    if (fs.existsSync(propsPath)) {
      const podfileProps = JSON.parse(fs.readFileSync(propsPath, 'utf-8'));
      if (podfileProps['ios.deploymentTarget']) {
        return podfileProps['ios.deploymentTarget'];
      }
    }
  } catch (e) {
    // Fall through to default
  }

  return DEFAULT_IOS_DEPLOYMENT_TARGET;
}

export function validateProps(props: InfobipPluginProps): void {
  if (props.iosMode !== undefined && props.iosMode !== 'development' && props.iosMode !== 'production') {
    throw new Error(
      `[infobip] Invalid iosMode: "${props.iosMode}". Must be "development" or "production".`
    );
  }

  if (props.iosAppGroupSuffix !== undefined && typeof props.iosAppGroupSuffix !== 'string') {
    throw new Error('[infobip] iosAppGroupSuffix must be a string.');
  }

  if (props.enableNotificationExtension !== undefined && typeof props.enableNotificationExtension !== 'boolean') {
    throw new Error('[infobip] enableNotificationExtension must be a boolean.');
  }

  if (props.iosNSEFilePath !== undefined && typeof props.iosNSEFilePath !== 'string') {
    throw new Error('[infobip] iosNSEFilePath must be a string.');
  }

  if (props.iosDeploymentTarget !== undefined && typeof props.iosDeploymentTarget !== 'string') {
    throw new Error('[infobip] iosDeploymentTarget must be a string.');
  }

  if (props.devTeam !== undefined && typeof props.devTeam !== 'string') {
    throw new Error('[infobip] devTeam must be a string.');
  }

  if (props.enableGoogleServices !== undefined && typeof props.enableGoogleServices !== 'boolean') {
    throw new Error('[infobip] enableGoogleServices must be a boolean.');
  }

  if (props.googleServicesFilePath !== undefined && typeof props.googleServicesFilePath !== 'string') {
    throw new Error('[infobip] googleServicesFilePath must be a string.');
  }

  if (props.deepLinkScheme !== undefined && typeof props.deepLinkScheme !== 'string') {
    throw new Error('[infobip] deepLinkScheme must be a string.');
  }

  if (props.nseVersion !== undefined && typeof props.nseVersion !== 'string') {
    throw new Error('[infobip] nseVersion must be a string.');
  }
}
