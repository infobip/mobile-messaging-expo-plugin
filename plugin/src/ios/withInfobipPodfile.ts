import { ConfigPlugin, withDangerousMod } from 'expo/config-plugins';
import { mergeContents } from '@expo/config-plugins/build/utils/generateCode';
import * as fs from 'fs';
import * as path from 'path';
import { InfobipPluginProps } from '../types';
import { NSE_TARGET_NAME, NSE_POD_NAME, NSE_DEFAULT_POD_VERSION, MERGE_TAG_PREFIX } from './constants';
import { resolveIosDeploymentTarget } from '../helpers';

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

      const podfilePlatformVersion = resolveIosDeploymentTarget(newConfig.modRequest.projectRoot);

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
