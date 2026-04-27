import { Router, type Request, type Response } from "express";
import {
  type Hex,
  type Address,
  encodeAbiParameters,
  isHex,
  pad,
  zeroAddress,
  getAddress,
} from "viem";
import { decodeCcipRequest } from "../utils/ens.js";
import { signResponse, encodeGatewayResponse } from "../signer.js";
import type { GatewayDb } from "../db.js";

export interface CcipRouteConfig {
  db: GatewayDb;
  resolverAddress?: Address;
  chainId: number;
  signerKey: Hex;
}

export function createCcipRouter(config: CcipRouteConfig): Router {
  const router = Router();

  router.get("/:sender/:data.json", async (req: Request, res: Response) => {
    try {
      const { sender, data } = req.params;

      if (
        config.resolverAddress &&
        sender.toLowerCase() !== config.resolverAddress.toLowerCase()
      ) {
        res.status(400).json({ error: "sender mismatch" });
        return;
      }

      const callData = (data.startsWith("0x") ? data : `0x${data}`) as Hex;
      if (!isHex(callData)) {
        res.status(400).json({ error: "invalid hex data" });
        return;
      }

      let decoded;
      try {
        decoded = decodeCcipRequest(callData);
      } catch {
        res.status(400).json({ error: "malformed calldata" });
        return;
      }

      let result: Hex;

      if (decoded.type === "text") {
        const record = await config.db.lookupByNamehash(decoded.node);
        const value = record?.textRecords[decoded.key] ?? "";
        result = encodeAbiParameters([{ type: "string" }], [value]);
      } else if (decoded.type === "addr") {
        const record = await config.db.lookupByNamehash(decoded.node);
        const owner = record?.owner ? getAddress(record.owner) : zeroAddress;
        result = encodeAbiParameters([{ type: "address" }], [owner]);
      } else if (decoded.type === "addr-coin") {
        const record = await config.db.lookupByNamehash(decoded.node);
        if (decoded.coinType === 60n && record?.owner) {
          result = encodeAbiParameters(
            [{ type: "address" }],
            [getAddress(record.owner)]
          );
        } else {
          result = encodeAbiParameters(
            [{ type: "address" }],
            [zeroAddress]
          );
        }
      } else {
        result = encodeAbiParameters([{ type: "string" }], [""]);
      }

      const extraData = encodeAbiParameters(
        [{ type: "bytes" }],
        [callData]
      );

      const expires = BigInt(Math.floor(Date.now() / 1000) + 300);

      const resolverAddr = (config.resolverAddress ?? sender) as Address;

      const sig = await signResponse({
        result,
        expires,
        extraData,
        resolverAddress: resolverAddr,
        chainId: config.chainId,
        signerKey: config.signerKey,
      });

      const responseData = encodeGatewayResponse(result, expires, sig);

      res.json({ data: responseData });
    } catch (err) {
      console.error("CCIP handler error:", err);
      res.status(500).json({ error: "internal error" });
    }
  });

  return router;
}
