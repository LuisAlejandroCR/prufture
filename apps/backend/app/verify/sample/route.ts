// /verify/sample: the landing's "Explore a real report" target. Redirects to a report the store holds
// right now (lib/sample.ts), so the link never lands on "Report not found" after a store reset. When
// the index is unreachable it falls back to the configured sample, whose page explains the outage.

import { NextResponse } from "next/server";
import { fetchProofs } from "../../../lib/api";
import { pickSampleHash } from "../../../lib/sample";
import { PREFERRED_SAMPLE_HASH } from "../../../lib/site";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { proofs, degraded } = await fetchProofs();
  const hash = (degraded ? null : pickSampleHash(proofs, PREFERRED_SAMPLE_HASH)) ?? PREFERRED_SAMPLE_HASH;
  return NextResponse.redirect(new URL(`/verify/${hash}`, req.url), 307);
}
