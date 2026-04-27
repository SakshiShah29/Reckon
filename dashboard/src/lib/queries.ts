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
 */
export async function getRecentSlashes(limit = 50): Promise<SlashDocRecord[]> {
  const db = await getDb();
  return db
    .collection<SlashDocRecord>(MONGO_COLLECTIONS.slashes)
    .find({})
    .sort({ timestamp: -1 })
    .limit(limit)
    .toArray();
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
    .findOne({ solverNamehash: namehash });
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
    .find({ fillerNamehash })
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
