Pod::Spec.new do |s|
  s.name           = 'InfobipMobileMessagingExpoPlugin'
  s.version        = '0.1.0'
  s.summary        = 'Expo plugin for Infobip Mobile Messaging'
  s.description    = 'Expo config plugin and native adapter for Infobip Mobile Messaging SDK'
  s.homepage       = 'https://github.com/infobip/mobile-messaging-expo-plugin'
  s.license        = 'MIT'
  s.author         = 'Infobip'
  s.platform       = :ios, '15.0'
  s.swift_version  = '5.5'
  s.source         = { :git => 'https://github.com/infobip/mobile-messaging-expo-plugin.git', :tag => s.version }
  s.source_files   = 'ExpoAdapterInfobip/**/*.swift'
  s.dependency 'ExpoModulesCore'
  s.dependency 'MobileMessaging/Core'
end
