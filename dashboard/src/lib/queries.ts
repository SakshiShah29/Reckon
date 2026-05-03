import { getDb } from "./mongodb";
import {
  MONGO_COLLECTIONS,
} from "@reckon-protocol/types";
import type {
  FillRecord,
  SlashDocRecord,
  ReputationUpdate,
  ChallengeRecord,
} from "@reckon-protocol/types";
import { createPublicClient, http, type Address } from "viem";
import { mainnet } from "viem/chains";

const mainnetClient = createPublicClient({
  chain: mainnet,
  transport: http("https://eth.llamarpc.com"),
});

/**
 * Fetches the most recent fills, sorted by fillBlock descending.
 */
export async function getRecentFills(limit = 50): Promise<FillRecord[]> {
  const db = await getDb();
  return db
    .collection<FillRecord>(MONGO_COLLECTIONS.fills)
    .find({})
    .sort({ fillBlock: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Fetches recent challenges, sorted by challengeBlock descending.
 * Enriches with challenger ENS name from subnames collection.
 */
export async function getRecentChallenges(limit = 50) {
  const db = await getDb();
  const challenges = await db
    .collection<ChallengeRecord>(MONGO_COLLECTIONS.challenges)
    .find({})
    .sort({ challengeBlock: -1 })
    .limit(limit)
    .toArray();

  // Resolve challenger ENS names from namehashes
  const hashes = [
    ...new Set(challenges.map((c) => c.challengerNamehash).filter(Boolean)),
  ];
  if (hashes.length > 0) {
    // Try subnames collection first
    const subnames = await db
      .collection("subnames")
      .find({ namehash: { $in: hashes } })
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

    // Fallback: check registrations collection for any unresolved hashes
    const unresolvedHashes = hashes.filter((h) => !lookup.has(h));
    if (unresolvedHashes.length > 0) {
      const regs = await db
        .collection("registrations")
        .find({ node: { $in: unresolvedHashes } })
        .toArray();
      for (const reg of regs) {
        const ns = reg.role === "solver" ? "solvers" : "challengers";
        lookup.set(reg.node as string, {
          ensName: `${reg.label}.${ns}.reckonprotocol.eth`,
          address: (reg.ownerAddress as string) ?? "",
        });
      }
    }

    for (const ch of challenges as any[]) {
      if (lookup.has(ch.challengerNamehash)) {
        const info = lookup.get(ch.challengerNamehash)!;
        ch.challengerEnsName = info.ensName;
      }
    }
  }

  return challenges;
}

/**
 * Fetches recent slashes, sorted by timestamp descending.
 * Enriches with solver ENS name + address from subnames collection if missing.
 */
export async function getRecentSlashes(limit = 50) {
  const db = await getDb();
  const slashes = await db
    .collection<SlashDocRecord>(MONGO_COLLECTIONS.slashes)
    .find({})
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();

  // Collect all namehashes that need ENS resolution (both solver + challenger)
  const allHashes = new Set<string>();
  for (const s of slashes) {
    if (s.solverNamehash && !s.solverEnsName) allHashes.add(s.solverNamehash);
    if (s.challengerNamehash) allHashes.add(s.challengerNamehash);
  }
  if (allHashes.size > 0) {
    // Try subnames collection first
    const subnames = await db
      .collection("subnames")
      .find({ namehash: { $in: [...allHashes] } })
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

    // Fallback: check registrations collection for any unresolved hashes
    const unresolvedHashes = [...allHashes].filter((h) => !lookup.has(h));
    if (unresolvedHashes.length > 0) {
      const regs = await db
        .collection("registrations")
        .find({ node: { $in: unresolvedHashes } })
        .toArray();
      for (const reg of regs) {
        const ns = reg.role === "solver" ? "solvers" : "challengers";
        lookup.set(reg.node as string, {
          ensName: `${reg.label}.${ns}.reckonprotocol.eth`,
          address: (reg.ownerAddress as string) ?? "",
        });
      }
    }

    for (const slash of slashes as any[]) {
      if (!slash.solverEnsName && lookup.has(slash.solverNamehash)) {
        const info = lookup.get(slash.solverNamehash)!;
        slash.solverEnsName = info.ensName;
        slash.solverAddress = info.address;
      }
      if (lookup.has(slash.challengerNamehash)) {
        const info = lookup.get(slash.challengerNamehash)!;
        slash.challengerEnsName = info.ensName;
      }
    }
  }

  return slashes;
}

/**
 * Fetches reputation data for all solvers, sorted by reputation descending.
 */
export async function getSolverLeaderboard(): Promise<ReputationUpdate[]> {
  const db = await getDb();
  return db
    .collection<ReputationUpdate>(MONGO_COLLECTIONS.reputationUpdates)
    .find({})
    .sort({ reputationScore: -1 })
    .toArray();
}

/**
 * Fetches reputation for a specific solver by namehash.
 */
export async function getSolverReputation(
  namehash: string,
): Promise<ReputationUpdate | null> {
  const db = await getDb();
  return db
    .collection<ReputationUpdate>(MONGO_COLLECTIONS.reputationUpdates)
    .findOne({ solverNamehash: namehash as `0x${string}` });
}

/**
 * Looks up solver info by on-chain address.
 * Resolves ENS subname + reputation from subnames + reputationUpdates collections.
 */
export async function getSolverByAddress(address: string): Promise<{
  ensName: string | null;
  namehash: string | null;
  address: string;
  reputationScore: string | null;
  totalFills: number;
  slashCount: number;
  bondAmount: string | null;
} | null> {
  const db = await getDb();
  const addrLower = address.toLowerCase();

  // Strategy 1: Look up subname by owner address (case-insensitive)
  let subname = await db.collection("subnames").findOne({
    owner: { $regex: new RegExp(`^${addrLower}$`, "i") },
  });

  // Strategy 2: If not found by owner, find via fills collection → namehash → subnames
  if (!subname) {
    const fill = await db
      .collection<FillRecord>(MONGO_COLLECTIONS.fills)
      .findOne({ filler: { $regex: new RegExp(`^${addrLower}$`, "i") } });
    if (fill?.fillerNamehash) {
      subname = await db.collection("subnames").findOne({
        namehash: fill.fillerNamehash,
      });
    }
  }

  // Strategy 3: Try registrations collection → namehash → subnames
  if (!subname) {
    const reg = await db.collection("registrations").findOne({
      solverAddress: { $regex: new RegExp(`^${addrLower}$`, "i") },
    });
    if (reg?.solverNamehash) {
      subname = await db.collection("subnames").findOne({
        namehash: reg.solverNamehash,
      });
    }
  }

  let ensName: string | null = null;
  let namehash: string | null = null;

  if (subname) {
    ensName = `${subname.label}.${subname.namespace}.reckonprotocol.eth`;
    namehash = subname.namehash as string;
  }

  // Strategy 4: Mainnet ENS reverse resolution as fallback
  if (!ensName) {
    try {
      const resolved = await mainnetClient.getEnsName({
        address: address as Address,
      });
      if (resolved) ensName = resolved;
    } catch {
      // Mainnet ENS resolution failed — continue without
    }
  }

  // Get reputation data (try by namehash first, then by solver address in fills)
  let rep = namehash
    ? await db
        .collection<ReputationUpdate>(MONGO_COLLECTIONS.reputationUpdates)
        .findOne({ solverNamehash: namehash as `0x${string}` })
    : null;

  if (!rep) {
    // Try finding reputation via fills → namehash
    const fill = await db
      .collection<FillRecord>(MONGO_COLLECTIONS.fills)
      .findOne({ filler: { $regex: new RegExp(`^${addrLower}$`, "i") } });
    if (fill?.fillerNamehash) {
      namehash = fill.fillerNamehash;
      rep = await db
        .collection<ReputationUpdate>(MONGO_COLLECTIONS.reputationUpdates)
        .findOne({ solverNamehash: fill.fillerNamehash });
    }
  }

  // Try to get bond amount from solver registration
  const regQuery = namehash
    ? {
        $or: [
          { solverAddress: { $regex: new RegExp(`^${addrLower}$`, "i") } },
          { solverNamehash: namehash },
        ],
      }
    : { solverAddress: { $regex: new RegExp(`^${addrLower}$`, "i") } };
  const registration = await db.collection("registrations").findOne(regQuery);

  return {
    ensName,
    namehash,
    address,
    reputationScore: rep?.reputationScore ?? null,
    totalFills: rep?.totalFills ?? 0,
    slashCount: rep?.slashCount ?? 0,
    bondAmount: registration?.bondAmount ?? null,
  };
}

/**
 * Fetches fills for a specific solver.
 */
export async function getFillsBySolver(
  fillerNamehash: string,
  limit = 100,
): Promise<FillRecord[]> {
  const db = await getDb();
  return db
    .collection<FillRecord>(MONGO_COLLECTIONS.fills)
    .find({ fillerNamehash: fillerNamehash as `0x${string}` })
    .sort({ fillBlock: -1 })
    .limit(limit)
    .toArray();
}

/**
 * Returns aggregate stats for the dashboard header.
 */
export async function getDashboardStats(): Promise<{
  totalFills: number;
  totalChallenges: number;
  totalSlashes: number;
  totalSlashedUSDC: number;
}> {
  const db = await getDb();

  const [totalFills, totalChallenges, totalSlashes, slashAgg] =
    await Promise.all([
      db.collection(MONGO_COLLECTIONS.fills).countDocuments(),
      db.collection(MONGO_COLLECTIONS.challenges).countDocuments(),
      db.collection(MONGO_COLLECTIONS.slashes).countDocuments(),
      db
        .collection(MONGO_COLLECTIONS.slashes)
        .aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: { $toLong: "$slashAmount" } },
            },
          },
        ])
        .toArray(),
    ]);

  const totalSlashedUSDC =
    slashAgg.length > 0 ? Number(slashAgg[0].total) / 1e6 : 0;

  return { totalFills, totalChallenges, totalSlashes, totalSlashedUSDC };
}
