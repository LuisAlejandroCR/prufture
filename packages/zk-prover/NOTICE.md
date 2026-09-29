<!-- packages/zk-prover/NOTICE.md: origen y licencias de los binarios de terceros de este crate,
     con sus sha256. Distinto de docs/zk_semaphore_plan.md (plan y verificación): aquí solo va
     de dónde viene cada artefacto y bajo qué licencia se usa. -->

# Third-party artifacts

| File | Source | License | sha256 |
|---|---|---|---|
| `witness_graph/semaphore-10.bin` | github.com/semaphore-protocol/semaphore-rs `witness_graph/` | MIT | `93fd7ddf23b130ca9d7cbe479a98ee7d9f76987f37e6ff839d60442fd6a45592` |
| `artifacts/semaphore-10.zkey` | snark-artifacts.pse.dev/semaphore/4.13.0 (Semaphore v4 trusted setup) | MIT | `f644af6753be9d48454d8f9bb74bf2e9a416dd7d1a704c3cf1d50e535969a19a` |

Prover: `circom-prover` 0.1.4 (zkmopro/mopro, MIT OR Apache-2.0).

Build (Windows Smart App Control blocks cargo build scripts; use Docker):

    docker run --rm -v "<crate>:/src" -v prufture-zk-target:/target -e CARGO_TARGET_DIR=/target -w /src rust:1 \
      bash -c 'apt-get update -qq && apt-get install -y -qq protobuf-compiler clang && cargo build --release'

Gate: `cd apps/api && npx tsx scripts/zk-prover-gate.ts` -> `GATE PASS`.
