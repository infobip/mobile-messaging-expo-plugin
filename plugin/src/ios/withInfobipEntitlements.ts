//
//  withInfobipEntitlements.ts
//  MobileMessagingExpo
//
//  Copyright (c) 2016-2026 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

import { ConfigPlugin, withEntitlementsPlist } from 'expo/config-plugins';
import { InfobipPluginProps } from '../types';
import { DEFAULT_APP_GROUP_SUFFIX } from './constants';

export const withInfobipEntitlements: ConfigPlugin<InfobipPluginProps> = (config, props) => {
  return withEntitlementsPlist(config, (newConfig) => {
    // Set APS environment
    newConfig.modResults['aps-environment'] = props.iosMode ?? 'development';

    // Add App Group
    const key = 'com.apple.security.application-groups';
    const existing = newConfig.modResults[key];
    if (!Array.isArray(existing)) {
      newConfig.modResults[key] = [];
    }

    const groupId = props.iosAppGroup
      ?? `group.${newConfig.ios?.bundleIdentifier}.${props.iosAppGroupSuffix ?? DEFAULT_APP_GROUP_SUFFIX}`;

    if (!(newConfig.modResults[key] as string[]).includes(groupId)) {
      (newConfig.modResults[key] as string[]).push(groupId);
    }

    return newConfig;
  });
};
