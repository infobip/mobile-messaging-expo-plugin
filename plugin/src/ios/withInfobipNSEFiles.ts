import { ConfigPlugin, withDangerousMod } from 'expo/config-plugins';
import * as fs from 'fs';
import * as path from 'path';
import { InfobipPluginProps } from '../types';
import { NSE_TARGET_NAME, DEFAULT_APP_GROUP_SUFFIX } from './constants';
import { createFileIfNoneExists, ensureDirectoryExists } from '../support/FileManager';

export const withInfobipNSEFiles: ConfigPlugin<InfobipPluginProps> = (config, props) => {
  return withDangerousMod(config, [
    'ios',
    async (newConfig) => {
      const iosPath = path.join(newConfig.modRequest.projectRoot, 'ios');
      const nsePath = path.join(iosPath, NSE_TARGET_NAME);
      ensureDirectoryExists(nsePath);

      const templateDir = path.join(__dirname, '..', 'support', 'nseTemplates');

      const bundleIdentifier = newConfig.ios?.bundleIdentifier ?? '';
      const groupId = props.iosAppGroup
        ?? `group.${bundleIdentifier}.${props.iosAppGroupSuffix ?? DEFAULT_APP_GROUP_SUFFIX}`;

      const bundleShortVersion = newConfig.version ?? '1.0.0';
      const bundleVersion = newConfig.ios?.buildNumber ?? '1';

      // NotificationService.swift
      if (props.iosNSEFilePath) {
        // Custom NSE file: only create if none exists (preserve user customizations)
        const customContent = fs.readFileSync(
          path.resolve(newConfig.modRequest.projectRoot, props.iosNSEFilePath),
          'utf-8'
        );
        createFileIfNoneExists(
          path.join(nsePath, 'NotificationService.swift'),
          customContent
        );
      } else {
        // Default template: always overwrite to keep in sync
        const templateContent = fs.readFileSync(
          path.join(templateDir, 'NotificationService.swift'),
          'utf-8'
        );
        fs.writeFileSync(
          path.join(nsePath, 'NotificationService.swift'),
          templateContent,
          'utf-8'
        );
      }

      // Info.plist - always overwrite with current version values
      let plistContent = fs.readFileSync(
        path.join(templateDir, `${NSE_TARGET_NAME}-Info.plist`),
        'utf-8'
      );
      plistContent = plistContent
        .replace(/\{\{BUNDLE_SHORT_VERSION\}\}/g, bundleShortVersion)
        .replace(/\{\{BUNDLE_VERSION\}\}/g, bundleVersion);
      fs.writeFileSync(
        path.join(nsePath, `${NSE_TARGET_NAME}-Info.plist`),
        plistContent,
        'utf-8'
      );

      // Entitlements - always overwrite with current group ID
      let entitlementsContent = fs.readFileSync(
        path.join(templateDir, `${NSE_TARGET_NAME}.entitlements`),
        'utf-8'
      );
      entitlementsContent = entitlementsContent.replace(
        /\{\{GROUP_IDENTIFIER\}\}/g,
        groupId
      );
      fs.writeFileSync(
        path.join(nsePath, `${NSE_TARGET_NAME}.entitlements`),
        entitlementsContent,
        'utf-8'
      );

      return newConfig;
    },
  ]);
};
