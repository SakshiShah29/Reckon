import { Router, type Request, type Response } from "express";
import type { GatewayDb } from "../db.js";
import { computeNamehash } from "../utils/ens.js";

export interface TestRouteConfig {
  db: GatewayDb;
}

export function createTestRouter(config: TestRouteConfig): Router {
  const router = Router();

  router.get("/test/:name", async (req: Request, res: Response) => {
    try {
      const { name } = req.params;

      const parts = name.split(".");
      if (parts.length < 3 || !["solvers", "challengers"].includes(parts[1])) {
        res.status(400).json({
          error: "expected format: label.solvers.reckon.eth or label.challengers.reckon.eth",
        });
        return;
      }

      const label = parts[0];
      const namespace = parts[1] as "solvers" | "challengers";
      const node = computeNamehash(label, namespace);

      const record = await config.db.lookupByNamehash(node);

      if (!record) {
        res.json({ found: false, name, namehash: node });
        return;
      }

      res.json({
        found: true,
        name,
        namehash: node,
        label: record.label,
        namespace: record.namespace,
        owner: record.owner,
        textRecords: record.textRecords,
      });
    } catch (err) {
      console.error("Test route error:", err);
      res.status(500).json({ error: "lookup failed" });
    }
  });

  return router;
}
