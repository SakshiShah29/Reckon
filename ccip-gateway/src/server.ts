import express from "express";
import type { Address, Hex } from "viem";
import { createCcipRouter, type CcipRouteConfig } from "./routes/ccip.js";
import { createTestRouter } from "./routes/test.js";
import type { GatewayDb } from "./db.js";

export interface AppDeps {
  resolverAddress?: Address;
  chainId: number;
  signerKey: Hex;
  db: GatewayDb;
}

export function createApp(deps?: Partial<AppDeps>) {
  const app = express();

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      mode: deps?.resolverAddress ? "strict" : "permissive",
      resolverAddress: deps?.resolverAddress ?? null,
      chainId: deps?.chainId ?? null,
      db: deps?.db ? "connected" : "none",
    });
  });

  if (deps?.db) {
    app.use(createTestRouter({ db: deps.db }));
  }

  if (deps?.db && deps.signerKey) {
    const ccipRouter = createCcipRouter({
      db: deps.db,
      resolverAddress: deps.resolverAddress,
      chainId: deps.chainId ?? 1,
      signerKey: deps.signerKey,
    });
    app.use(ccipRouter);
  }

  return app;
}
