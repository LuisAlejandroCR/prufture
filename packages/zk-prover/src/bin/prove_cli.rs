// prove_cli.rs: host-side harness for the prover gate. Reads circuit inputs JSON on stdin, prints
// the proof JSON and the prove time in ms on stderr. Test-only; not shipped in the app.

use std::io::Read;
use std::time::Instant;

fn main() -> anyhow::Result<()> {
    let zkey = std::env::args().nth(1).expect("usage: prove-cli <zkey-path> < inputs.json");
    let mut inputs = String::new();
    std::io::stdin().read_to_string(&mut inputs)?;
    let t = Instant::now();
    let out = prufture_zk_prover::prove(&inputs, &zkey)?;
    eprintln!("prove_ms={}", t.elapsed().as_millis());
    println!("{out}");
    Ok(())
}
