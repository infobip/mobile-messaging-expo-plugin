//
//  types.ts
//  MobileMessagingExpo
//
//  Copyright (c) 2016-2026 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

export type InfobipPluginProps = {
  /** APS environment for push notifications. Default: 'development' */
  iosMode?: 'development' | 'production';

  /** App group suffix. Full ID: group.<bundleId>.<suffix>. Default: 'infobip' */
  iosAppGroupSuffix?: string;

  /** Full app group ID override. If set, iosAppGroupSuffix is ignored.
   *  Example: 'group.com.infobip.mobilemessaging.reactnative' */
  iosAppGroup?: string;

  /** Whether to create the Notification Service Extension target. Default: true */
  enableNotificationExtension?: boolean;

  /** Path to a custom NotificationService.swift file */
  iosNSEFilePath?: string;

  /** Minimum iOS deployment target for the NSE. Default: '15.0' */
  iosDeploymentTarget?: string;

  /** Apple Development Team ID for code signing */
  devTeam?: string;

  /** Whether to add the Google Services Gradle plugin on Android. Default: true */
  enableGoogleServices?: boolean;

  /** Path to google-services.json. Falls back to expo.android.googleServicesFile */
  googleServicesFilePath?: string;

  /** Custom deep link scheme (e.g., 'com.infobip.mobilemessaging') */
  deepLinkScheme?: string;

  /** Whether to enable WebRTC UI (calls) on Android. Adds required build flags,
   *  core library desugaring, and permissions. Default: false */
  enableWebRTCUI?: boolean;

  /** MobileMessagingNotificationExtension pod version. Default: '15.0.0' */
  nseVersion?: string;
};
