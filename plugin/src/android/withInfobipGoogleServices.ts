//
//  withInfobipGoogleServices.ts
//  MobileMessagingExpo
//
//  Copyright (c) 2016-2026 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

import { ConfigPlugin, withAppBuildGradle, withProjectBuildGradle } from 'expo/config-plugins';
import { mergeContents } from '@expo/config-plugins/build/utils/generateCode';
import {
  GOOGLE_SERVICES_CLASSPATH,
  GOOGLE_SERVICES_CLASSPATH_VERSION,
  GOOGLE_SERVICES_PLUGIN,
  MERGE_TAG_PREFIX,
} from './constants';

/**
 * Adds the Google Services classpath dependency to the root build.gradle.
 */
const withProjectGoogleServicesClasspath: ConfigPlugin = (config) => {
  return withProjectBuildGradle(config, (newConfig) => {
    if (newConfig.modResults.language === 'groovy') {
      newConfig.modResults.contents = addGoogleServicesClasspath(newConfig.modResults.contents);
    } else {
      throw new Error(
        '[infobip] Cannot configure Google Services in build.gradle -- Kotlin DSL (build.gradle.kts) is not yet supported.'
      );
    }
    return newConfig;
  });
};

/**
 * Applies the Google Services plugin to the app build.gradle.
 */
const withAppGoogleServicesPlugin: ConfigPlugin = (config) => {
  return withAppBuildGradle(config, (newConfig) => {
    if (newConfig.modResults.language === 'groovy') {
      newConfig.modResults.contents = applyGoogleServicesPlugin(newConfig.modResults.contents);
    } else {
      throw new Error(
        '[infobip] Cannot apply Google Services plugin in app/build.gradle -- Kotlin DSL (build.gradle.kts) is not yet supported.'
      );
    }
    return newConfig;
  });
};

export function addGoogleServicesClasspath(contents: string): string {
  // Skip if already present
  if (contents.includes(GOOGLE_SERVICES_CLASSPATH)) {
    return contents;
  }

  const result = mergeContents({
    src: contents,
    newSrc: `        classpath '${GOOGLE_SERVICES_CLASSPATH}:${GOOGLE_SERVICES_CLASSPATH_VERSION}'`,
    tag: `${MERGE_TAG_PREFIX}-google-services-classpath`,
    anchor: /dependencies\s*\{/,
    offset: 1,
    comment: '//',
  });

  if (result.didMerge || result.didClear) {
    return result.contents;
  }

  console.warn(
    '[infobip] Could not add Google Services classpath to root build.gradle. ' +
      'Please add it manually: classpath ' +
      `'${GOOGLE_SERVICES_CLASSPATH}:${GOOGLE_SERVICES_CLASSPATH_VERSION}'`
  );
  return contents;
}

export function applyGoogleServicesPlugin(contents: string): string {
  // Check for existing plugin application (both Groovy and KTS patterns)
  if (
    contents.includes(GOOGLE_SERVICES_PLUGIN) ||
    contents.includes(`apply plugin: '${GOOGLE_SERVICES_PLUGIN}'`) ||
    contents.includes(`id '${GOOGLE_SERVICES_PLUGIN}'`) ||
    contents.includes(`id("${GOOGLE_SERVICES_PLUGIN}")`)
  ) {
    return contents;
  }

  const result = mergeContents({
    src: contents,
    newSrc: `apply plugin: '${GOOGLE_SERVICES_PLUGIN}'`,
    tag: `${MERGE_TAG_PREFIX}-google-services-apply`,
    anchor: /$/,
    offset: 0,
    comment: '//',
  });

  if (result.didMerge || result.didClear) {
    return result.contents;
  }

  console.warn(
    '[infobip] Could not apply Google Services plugin to app/build.gradle. ' +
      `Please add it manually: apply plugin: '${GOOGLE_SERVICES_PLUGIN}'`
  );
  return contents;
}

export const withInfobipGoogleServices: ConfigPlugin = (config) => {
  config = withProjectGoogleServicesClasspath(config);
  config = withAppGoogleServicesPlugin(config);
  return config;
};
