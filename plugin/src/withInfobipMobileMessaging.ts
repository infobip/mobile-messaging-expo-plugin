import { ConfigPlugin, withPlugins } from 'expo/config-plugins';
import { InfobipPluginProps } from './types';
import { validateProps } from './helpers';
import { withInfobipIos } from './ios/withInfobipIos';
import { withInfobipAndroid } from './android/withInfobipAndroid';

const withInfobipMobileMessaging: ConfigPlugin<InfobipPluginProps | undefined> = (
  config,
  rawProps
) => {
  const props: InfobipPluginProps = rawProps ?? {};
  validateProps(props);

  const resolvedProps: InfobipPluginProps = {
    iosMode: props.iosMode ?? 'development',
    iosAppGroupSuffix: props.iosAppGroupSuffix ?? 'infobip',
    enableNotificationExtension: props.enableNotificationExtension ?? true,
    iosDeploymentTarget: props.iosDeploymentTarget ?? '15.0',
    enableGoogleServices: props.enableGoogleServices ?? true,
    nseVersion: props.nseVersion ?? '15.0.0',
    ...props,
  };

  return withPlugins(config, [
    [withInfobipIos, resolvedProps],
    [withInfobipAndroid, resolvedProps],
  ]);
};

export default withInfobipMobileMessaging;
