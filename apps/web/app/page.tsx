// page.tsx: landing — explains the guarantee and links to a sample verify page.

export default function Home() {
  return (
    <section>
      <h1>Prufture</h1>
      <p>
        A volunteer photographs field evidence offline. The proof reaches the organization signed,
        geolocated to a coarse region, and with zero personal data.
      </p>
      <ul>
        <li>Public payload: proofHash, taskId, geohash, capturedAt — nothing else.</li>
        <li>Anchored on Base Sepolia via the Ethereum Attestation Service.</li>
        <li>
          <a href="/dashboard">Stakeholder dashboard</a>
        </li>
      </ul>
    </section>
  );
}
