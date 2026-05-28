//
//  withInfobipIos.ts
//  MobileMessagingExpo
//
//  Copyright (c) 2016-2026 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

import { ConfigPlugin, withPlugins } from 'expo/config-plugins';
import { InfobipPluginProps } from '../types';
import { withInfobipEntitlements } from './withInfobipEntitlements';
import { withInfobipInfoPlist } from './withInfobipInfoPlist';
import { withInfobipNSEFiles } from './withInfobipNSEFiles';
import { withInfobipPodfile } from './withInfobipPodfile';
import { withInfobipXcodeProject } from './withInfobipXcodeProject';
import { withInfobipEasCredentials } from './withInfobipEasCredentials';
import { withInfobipWebRTCUI } from './withInfobipWebRTCUI';

export const withInfobipIos: ConfigPlugin<InfobipPluginProps> = (config, props) => {
  if (!config.ios?.bundleIdentifier) {
    throw new Error(
      '[infobip] ios.bundleIdentifier is required in app.json/app.config.js to generate the NSE target bundle id.'
    );
  }

  const plugins: [ConfigPlugin<InfobipPluginProps>, InfobipPluginProps][] = [
    [withInfobipEntitlements, props],
    [withInfobipInfoPlist, props],
  ];

  if (props.enableNotificationExtension !== false) {
    plugins.push(
      [withInfobipNSEFiles, props],
      [withInfobipPodfile, props],
      [withInfobipXcodeProject, props],
      [withInfobipEasCredentials, props],
    );
  }

  if (props.enableWebRTCUI === true) {
    plugins.push([withInfobipWebRTCUI, props]);
  }

  return withPlugins(config, plugins);
};
