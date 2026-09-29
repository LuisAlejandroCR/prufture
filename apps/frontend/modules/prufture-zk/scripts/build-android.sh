#!/usr/bin/env bash
# build-android.sh: compiles packages/zk-prover for arm64-v8a Android with cargo-ndk and stages what
# the PruftureZk Gradle module needs: jniLibs/arm64-v8a/libprufture_zk_prover.so and the zkey asset.
# Runs on the EAS Linux builder via eas-build-pre-install; safe to rerun locally with an NDK installed.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
CRATE="$(cd "$HERE/../../../../packages/zk-prover" && pwd)"
MAIN="$HERE/android/src/main"
# Expo SDK 54 minSdkVersion; keeps the .so loadable on every device the app installs on.
API_LEVEL=24

if ! command -v cargo >/dev/null 2>&1; then
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
fi
# shellcheck disable=SC1091
[ -f "$HOME/.cargo/env" ] && source "$HOME/.cargo/env"
rustup target add aarch64-linux-android
command -v cargo-ndk >/dev/null 2>&1 || cargo install cargo-ndk --locked

# circom-witnesscalc compiles .proto files at build time. The builder has no protoc and no sudo
# guarantee, so fetch the official release binary into a temp dir instead of apt-get.
if ! command -v protoc >/dev/null 2>&1; then
  PROTOC_VERSION=29.3
  case "$(uname -s)-$(uname -m)" in
    Linux-x86_64) PROTOC_ARCH=linux-x86_64 ;;
    Linux-aarch64) PROTOC_ARCH=linux-aarch_64 ;;
    Darwin-*) PROTOC_ARCH=osx-universal_binary ;;
    *) echo "build-android.sh: install protoc manually for $(uname -s)-$(uname -m)" >&2; exit 1 ;;
  esac
  PROTOC_DIR="$(mktemp -d)"
  curl --proto '=https' --tlsv1.2 -sSfL -o "$PROTOC_DIR/protoc.zip" \
    "https://github.com/protocolbuffers/protobuf/releases/download/v$PROTOC_VERSION/protoc-$PROTOC_VERSION-$PROTOC_ARCH.zip"
  if command -v unzip >/dev/null 2>&1; then
    unzip -q "$PROTOC_DIR/protoc.zip" -d "$PROTOC_DIR"
  else
    python3 -m zipfile -e "$PROTOC_DIR/protoc.zip" "$PROTOC_DIR"
  fi
  chmod +x "$PROTOC_DIR/bin/protoc"
  export PROTOC="$PROTOC_DIR/bin/protoc"
  export PATH="$PROTOC_DIR/bin:$PATH"
fi

# circom-witnesscalc also runs bindgen, which needs a host libclang; the NDK does not ship one.
if [ "$(uname -s)" = "Linux" ] && [ -z "${LIBCLANG_PATH:-}" ] \
  && ! ldconfig -p 2>/dev/null | grep -q 'libclang[-.0-9]*\.so'; then
  SUDO=""
  [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  $SUDO apt-get update -qq
  $SUDO apt-get install -y -qq libclang-dev
fi

# cargo-ndk finds the NDK through ANDROID_NDK_HOME, or the newest one under $ANDROID_HOME/ndk.
# It reads Cargo metadata from the working directory (--manifest-path alone is not enough), hence cd.
rm -rf "$MAIN/jniLibs" "$MAIN/assets"
mkdir -p "$MAIN/jniLibs" "$MAIN/assets"
(cd "$CRATE" && cargo ndk -t arm64-v8a -P "$API_LEVEL" -o "$MAIN/jniLibs" build --release --lib)

# Only the shared object is loaded by JNA; drop anything else cargo-ndk copied.
find "$MAIN/jniLibs" -type f ! -name 'libprufture_zk_prover.so' -delete
cp "$CRATE/artifacts/semaphore-10.zkey" "$MAIN/assets/"
echo "PruftureZk staged: $(du -sh "$MAIN/jniLibs/arm64-v8a/libprufture_zk_prover.so" | cut -f1) arm64-v8a .so"
