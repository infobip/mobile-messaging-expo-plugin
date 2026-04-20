import { ConfigPlugin, withDangerousMod } from 'expo/config-plugins';
import { mergeContents } from '@expo/config-plugins/build/utils/generateCode';
import * as fs from 'fs';
import * as path from 'path';
import { InfobipPluginProps } from '../types';
import { NSE_TARGET_NAME, NSE_POD_NAME, NSE_DEFAULT_POD_VERSION, DEFAULT_IOS_DEPLOYMENT_TARGET, MERGE_TAG_PREFIX } from './constants';

export const withInfobipPodfile: ConfigPlugin<InfobipPluginProps> = (config, props) => {
  return withDangerousMod(config, [
    'ios',
    async (newConfig) => {
      const podfilePath = path.join(newConfig.modRequest.projectRoot, 'ios', 'Podfile');

      if (!fs.existsSync(podfilePath)) {
        console.warn('[infobip] Podfile not found. Skipping NSE pod target addition.');
        return newConfig;
      }

      const podfileContent = fs.readFileSync(podfilePath, 'utf-8');
      const nseVersion = props.nseVersion ?? NSE_DEFAULT_POD_VERSION;

      // Parse the global Podfile platform so the NSE target matches exactly.
      // Expo's Podfile: `platform :ios, podfile_properties['ios.deploymentTarget'] || '15.1'`
      // We read Podfile.properties.json for the customer override, fall back to Expo SDK 55 default.
      let podfilePlatformVersion = DEFAULT_IOS_DEPLOYMENT_TARGET;
      try {
        const propsPath = path.join(newConfig.modRequest.projectRoot, 'ios', 'Podfile.properties.json');
        if (fs.existsSync(propsPath)) {
          const podfileProps = JSON.parse(fs.readFileSync(propsPath, 'utf-8'));
          if (podfileProps['ios.deploymentTarget']) {
            podfilePlatformVersion = podfileProps['ios.deploymentTarget'];
          }
        }
      } catch (e) {
        // Fall through to default
      }

      const nseTarget = [
        '',
        `target '${NSE_TARGET_NAME}' do`,
        `  platform :ios, '${podfilePlatformVersion}'`,
        `  use_frameworks! :linkage => podfile_properties['ios.useFrameworks'].to_sym if podfile_properties['ios.useFrameworks']`,
        `  use_frameworks! :linkage => ENV['USE_FRAMEWORKS'].to_sym if ENV['USE_FRAMEWORKS']`,
        `  pod '${NSE_POD_NAME}', '${nseVersion}'`,
        'end',
      ].join('\n');

      const result = mergeContents({
        src: podfileContent,
        newSrc: nseTarget,
        tag: `${MERGE_TAG_PREFIX}-nse`,
        anchor: /target\s+'[^']+'\s+do/,
        offset: 0,
        comment: '#',
      });

      fs.writeFileSync(podfilePath, result.contents, 'utf-8');
      return newConfig;
    },
  ]);
};
