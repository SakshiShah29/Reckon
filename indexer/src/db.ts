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

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(MONGO_DB_NAME);

  // Ensure indexes for the collections we write to
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
    await client.close();
    client = null;
    db = null;
  }
}
