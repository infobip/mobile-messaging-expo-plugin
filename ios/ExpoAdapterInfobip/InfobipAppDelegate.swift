//
//  InfobipAppDelegate.swift
//  MobileMessagingExpo
//
//  Copyright (c) 2016-2026 Infobip Limited
//  Licensed under the Apache License, Version 2.0
//

import ExpoModulesCore
import MobileMessaging

public class InfobipAppDelegate: ExpoAppDelegateSubscriber {
    public func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        MobileMessaging.didRegisterForRemoteNotificationsWithDeviceToken(deviceToken)
    }

    public func application(
        _ application: UIApplication,
        didReceiveRemoteNotification userInfo: [AnyHashable: Any],
        fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void
    ) {
        // Completion-handler ownership in Expo's subscriber model:
        // ExpoAppDelegateSubscriberManager (expo-modules-core) does not hand us the
        // system completion handler directly — it passes an aggregator that counts
        // per-subscriber invocations and invokes the real system handler exactly
        // once after every registered subscriber calls back. Each subscriber is
        // therefore REQUIRED to invoke this handler exactly once — both in the
        // "payload is ours" and "payload is not ours" branches. Silently returning
        // without calling it would stall the aggregator's counter and prevent iOS
        // from ever being told the background fetch is done (risks future-push
        // throttling by iOS's push budget). Calling it twice would be benign (the
        // aggregator gates on `subscribersLeft == 0`) but conceptually wrong.
        //
        // For non-Infobip payloads we cast a `.noData` vote so the aggregator can
        // still compute the correct final result (Expo's priority:
        // `.failed > .newData > .noData`) based on other subscribers' votes.
        // This is safe for multi-provider setups: each provider's subscriber is
        // called with the same payload and votes according to whether it
        // recognized it.
        guard MM_MTMessage.make(withPayload: userInfo) != nil else {
            completionHandler(.noData)
            return
        }

        // Mirror MobileMessagingPluginApplicationDelegate.install()'s extendUserInfoIfNeeded:
        // when the app is cold-launched by a notification tap, inject a marker so the SDK
        // can distinguish tap-launch from foreground/background deliveries.
        var extendedUserInfo = userInfo
        if application.applicationState == .inactive {
            extendedUserInfo[ApplicationLaunchedByNotification_Key] = true
        }

        MobileMessaging.didReceiveRemoteNotification(
            extendedUserInfo,
            fetchCompletionHandler: completionHandler
        )
    }
}
