import { ConfigPlugin, withInfoPlist } from 'expo/config-plugins';
import { InfobipPluginProps } from '../types';
import { DEFAULT_APP_GROUP_SUFFIX, INFOBIP_APP_GROUP_PLIST_KEY } from './constants';

export const withInfobipInfoPlist: ConfigPlugin<InfobipPluginProps> = (config, props) => {
  return withInfoPlist(config, (newConfig) => {
    // Add remote-notification to UIBackgroundModes
    if (!Array.isArray(newConfig.modResults.UIBackgroundModes)) {
      newConfig.modResults.UIBackgroundModes = [];
    }
    if (!newConfig.modResults.UIBackgroundModes.includes('remote-notification')) {
      newConfig.modResults.UIBackgroundModes.push('remote-notification');
    }

    // Set Infobip app group key
    const groupId = props.iosAppGroup
      ?? `group.${newConfig.ios?.bundleIdentifier}.${props.iosAppGroupSuffix ?? DEFAULT_APP_GROUP_SUFFIX}`;
    newConfig.modResults[INFOBIP_APP_GROUP_PLIST_KEY] = groupId;

    // Add deep link URL scheme if configured
    if (props.deepLinkScheme) {
      if (!Array.isArray(newConfig.modResults.CFBundleURLTypes)) {
        newConfig.modResults.CFBundleURLTypes = [];
      }
      const urlTypes = newConfig.modResults.CFBundleURLTypes as any[];
      const schemeExists = urlTypes.some((t: any) =>
        t.CFBundleURLSchemes?.includes(props.deepLinkScheme)
      );
      if (!schemeExists) {
        urlTypes.push({
          CFBundleURLSchemes: [props.deepLinkScheme],
        });
      }
    }

    return newConfig;
  });
};
