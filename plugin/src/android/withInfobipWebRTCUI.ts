//
//  withInfobipWebRTCUI.ts
//  MobileMessagingExpo
//
//  Copyright (c) 2016-2026 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

import { ConfigPlugin, withAndroidManifest, withAppBuildGradle, withProjectBuildGradle } from 'expo/config-plugins';
import { mergeContents } from '@expo/config-plugins/build/utils/generateCode';
import { MERGE_TAG_PREFIX, WEBRTC_DESUGAR_LIB, WEBRTC_PERMISSIONS } from './constants';

const WEBRTC_TAG = `${MERGE_TAG_PREFIX}-webrtc`;

/**
 * Adds withWebRTCUI = true to the buildscript ext block in root build.gradle.
 */
const withWebRTCRootGradle: ConfigPlugin = (config) => {
  return withProjectBuildGradle(config, (newConfig) => {
    if (newConfig.modResults.language !== 'groovy') {
      throw new Error(
        '[infobip] Cannot configure WebRTC in build.gradle -- Kotlin DSL (build.gradle.kts) is not yet supported.'
      );
    }
    newConfig.modResults.contents = addWebRTCExtFlag(newConfig.modResults.contents);
    return newConfig;
  });
};

/**
 * Adds coreLibraryDesugaringEnabled and desugar_jdk_libs dependency to app/build.gradle.
 */
const withWebRTCAppGradle: ConfigPlugin = (config) => {
  return withAppBuildGradle(config, (newConfig) => {
    if (newConfig.modResults.language !== 'groovy') {
      throw new Error(
        '[infobip] Cannot configure WebRTC in app/build.gradle -- Kotlin DSL (build.gradle.kts) is not yet supported.'
      );
    }
    newConfig.modResults.contents = addWebRTCCompileOptions(newConfig.modResults.contents);
    newConfig.modResults.contents = addWebRTCDesugarDependency(newConfig.modResults.contents);
    return newConfig;
  });
};

/**
 * Adds WebRTC-required permissions to AndroidManifest.xml.
 */
const withWebRTCPermissions: ConfigPlugin = (config) => {
  return withAndroidManifest(config, (newConfig) => {
    const manifest = newConfig.modResults.manifest;
    const existingPermissions: string[] = (manifest['uses-permission'] ?? []).map(
      (p: any) => p.$['android:name']
    );

    for (const permission of WEBRTC_PERMISSIONS) {
      if (!existingPermissions.includes(permission)) {
        manifest['uses-permission'] = [
          ...(manifest['uses-permission'] ?? []),
          { $: { 'android:name': permission } },
        ];
      }
    }
    return newConfig;
  });
};

export function addWebRTCExtFlag(contents: string): string {
  if (contents.includes('withWebRTCUI')) {
    return contents;
  }

  const result = mergeContents({
    src: contents,
    newSrc: `  ext {\n    withWebRTCUI = true\n  }`,
    tag: `${WEBRTC_TAG}-ext`,
    anchor: /^buildscript\s*\{/m,
    offset: 1,
    comment: '//',
  });

  if (result.didMerge || result.didClear) {
    return result.contents;
  }

  console.warn('[infobip] Could not add withWebRTCUI flag to root build.gradle. Please add it manually.');
  return contents;
}

export function addWebRTCCompileOptions(contents: string): string {
  if (contents.includes('coreLibraryDesugaringEnabled')) {
    return contents;
  }

  const result = mergeContents({
    src: contents,
    newSrc: `    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_1_8\n        targetCompatibility JavaVersion.VERSION_1_8\n        coreLibraryDesugaringEnabled withWebRTCUI.toBoolean()\n    }`,
    tag: `${WEBRTC_TAG}-compile-options`,
    anchor: /^    buildTypes\s*\{/m,
    offset: 0,
    comment: '//',
  });

  if (result.didMerge || result.didClear) {
    return result.contents;
  }

  console.warn('[infobip] Could not add compileOptions to app/build.gradle. Please add it manually.');
  return contents;
}

export function addWebRTCDesugarDependency(contents: string): string {
  if (contents.includes('desugar_jdk_libs')) {
    return contents;
  }

  const result = mergeContents({
    src: contents,
    newSrc: `    if (withWebRTCUI.toBoolean()) {\n        coreLibraryDesugaring '${WEBRTC_DESUGAR_LIB}'\n    }`,
    tag: `${WEBRTC_TAG}-desugar`,
    anchor: /^dependencies\s*\{/m,
    offset: 1,
    comment: '//',
  });

  if (result.didMerge || result.didClear) {
    return result.contents;
  }

  console.warn('[infobip] Could not add desugar dependency to app/build.gradle. Please add it manually.');
  return contents;
}

export const withInfobipWebRTCUI: ConfigPlugin = (config) => {
  config = withWebRTCRootGradle(config);
  config = withWebRTCAppGradle(config);
  config = withWebRTCPermissions(config);
  return config;
};
