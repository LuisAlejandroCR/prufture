#!/usr/bin/env bash
# eas-pre-install.sh: EAS build hook. On iOS: lets Xcode run SPM build plugins non-interactively
# (AWS Amplify's smithy-swift ships one; CI xcodebuild otherwise fails "Validate plug-in") and builds
# the Rust prover. On Android: builds the arm64-v8a .so with cargo-ndk and stages the zkey asset.
set -euo pipefail
if [ "${EAS_BUILD_PLATFORM:-}" = "ios" ]; then
  # The first key keeps Apple's own misspelling ("Validatation"); both spellings are set on purpose.
  defaults write com.apple.dt.Xcode IDESkipPackagePluginFingerprintValidatation -bool YES
  defaults write com.apple.dt.Xcode IDESkipPackagePluginFingerprintValidation -bool YES
  defaults write com.apple.dt.Xcode IDESkipMacroFingerprintValidation -bool YES
  bash "$(dirname "$0")/build-ios.sh"
elif [ "${EAS_BUILD_PLATFORM:-}" = "android" ]; then
  bash "$(dirname "$0")/build-android.sh"
fi
