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
 */
export async function getRecentChallenges(limit = 50): Promise<ChallengeRecord[]> {
  const db = await getDb();
  return db
    .collection<ChallengeRecord>(MONGO_COLLECTIONS.challenges)
    .find({})
    .sort({ challengeBlock: -1 })
    .limit(limit)
    .toArray();
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

  // Collect namehashes that need ENS resolution
  const needsResolve = slashes.filter(
    (s) => s.solverNamehash && !s.solverEnsName,
  );
  if (needsResolve.length > 0) {
    const hashes = [...new Set(needsResolve.map((s) => s.solverNamehash))];
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
    for (const slash of slashes) {
      if (!slash.solverEnsName && lookup.has(slash.solverNamehash)) {
        const info = lookup.get(slash.solverNamehash)!;
        slash.solverEnsName = info.ensName;
        slash.solverAddress = info.address;
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

  // Look up subname by owner address (case-insensitive)
  const subname = await db.collection("subnames").findOne({
    $or: [
      { owner: address },
      { owner: addrLower },
      { owner: address.toLowerCase() },
    ],
  });

  if (!subname) return null;

  const ensName = `${subname.label}.${subname.namespace}.reckonprotocol.eth`;
  const namehash = subname.namehash as string;

  // Get reputation data
  const rep = await db
    .collection<ReputationUpdate>(MONGO_COLLECTIONS.reputationUpdates)
    .findOne({ solverNamehash: namehash as `0x${string}` });

  // Try to get bond amount from solver registration
  const registration = await db.collection("registrations").findOne({
    $or: [
      { solverAddress: address },
      { solverAddress: addrLower },
    ],
  });

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
