// PruftureLivenessModule.swift: presents AWS Face Liveness for a session the api created and hands
// JS only a status. The verdict is never decided here: the api reads it from Rekognition
// (GetFaceLivenessSessionResults) and keeps only a boolean. No frame or score reaches JS.

import Amplify
import AWSCognitoAuthPlugin
import ExpoModulesCore
import FaceLiveness
import SwiftUI

final class NotConfiguredException: Exception {
  override var reason: String { "liveness is not configured in this build" }
}

final class NoViewControllerException: Exception {
  override var reason: String { "no view controller to present the liveness check from" }
}

public class PruftureLivenessModule: Module {
  private static var configured = false

  public func definition() -> ModuleDefinition {
    Name("PruftureLiveness")

    Function("isConfigured") { Self.configured }

    // Guest (unauthenticated) credentials from a Cognito identity pool; no user pool, no account.
    AsyncFunction("configure") { (identityPoolId: String, region: String) in
      if Self.configured { return }
      let auth = AuthCategoryConfiguration(plugins: [
        "awsCognitoAuthPlugin": [
          "CredentialsProvider": [
            "CognitoIdentity": [
              "Default": ["PoolId": .string(identityPoolId), "Region": .string(region)]
            ]
          ]
        ]
      ])
      try Amplify.add(plugin: AWSCognitoAuthPlugin())
      try Amplify.configure(AmplifyConfiguration(auth: auth))
      Self.configured = true
    }.runOnQueue(.main)

    // Resolves {status: "completed"} or {status: "failed", code}. "completed" means the capture
    // finished, NOT that a live person was confirmed — only the api's result check decides that.
    AsyncFunction("start") { (sessionId: String, region: String, promise: Promise) in
      guard Self.configured else { throw NotConfiguredException() }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        throw NoViewControllerException()
      }
      var host: UIViewController?
      let view = FaceLivenessDetectorView(
        sessionID: sessionId,
        region: region,
        isPresented: .constant(true),
        onCompletion: { result in
          DispatchQueue.main.async {
            host?.dismiss(animated: true)
            switch result {
            case .success:
              promise.resolve(["status": "completed"])
            case .failure(let error):
              promise.resolve(["status": "failed", "code": error.message])
            }
          }
        }
      )
      let controller = UIHostingController(rootView: view)
      controller.modalPresentationStyle = .fullScreen
      host = controller
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)
  }
}
