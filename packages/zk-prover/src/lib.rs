// lib.rs: proves and verifies the Semaphore v4 depth-10 circuit from JSON circuit inputs and a zkey
// path. No network, no identity handling: the secret arrives as a circuit input and is never stored
// or logged here. Exposed to Swift/Kotlin through UniFFI (prove_semaphore / verify_semaphore).

use anyhow::{anyhow, Result};
use circom_prover::{
    graph,
    prover::{
        circom::{self, CURVE_BN254, G1, G2, PROTOCOL_GROTH16},
        CircomProof, ProofLib, PublicInputs,
    },
    witness::WitnessFn,
    CircomProver,
};
use num_bigint::BigUint;
use std::str::FromStr;

uniffi::setup_scaffolding!();

/// The single circuit depth this build supports. Pinned so the bundled zkey and graph match.
pub const TREE_DEPTH: u16 = 10;

// Witness graph for semaphore-10, from semaphore-protocol/semaphore-rs (MIT).
graph!(semaphore10, "../witness_graph/semaphore-10.bin");

#[derive(Debug, uniffi::Error)]
pub enum ProverError {
    Failed { msg: String },
}

impl std::fmt::Display for ProverError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProverError::Failed { msg } => write!(f, "{msg}"),
        }
    }
}

impl std::error::Error for ProverError {}

impl From<anyhow::Error> for ProverError {
    fn from(e: anyhow::Error) -> Self {
        ProverError::Failed { msg: e.to_string() }
    }
}

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

fn unpack(points: &[BigUint; 8]) -> circom::Proof {
    let one = BigUint::from(1u8);
    circom::Proof {
        a: G1 { x: points[0].clone(), y: points[1].clone(), z: one.clone() },
        b: G2 {
            x: [points[3].clone(), points[2].clone()],
            y: [points[5].clone(), points[4].clone()],
            z: [one.clone(), BigUint::from(0u8)],
        },
        c: G1 { x: points[6].clone(), y: points[7].clone(), z: one },
        protocol: PROTOCOL_GROTH16.to_string(),
        curve: CURVE_BN254.to_string(),
    }
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

/// Verifies the output of `prove` (same JSON shape) against the zkey's verification key.
pub fn verify(proof_json: &str, zkey_path: &str) -> Result<bool> {
    let v: serde_json::Value = serde_json::from_str(proof_json)?;
    let nums = |key: &str| -> Result<Vec<BigUint>> {
        v[key]
            .as_array()
            .ok_or_else(|| anyhow!("missing {key}"))?
            .iter()
            .map(|x| {
                let s = x.as_str().ok_or_else(|| anyhow!("{key} must be strings"))?;
                BigUint::from_str(s).map_err(|e| anyhow!("{key}: {e}"))
            })
            .collect()
    };
    let points: [BigUint; 8] = nums("points")?.try_into().map_err(|_| anyhow!("points must have 8 entries"))?;
    let signals = nums("publicSignals")?;
    let p = CircomProof { proof: unpack(&points), pub_inputs: PublicInputs(signals) };
    CircomProver::verify(ProofLib::Arkworks, p, zkey_path.to_string()).map_err(|e| anyhow!("verify failed: {e}"))
}

#[uniffi::export]
pub fn prove_semaphore(inputs_json: String, zkey_path: String) -> Result<String, ProverError> {
    Ok(prove(&inputs_json, &zkey_path)?)
}

#[uniffi::export]
pub fn verify_semaphore(proof_json: String, zkey_path: String) -> Result<bool, ProverError> {
    Ok(verify(&proof_json, &zkey_path)?)
}
