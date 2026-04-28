//
//  withInfobipInfoPlist.ts
//  MobileMessagingExpo
//
//  Copyright (c) 2016-2026 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

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
      const INFOBIP_URL_NAME = 'infobip-mobile-messaging';
      // Prefer match by our well-known CFBundleURLName (so repeated prebuilds with a
      // changed deepLinkScheme don't accumulate stale entries), then fall back to
      // matching by raw scheme for legacy entries written before this tag existed.
      const existingByName = urlTypes.find((t: any) => t.CFBundleURLName === INFOBIP_URL_NAME);
      if (existingByName) {
        existingByName.CFBundleURLSchemes = [props.deepLinkScheme];
      } else {
        const schemeExists = urlTypes.some((t: any) =>
          t.CFBundleURLSchemes?.includes(props.deepLinkScheme)
        );
        if (!schemeExists) {
          urlTypes.push({
            CFBundleURLName: INFOBIP_URL_NAME,
            CFBundleURLSchemes: [props.deepLinkScheme],
          });
        }
      }
    }

    return newConfig;
  });
};
