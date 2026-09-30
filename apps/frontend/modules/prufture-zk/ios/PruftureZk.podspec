# PruftureZk.podspec: local Expo module wrapping the Rust Semaphore prover (packages/zk-prover).
# PruftureZkFFI.xcframework, generated/*.swift and assets/*.zkey are produced by
# scripts/build-ios.sh on the EAS macOS builder (eas-build-pre-install), never committed.
Pod::Spec.new do |s|
  s.name           = 'PruftureZk'
  s.version        = '0.1.0'
  s.summary        = 'On-device Semaphore v4 group-membership prover'
  s.description    = 'Groth16 prover for the Semaphore v4 depth-10 circuit, via UniFFI.'
  s.author         = 'Prufture'
  s.homepage       = 'https://github.com/LuisAlejandroCR/prufture'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '*.swift', 'generated/*.swift'
  s.vendored_frameworks = 'PruftureZkFFI.xcframework'
  s.resources = ['assets/semaphore-10.zkey']

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
