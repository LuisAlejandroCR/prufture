<!-- packages/zk-prover/NOTICE.md: origin, license, and sha256 of each third-party artifact in this
     crate, plus how to build and gate the native prover.
     Distinct from the root LICENSE, which covers Prufture's own source code. -->

# Third-party artifacts

| File | Source | License | sha256 |
|---|---|---|---|
| `witness_graph/semaphore-10.bin` | github.com/semaphore-protocol/semaphore-rs `witness_graph/` | MIT | `93fd7ddf23b130ca9d7cbe479a98ee7d9f76987f37e6ff839d60442fd6a45592` |
| `artifacts/semaphore-10.zkey` | snark-artifacts.pse.dev/semaphore/4.13.0 (Semaphore v4 trusted setup) | MIT | `f644af6753be9d48454d8f9bb74bf2e9a416dd7d1a704c3cf1d50e535969a19a` |

Prover: `circom-prover` 0.1.4 (zkmopro/mopro, MIT OR Apache-2.0).

Build natively on Linux (Debian/Ubuntu; the binary lands in `target/release/prove-cli`):

    apt-get install protobuf-compiler clang && cargo build --release

Build in Docker (Windows Smart App Control blocks cargo build scripts):

    docker run --rm -v "<crate>:/src" -v prufture-zk-target:/target -e CARGO_TARGET_DIR=/target -w /src rust:1 \
      bash -c 'apt-get update -qq && apt-get install -y -qq protobuf-compiler clang && cargo build --release'

Gate, from `apps/api` -> `GATE PASS`:

- native binary: `PROVE_CLI=<crate>/target/release/prove-cli npx tsx scripts/zk-prover-gate.ts`
- Docker build: `npx tsx scripts/zk-prover-gate.ts` (runs `/target/release/prove-cli` in `rust:1`)
