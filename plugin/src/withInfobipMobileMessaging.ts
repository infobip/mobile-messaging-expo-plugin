//
//  withInfobipMobileMessaging.ts
//  MobileMessagingExpo
//
//  Copyright (c) 2016-2026 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

import { ConfigPlugin, withPlugins } from 'expo/config-plugins';
import { InfobipPluginProps } from './types';
import { validateProps } from './helpers';
import { withInfobipIos } from './ios/withInfobipIos';
import { withInfobipAndroid } from './android/withInfobipAndroid';

const withInfobipMobileMessaging: ConfigPlugin<InfobipPluginProps | undefined> = (
  config,
  rawProps
) => {
  const props: InfobipPluginProps = rawProps ?? {};
  validateProps(props);

  const resolvedProps: InfobipPluginProps = {
    iosMode: props.iosMode ?? 'development',
    iosAppGroupSuffix: props.iosAppGroupSuffix ?? 'infobip',
    enableNotificationExtension: props.enableNotificationExtension ?? true,
    // iosDeploymentTarget intentionally left unset here — resolved dynamically
    // in withInfobipXcodeProject from the main app's IPHONEOS_DEPLOYMENT_TARGET
    // or DEFAULT_IOS_DEPLOYMENT_TARGET.
    enableGoogleServices: props.enableGoogleServices ?? true,
    nseVersion: props.nseVersion ?? '15.0.0',
    ...props,
  };

  return withPlugins(config, [
    [withInfobipIos, resolvedProps],
    [withInfobipAndroid, resolvedProps],
  ]);
};

export default withInfobipMobileMessaging;
