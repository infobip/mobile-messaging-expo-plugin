//
//  constants.ts
//  MobileMessagingExpo
//
//  Copyright (c) 2016-2026 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

export const NSE_TARGET_NAME = 'InfobipNotificationServiceExtension';
export const NSE_SOURCE_FILE = 'NotificationService.swift';
export const NSE_PLIST_FILE = `${NSE_TARGET_NAME}-Info.plist`;
export const NSE_ENTITLEMENTS_FILE = `${NSE_TARGET_NAME}.entitlements`;
export const NSE_POD_NAME = 'MobileMessagingNotificationExtension';
export const NSE_DEFAULT_POD_VERSION = '15.0.0';
// Expo SDK 55 minimum is iOS 15.1. This fallback is used only if auto-detection
// from the main app's Xcode project fails.
export const DEFAULT_IOS_DEPLOYMENT_TARGET = '15.1';
export const DEFAULT_APP_GROUP_SUFFIX = 'infobip';
export const INFOBIP_APP_GROUP_PLIST_KEY = 'com.mobilemessaging.app_group';
export const MERGE_TAG_PREFIX = 'infobip-mobile-messaging';
