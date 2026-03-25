import { InfobipPluginProps } from './types';

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
