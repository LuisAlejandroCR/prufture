// PruftureZkModule.swift: exposes the Rust prover to JS as PruftureZk.prove / .verify. Runs off the
// main thread (AsyncFunction). Holds no identity: the secret arrives inside the circuit inputs and
// is never stored or logged here.

import ExpoModulesCore

final class ZkeyMissingException: Exception {
  override var reason: String { "semaphore-10.zkey is not bundled in this build" }
}

final class ProverException: GenericException<String> {
  override var reason: String { "prover failed: \(param)" }
}

public class PruftureZkModule: Module {
  public func definition() -> ModuleDefinition {
    Name("PruftureZk")

    Constant("treeDepth") { 10 }

    AsyncFunction("prove") { (inputsJson: String) -> String in
      do {
        return try proveSemaphore(inputsJson: inputsJson, zkeyPath: try Self.zkeyPath())
      } catch let e as ProverError {
        throw ProverException(String(describing: e))
      }
    }

    AsyncFunction("verify") { (proofJson: String) -> Bool in
      do {
        return try verifySemaphore(proofJson: proofJson, zkeyPath: try Self.zkeyPath())
      } catch let e as ProverError {
        throw ProverException(String(describing: e))
      }
    }
  }

  // A static framework's resources are copied into the app bundle; check the pod bundle too.
  private static func zkeyPath() throws -> String {
    for bundle in [Bundle.main, Bundle(for: PruftureZkModule.self)] {
      if let path = bundle.path(forResource: "semaphore-10", ofType: "zkey") { return path }
    }
    throw ZkeyMissingException()
  }
}
