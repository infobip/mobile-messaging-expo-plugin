import { InfobipPluginProps } from './types';

function requireNonEmptyString(value: unknown, propName: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`[infobip] ${propName} must be a non-empty string.`);
  }
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

  if (props.iosAppGroup !== undefined) {
    if (typeof props.iosAppGroup !== 'string' || props.iosAppGroup.length === 0) {
      throw new Error('[infobip] iosAppGroup must be a non-empty string.');
    }
    if (!props.iosAppGroup.startsWith('group.')) {
      throw new Error('[infobip] iosAppGroup must start with "group.".');
    }
  }

  if (props.enableNotificationExtension !== undefined && typeof props.enableNotificationExtension !== 'boolean') {
    throw new Error('[infobip] enableNotificationExtension must be a boolean.');
  }

  if (props.iosNSEFilePath !== undefined) {
    requireNonEmptyString(props.iosNSEFilePath, 'iosNSEFilePath');
  }

  if (props.iosDeploymentTarget !== undefined && typeof props.iosDeploymentTarget !== 'string') {
    throw new Error('[infobip] iosDeploymentTarget must be a string.');
  }

  if (props.devTeam !== undefined) {
    requireNonEmptyString(props.devTeam, 'devTeam');
  }

  if (props.enableGoogleServices !== undefined && typeof props.enableGoogleServices !== 'boolean') {
    throw new Error('[infobip] enableGoogleServices must be a boolean.');
  }

  if (props.googleServicesFilePath !== undefined) {
    requireNonEmptyString(props.googleServicesFilePath, 'googleServicesFilePath');
  }

  if (props.deepLinkScheme !== undefined) {
    requireNonEmptyString(props.deepLinkScheme, 'deepLinkScheme');
  }

  if (props.nseVersion !== undefined && typeof props.nseVersion !== 'string') {
    throw new Error('[infobip] nseVersion must be a string.');
  }
}
