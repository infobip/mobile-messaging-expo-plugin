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
        MobileMessaging.didReceiveRemoteNotification(userInfo, fetchCompletionHandler: completionHandler)
    }
}
