#!/usr/bin/env bash
# eas-pre-install.sh: EAS build hook. Builds the Rust prover only for iOS builds; Android builds
# ship without the prover until its Kotlin side exists (the JS wrapper then reports unavailable).
set -euo pipefail
if [ "${EAS_BUILD_PLATFORM:-}" = "ios" ]; then
  bash "$(dirname "$0")/build-ios.sh"
fi
