import { ConfigPlugin } from 'expo/config-plugins';
import { InfobipPluginProps } from '../types';
import { NSE_TARGET_NAME, DEFAULT_APP_GROUP_SUFFIX } from './constants';

export const withInfobipEasCredentials: ConfigPlugin<InfobipPluginProps> = (config, props) => {
  const bundleId = `${config.ios?.bundleIdentifier}.${NSE_TARGET_NAME}`;
  const groupId = props.iosAppGroup
    ?? `group.${config.ios?.bundleIdentifier}.${props.iosAppGroupSuffix ?? DEFAULT_APP_GROUP_SUFFIX}`;

  const existingExtensions: any[] =
    config.extra?.eas?.build?.experimental?.ios?.appExtensions ?? [];
  const filtered = existingExtensions.filter(
    (ext: any) => ext.targetName !== NSE_TARGET_NAME
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
                  'aps-environment': props.iosMode ?? 'development',
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
