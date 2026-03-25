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

export const withInfobipAndroid: ConfigPlugin<InfobipPluginProps> = (config, props) => {
  config = withInfobipManifestFix(config);

  if (props.enableGoogleServices !== false) {
    config = withInfobipGoogleServices(config);
    config = withInfobipGoogleServicesFile(config, props);
  }

  return config;
};
