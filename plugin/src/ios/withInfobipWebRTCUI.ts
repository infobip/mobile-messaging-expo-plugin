//
//  withInfobipWebRTCUI.ts
//  MobileMessagingExpo
//
//  Copyright (c) 2016-2026 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

import { ConfigPlugin, withDangerousMod, withInfoPlist } from 'expo/config-plugins';
import { mergeContents } from '@expo/config-plugins/build/utils/generateCode';
import * as fs from 'fs';
import * as path from 'path';
import { InfobipPluginProps } from '../types';
import { MERGE_TAG_PREFIX } from './constants';

const WEBRTC_TAG = `${MERGE_TAG_PREFIX}-webrtc`;
const RN_POD_NAME = 'infobip-mobile-messaging-react-native-plugin';

// Activates the conditional `MobileMessaging/WebRTCUI` dependency in the RN
// plugin's podspec (`if defined?($WebRTCUIEnabled)`). Must be evaluated before
// `use_react_native!` resolves the plugin's pod, so we anchor to a Podfile-level
// statement near the top.
const GLOBAL_FLAG = `$WebRTCUIEnabled = true`;

// Activates the `#if WEBRTCUI_ENABLED` blocks in RNMMWebRTCUI.swift on the
// infobip-mobile-messaging-react-native-plugin pod target. Without these flags
// the runtime path falls through to "[WebRTCUI] Not imported properly in
// podfile: library cannot be used."
const POST_INSTALL_SNIPPET = [
  `    installer.pods_project.targets.each do |t|`,
  `      if t.name == '${RN_POD_NAME}'`,
  `        t.build_configurations.each do |bc|`,
  `          gcc = bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] || ['$(inherited)', 'COCOAPODS=1']`,
  `          gcc = [gcc] unless gcc.is_a?(Array)`,
  `          bc.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = gcc | ['WEBRTCUI_ENABLED=1']`,
  `          swift = (bc.build_settings['OTHER_SWIFT_FLAGS'] || '$(inherited)').to_s`,
  `          bc.build_settings['OTHER_SWIFT_FLAGS'] = swift.include?('WEBRTCUI_ENABLED') ? swift : "#{swift} -D WEBRTCUI_ENABLED"`,
  `        end`,
  `      end`,
  `    end`,
].join('\n');

export const withInfobipWebRTCUI: ConfigPlugin<InfobipPluginProps> = (config) => {
  config = withInfoPlist(config, (newConfig) => {
    if (!Array.isArray(newConfig.modResults.UIBackgroundModes)) {
      newConfig.modResults.UIBackgroundModes = [];
    }
    if (!newConfig.modResults.UIBackgroundModes.includes('voip')) {
      newConfig.modResults.UIBackgroundModes.push('voip');
    }
    return newConfig;
  });

  return withDangerousMod(config, [
    'ios',
    async (newConfig) => {
      const podfilePath = path.join(newConfig.modRequest.projectRoot, 'ios', 'Podfile');
      if (!fs.existsSync(podfilePath)) {
        console.warn('[infobip] Podfile not found. Skipping WebRTCUI iOS configuration.');
        return newConfig;
      }

      let contents = fs.readFileSync(podfilePath, 'utf-8');

      const flagResult = mergeContents({
        src: contents,
        newSrc: GLOBAL_FLAG,
        tag: `${WEBRTC_TAG}-global`,
        anchor: /prepare_react_native_project!/,
        offset: 1,
        comment: '#',
      });
      contents = flagResult.contents;

      const postResult = mergeContents({
        src: contents,
        newSrc: POST_INSTALL_SNIPPET,
        tag: `${WEBRTC_TAG}-post-install`,
        anchor: /post_install do \|installer\|/,
        offset: 1,
        comment: '#',
      });
      contents = postResult.contents;

      fs.writeFileSync(podfilePath, contents, 'utf-8');
      return newConfig;
    },
  ]);
};
