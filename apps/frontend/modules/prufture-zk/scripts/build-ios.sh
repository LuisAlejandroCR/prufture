#!/usr/bin/env bash
# build-ios.sh: compiles packages/zk-prover for iOS devices on macOS and stages everything the
# PruftureZk pod needs: PruftureZkFFI.xcframework, the UniFFI Swift bindings and the zkey.
# Runs on the EAS macOS builder via eas-build-pre-install; safe to rerun locally on a Mac.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
CRATE="$(cd "$HERE/../../../../packages/zk-prover" && pwd)"
IOS="$HERE/ios"

if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
# shellcheck disable=SC1091
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
rustup target add aarch64-apple-ios
command -v protoc >/dev/null 2>&1 || brew install protobuf

export IPHONEOS_DEPLOYMENT_TARGET=15.1
cargo build --manifest-path "$CRATE/Cargo.toml" --release --lib --target aarch64-apple-ios

LIB="$CRATE/target/aarch64-apple-ios/release/libprufture_zk_prover.a"
HDR="$(mktemp -d)"
cp "$CRATE/bindings/swift/prufture_zk_proverFFI.h" "$HDR/"
cp "$CRATE/bindings/swift/prufture_zk_proverFFI.modulemap" "$HDR/module.modulemap"

rm -rf "$IOS/PruftureZkFFI.xcframework" "$IOS/generated" "$IOS/assets"
xcodebuild -create-xcframework -library "$LIB" -headers "$HDR" -output "$IOS/PruftureZkFFI.xcframework"
mkdir -p "$IOS/generated" "$IOS/assets"
cp "$CRATE/bindings/swift/prufture_zk_prover.swift" "$IOS/generated/"
cp "$CRATE/artifacts/semaphore-10.zkey" "$IOS/assets/"
echo "PruftureZk staged: $(du -sh "$IOS/PruftureZkFFI.xcframework" | cut -f1) xcframework"
