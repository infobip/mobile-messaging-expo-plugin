//
//  withInfobipEasCredentials.ts
//  MobileMessagingExpo
//
//  Copyright (c) 2016-2026 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

import { ConfigPlugin } from 'expo/config-plugins';
import { InfobipPluginProps } from '../types';
import { NSE_TARGET_NAME, DEFAULT_APP_GROUP_SUFFIX } from './constants';

type AppExtensionConfig = {
  targetName: string;
  bundleIdentifier: string;
  entitlements: Record<string, unknown>;
};

export const withInfobipEasCredentials: ConfigPlugin<InfobipPluginProps> = (config, props) => {
  const bundleId = `${config.ios?.bundleIdentifier}.${NSE_TARGET_NAME}`;
  const groupId = props.iosAppGroup
    ?? `group.${config.ios?.bundleIdentifier}.${props.iosAppGroupSuffix ?? DEFAULT_APP_GROUP_SUFFIX}`;

  const existingExtensions: AppExtensionConfig[] =
    (config.extra?.eas?.build?.experimental?.ios?.appExtensions as AppExtensionConfig[] | undefined) ?? [];
  const filtered = existingExtensions.filter(
    (ext: AppExtensionConfig) => ext.targetName !== NSE_TARGET_NAME
  );

  config.extra = {
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
              ...filtered,
              {
                targetName: NSE_TARGET_NAME,
                bundleIdentifier: bundleId,
                entitlements: {
                  'com.apple.security.application-groups': [groupId],
                },
              },
            ],
          },
        },
      },
    },
  };

  return config;
};
