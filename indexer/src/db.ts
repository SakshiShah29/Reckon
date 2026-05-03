import { MongoClient, type Db, type Collection } from "mongodb";
import {
  MONGO_DB_NAME,
  MONGO_COLLECTIONS,
} from "@reckon-protocol/types";
import type {
  FillRecord,
  OwnerAttestation,
  FillBatch,
} from "@reckon-protocol/types";
import { createLogger } from "./logger.js";

const log = createLogger("db");

let client: MongoClient | null = null;
let db: Db | null = null;

/**
 * Returns a cached MongoDB connection using the read-write URI.
 * The relayer needs write access (fills, attestations, batches).
 */
export async function getDb(): Promise<Db> {
  if (db) return db;

  const uri = process.env["MONGODB_URI_RW"];
  if (!uri) throw new Error("Missing MONGODB_URI_RW env var");

  const host = uri.replace(/\/\/.*@/, "//***@").split("?")[0]; // redact creds
  log.info("Connecting to MongoDB...", { host });

  const connectStart = Date.now();
  client = new MongoClient(uri);
  await client.connect();
  db = client.db(MONGO_DB_NAME);

  log.info(`Connected to MongoDB`, {
    database: MONGO_DB_NAME,
    connectTime: `${Date.now() - connectStart}ms`,
  });

  // Ensure indexes for the collections we write to
  log.info("Ensuring collection indexes...");
  await Promise.all([
    db
      .collection(MONGO_COLLECTIONS.fills)
      .createIndex({ orderHash: 1 }, { unique: true }),
    db
      .collection(MONGO_COLLECTIONS.fills)
      .createIndex({ fillBlock: -1 }),
    db
      .collection(MONGO_COLLECTIONS.ownerAttestations)
      .createIndex({ tokenId: 1 }, { unique: true }),
    db
      .collection(MONGO_COLLECTIONS.fillBatches)
      .createIndex({ rootHash: 1 }, { unique: true }),
  ]);
  log.info("Indexes ensured for: fills, owner_attestations, fill_batches");

  return db;
}

export function getFillsCollection(): Promise<Collection<FillRecord>> {
  return getDb().then((d) => d.collection<FillRecord>(MONGO_COLLECTIONS.fills));
}

export function getAttestationsCollection(): Promise<
  Collection<OwnerAttestation>
> {
  return getDb().then((d) =>
    d.collection<OwnerAttestation>(MONGO_COLLECTIONS.ownerAttestations),
  );
}

export function getBatchesCollection(): Promise<Collection<FillBatch>> {
  return getDb().then((d) =>
    d.collection<FillBatch>(MONGO_COLLECTIONS.fillBatches),
  );
}

export async function closeDb(): Promise<void> {
  if (client) {
    log.info("Closing MongoDB connection...");
    await client.close();
    client = null;
    db = null;
    log.info("MongoDB connection closed");
  }
}
