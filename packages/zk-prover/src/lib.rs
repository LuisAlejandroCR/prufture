// lib.rs: proves the Semaphore v4 depth-10 circuit from a JSON of circuit inputs and a zkey path.
// No network, no identity handling: the secret arrives as a circuit input and is never stored or
// logged here. Output is the packed proof in the exact layout @semaphore-protocol/proof verifies.

use anyhow::{anyhow, Result};
use circom_prover::{
    graph,
    prover::{circom, ProofLib},
    witness::WitnessFn,
    CircomProver,
};

/// The single circuit depth this build supports. Pinned so the bundled zkey and graph match.
pub const TREE_DEPTH: u16 = 10;

// Witness graph for semaphore-10, from semaphore-protocol/semaphore-rs (MIT).
graph!(semaphore10, "../witness_graph/semaphore-10.bin");

/// Packs a Groth16 proof into Semaphore's 8-point layout (G2 coordinates swapped, as snarkjs does).
fn pack(p: &circom::Proof) -> [String; 8] {
    [
        p.a.x.to_string(),
        p.a.y.to_string(),
        p.b.x[1].to_string(),
        p.b.x[0].to_string(),
        p.b.y[1].to_string(),
        p.b.y[0].to_string(),
        p.c.x.to_string(),
        p.c.y.to_string(),
    ]
}

/// `inputs_json`: {secret, merkleProofLength, merkleProofIndex, merkleProofSiblings[10], scope, message}
/// with scope/message already hashed. Returns {"points":[8], "publicSignals":[root, nullifier, message, scope]}.
pub fn prove(inputs_json: &str, zkey_path: &str) -> Result<String> {
    let proof = CircomProver::prove(
        ProofLib::Arkworks,
        WitnessFn::CircomWitnessCalc(semaphore10_witness),
        inputs_json.to_string(),
        zkey_path.to_string(),
    )
    .map_err(|e| anyhow!("prove failed: {e}"))?;
    let signals: Vec<String> = proof.pub_inputs.0.iter().map(|s| s.to_string()).collect();
    if signals.len() != 4 {
        return Err(anyhow!("unexpected public signal count {}", signals.len()));
    }
    Ok(serde_json::json!({ "points": pack(&proof.proof), "publicSignals": signals }).to_string())
}
