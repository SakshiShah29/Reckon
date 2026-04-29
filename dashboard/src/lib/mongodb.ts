import { MongoClient, type Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI_RO ?? process.env.MONGODB_URI;

const DB_NAME = "reckon";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

/**
 * Returns a cached MongoDB connection using read-only credentials.
 * Connection is reused across requests in the same process (Next.js serverless functions).
 */
export async function getDb(): Promise<Db> {
  if (cachedDb) return cachedDb;
  if (!MONGODB_URI) throw new Error("MONGODB_URI_RO environment variable is not set");

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  cachedClient = client;
  cachedDb = client.db(DB_NAME);

  return cachedDb;
}

export async function getClient(): Promise<MongoClient> {
  if (cachedClient) return cachedClient;
  await getDb();
  return cachedClient!;
}
