//
//  withInfobipAndroid.ts
//  MobileMessagingExpo
//
//  Copyright (c) 2016-2026 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

import { ConfigPlugin, withAndroidManifest } from 'expo/config-plugins';
import { InfobipPluginProps } from '../types';
import { withInfobipGoogleServices } from './withInfobipGoogleServices';
import { withInfobipGoogleServicesFile } from './withInfobipGoogleServicesFile';

/**
 * Fix manifest merger conflicts between Infobip SDK and Expo defaults.
 * Infobip SDK sets allowBackup=false (Expo=true), enableOnBackInvokedCallback=true (Expo=false),
 * and usesCleartextTraffic=true. Add tools:replace to let our values win.
 */
const withInfobipManifestFix: ConfigPlugin = (config) => {
  return withAndroidManifest(config, (newConfig) => {
    const mainApplication = newConfig.modResults.manifest.application?.[0];
    if (mainApplication) {
      const existing = mainApplication.$['tools:replace'] ?? '';
      const attrs = new Set(existing.split(',').map((s: string) => s.trim()).filter(Boolean));
      attrs.add('android:allowBackup');
      attrs.add('android:enableOnBackInvokedCallback');
      mainApplication.$['tools:replace'] = Array.from(attrs).join(',');
      // Ensure tools namespace is declared
      if (!newConfig.modResults.manifest.$['xmlns:tools']) {
        newConfig.modResults.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
      }
    }
    return newConfig;
  });
};

/**
 * Add deep link intent-filter to the main activity.
 * The scheme is used by the Infobip SDK to open deep links from push notifications.
 */
const withInfobipDeepLinks: ConfigPlugin<InfobipPluginProps> = (config, props) => {
  if (!props.deepLinkScheme) return config;

  return withAndroidManifest(config, (newConfig) => {
    const mainApplication = newConfig.modResults.manifest.application?.[0];
    const mainActivity = mainApplication?.activity?.find(
      (a: any) => a.$['android:name'] === '.MainActivity'
    );

    if (!mainActivity) return newConfig;

    // Ensure singleTask launch mode for deep links
    mainActivity.$['android:launchMode'] = 'singleTask';

    // Check if intent-filter with this scheme already exists
    const intentFilters = mainActivity['intent-filter'] ?? [];
    const schemeExists = intentFilters.some((f: any) =>
      f.data?.some((d: any) => d.$?.['android:scheme'] === props.deepLinkScheme)
    );

    if (!schemeExists) {
      intentFilters.push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        category: [
          { $: { 'android:name': 'android.intent.category.DEFAULT' } },
          { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
        ],
        data: [{ $: { 'android:scheme': props.deepLinkScheme } }],
      });
      mainActivity['intent-filter'] = intentFilters;
    }

    return newConfig;
  });
};

export const withInfobipAndroid: ConfigPlugin<InfobipPluginProps> = (config, props) => {
  config = withInfobipManifestFix(config);
  config = withInfobipDeepLinks(config, props);

  if (props.enableGoogleServices !== false) {
    config = withInfobipGoogleServices(config);
    config = withInfobipGoogleServicesFile(config, props);
  }

  return config;
};
