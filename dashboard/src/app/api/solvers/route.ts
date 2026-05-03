import { NextResponse } from "next/server";
import { getSolverLeaderboard } from "@/lib/queries";
import { getDb } from "@/lib/mongodb";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const solvers = await getSolverLeaderboard();

    // Enrich with ENS names from subnames collection
    const namehashes = solvers.map((s) => s.solverNamehash).filter(Boolean);
    if (namehashes.length > 0) {
      const db = await getDb();
      const subnames = await db
        .collection("subnames")
        .find({ namehash: { $in: namehashes } })
        .toArray();
      const lookup = new Map(
        subnames.map((s) => [
          s.namehash as string,
          {
            ensName: `${s.label}.${s.namespace}.reckonprotocol.eth`,
            address: (s.owner as string) ?? "",
          },
        ]),
      );
      for (const solver of solvers) {
        const info = lookup.get(solver.solverNamehash);
        if (info) {
          (solver as any).solverEnsName = info.ensName;
          (solver as any).solverAddress = info.address;
        }
      }
    }

    return NextResponse.json(solvers);
  } catch (err) {
    console.error("[api/solvers] Error:", err);
    return NextResponse.json({ error: "Failed to fetch solvers" }, { status: 500 });
  }
}
