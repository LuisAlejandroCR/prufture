# PruftureLiveness.podspec: local Expo module presenting AWS Rekognition Face Liveness (official
# amplify-ui-swift-liveness, Apache-2.0) via Swift Package Manager. Dormant until JS calls
# configure() with an identity pool; nothing runs at app launch.
Pod::Spec.new do |s|
  s.name           = 'PruftureLiveness'
  s.version        = '0.1.0'
  s.summary        = 'AWS Face Liveness check presented from JS'
  s.description    = 'Wraps FaceLivenessDetectorView; returns only a completion status to JS.'
  s.author         = 'Prufture'
  s.homepage       = 'https://github.com/LuisAlejandroCR/prufture'
  s.license        = 'MIT'
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.source_files = '*.swift'

  spm_dependency(s,
    url: 'https://github.com/aws-amplify/amplify-ui-swift-liveness',
    requirement: { kind: 'upToNextMinorVersion', minimumVersion: '1.4.8' },
    products: ['FaceLiveness'])
  spm_dependency(s,
    url: 'https://github.com/aws-amplify/amplify-swift',
    requirement: { kind: 'upToNextMajorVersion', minimumVersion: '2.60.2' },
    products: ['Amplify', 'AWSCognitoAuthPlugin'])

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
