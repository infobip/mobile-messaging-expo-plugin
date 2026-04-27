import { ConfigPlugin, withPlugins } from 'expo/config-plugins';
import { InfobipPluginProps } from '../types';
import { withInfobipEntitlements } from './withInfobipEntitlements';
import { withInfobipInfoPlist } from './withInfobipInfoPlist';
import { withInfobipNSEFiles } from './withInfobipNSEFiles';
import { withInfobipPodfile } from './withInfobipPodfile';
import { withInfobipXcodeProject } from './withInfobipXcodeProject';
import { withInfobipEasCredentials } from './withInfobipEasCredentials';

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

  return withPlugins(config, plugins);
};
