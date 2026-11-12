// SPDX-FileCopyrightText: 2026 DTU_DZ_2
// SPDX-License-Identifier: GPL-3.0-or-later
// Điểm vào app iOS (theo mẫu React Native 0.80), sửa hai chỗ:
// - Dùng vòng đời UIScene: app build bằng SDK iOS 27 trở lên mà không có scene thì dừng ngay khi mở. AppDelegate
//   tạo RCTReactNativeFactory, SceneDelegate tạo cửa sổ và chạy React Native trong cửa sổ đó.
// - Nhận URL quay về sau khi đăng nhập Keycloak: react-native-app-auth mở trang đăng nhập, Keycloak chuyển về
//   vn.communedxos.motcua:/oauth, iOS gọi scene(_:openURLContexts:) và URL được trả cho luồng đăng nhập đang chờ.
import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate, RNAppAuthAuthorizationFlowManager {
  /// react-native-app-auth tìm thuộc tính này trên UIApplication.delegate khi bắt đầu đăng nhập.
  weak var authorizationFlowManagerDelegate: RNAppAuthAuthorizationFlowManagerDelegate?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory
    return true
  }

  func application(
    _ application: UIApplication,
    configurationForConnecting connectingSceneSession: UISceneSession,
    options: UIScene.ConnectionOptions
  ) -> UISceneConfiguration {
    UISceneConfiguration(name: "Default Configuration", sessionRole: connectingSceneSession.role)
  }

  /// Trả URL cho luồng đăng nhập đang chờ; URL khác chuyển cho Linking của React Native.
  func moUrl(_ url: URL) {
    if let flow = authorizationFlowManagerDelegate, flow.resumeExternalUserAgentFlow(with: url) {
      return
    }
    _ = RCTLinkingManager.application(UIApplication.shared, open: url, options: [:])
  }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
      let appDelegate = UIApplication.shared.delegate as? AppDelegate,
      let factory = appDelegate.reactNativeFactory
    else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    factory.startReactNative(withModuleName: "MotCuaXa", in: window, launchOptions: nil)

    connectionOptions.urlContexts.forEach { appDelegate.moUrl($0.url) }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    URLContexts.forEach { appDelegate.moUrl($0.url) }
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
