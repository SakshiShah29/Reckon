import { MongoClient, type Db } from "mongodb";
import type { Hex } from "viem";

export interface SubnameRecord {
  label: string;
  namespace: "solvers" | "challengers";
  owner: `0x${string}`;
  textRecords: Record<string, string>;
}

export interface GatewayDb {
  lookupByNamehash(node: Hex): Promise<SubnameRecord | null>;
  close(): Promise<void>;
}

export async function createDb(uri: string): Promise<GatewayDb> {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db("reckon");
  const subnames = db.collection("subnames");
  const repUpdates = db.collection("reputation_updates");

  return {
    async lookupByNamehash(node: Hex): Promise<SubnameRecord | null> {
      const doc = await subnames.findOne({ namehash: node });
      if (!doc) return null;

      const textRecords: Record<string, string> = doc.textRecords ?? {};

      const rep = await repUpdates.findOne(
        { solverNamehash: node },
        { sort: { updatedAt: -1 } }
      );
      if (rep) {
        if (rep.reputationScore != null)
          textRecords["reckon.reputation"] = String(rep.reputationScore);
        if (rep.totalFills != null)
          textRecords["reckon.totalFills"] = String(rep.totalFills);
        if (rep.slashCount != null)
          textRecords["reckon.slashCount"] = String(rep.slashCount);
        if (rep.lastSlashTimestamp != null)
          textRecords["reckon.lastSlash"] = String(rep.lastSlashTimestamp);
      }

      return {
        label: doc.label,
        namespace: doc.namespace,
        owner: doc.owner,
        textRecords,
      };
    },

    async close() {
      await client.close();
    },
  };
}

export function createMockDb(
  records: Map<Hex, SubnameRecord>
): GatewayDb {
  return {
    async lookupByNamehash(node: Hex) {
      return records.get(node) ?? null;
    },
    async close() {},
  };
}
