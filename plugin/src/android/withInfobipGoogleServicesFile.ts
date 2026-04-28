//
//  withInfobipGoogleServicesFile.ts
//  MobileMessagingExpo
//
//  Copyright (c) 2016-2026 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

import fs from 'fs';
import path from 'path';
import { ConfigPlugin, withDangerousMod } from 'expo/config-plugins';
import { InfobipPluginProps } from '../types';

export const withInfobipGoogleServicesFile: ConfigPlugin<InfobipPluginProps> = (config, props) => {
  return withDangerousMod(config, [
    'android',
    (newConfig) => {
      const projectRoot = newConfig.modRequest.projectRoot;

      // Priority: plugin prop > Expo config
      const sourcePath = props.googleServicesFilePath ?? newConfig.android?.googleServicesFile;

      if (!sourcePath) {
        console.warn(
          '[infobip] No google-services.json path provided. ' +
            'Set googleServicesFilePath in plugin props or ' +
            'android.googleServicesFile in app.json. ' +
            'Android push notifications will not work without Firebase configuration.'
        );
        return newConfig;
      }

      const resolvedSource = path.resolve(projectRoot, sourcePath);

      if (!fs.existsSync(resolvedSource)) {
        throw new Error(
          `[infobip] google-services.json not found at: ${resolvedSource}. ` +
            'Please verify the path is correct relative to your project root.'
        );
      }

      const destPath = path.join(projectRoot, 'android', 'app', 'google-services.json');
      fs.copyFileSync(resolvedSource, destPath);

      return newConfig;
    },
  ]);
};
