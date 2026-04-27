import "dotenv/config";
import { createApp } from "./server.js";
import { createDb } from "./db.js";
import type { Address, Hex } from "viem";

async function main() {
  const port = parseInt(process.env.PORT || "3000", 10);
  const mongoUri = process.env.MONGODB_URI_RO;

  if (!mongoUri) {
    console.error("MONGODB_URI_RO is required");
    process.exit(1);
  }

  const db = await createDb(mongoUri);

  const app = createApp({
    resolverAddress: process.env.RESOLVER_ADDRESS as Address,
    chainId: parseInt(process.env.CHAIN_ID || "1", 10),
    signerKey: process.env.SIGNER_PRIVATE_KEY as Hex,
    db,
  });

  app.listen(port, () => {
    console.log(`CCIP-Read gateway listening on port ${port}`);
  });

  process.on("SIGTERM", async () => {
    await db.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
