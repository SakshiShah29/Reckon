import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { keccak256, encodePacked, toHex, toBytes } from "viem";
import {
  CLAIM_STATE_STREAM_ID,
  ZG_FLOW_CONTRACT,
  AXL_BACKOFF_SECONDS,
  AXL_DEADLINE_SECONDS,
  AXL_KV_VERIFY_TIMEOUT_MS,
  AXL_POLL_INTERVAL_MS,
  AXL_SEND_TIMEOUT_MS,
} from "@reckon-protocol/types";

// @noble/ed25519 v2 requires sha512 to be set explicitly
ed.etc.sha512Sync = (...m: Uint8Array[]) => {
  const h = sha512.create();
  for (const msg of m) h.update(msg);
  return h.digest();
};

export interface CoordinateResult {
  claimAcquired: boolean;
  claimedBy: string;
  reason: string;
}

export interface CoordinateConfig {
  zgRpcUrl: string;
  zgIndexerUrl: string;
  zgPrivateKey: string;
  kvNodeUrl?: string;
  axlApiUrl?: string;
  axlPeerKeys?: string[];
  axlPrivateKeyHex?: string;
}

interface SignedClaimMessage {
  orderHash: string;
  agentTokenId: string;
  claimedAt: number;
  deadline: number;
  signerPublicKey: string;
  signature: string;
}

function claimDigest(
  orderHash: string,
  agentTokenId: string,
  claimedAt: number,
  deadline: number,
): Uint8Array {
  const packed = encodePacked(
    ["bytes32", "uint256", "uint64", "uint64"],
    [
      orderHash as `0x${string}`,
      BigInt(agentTokenId),
      BigInt(claimedAt),
      BigInt(deadline),
    ],
  );
  return toBytes(keccak256(packed));
}

function signClaim(
  orderHash: string,
  agentTokenId: string,
  claimedAt: number,
  deadline: number,
  privateKeyHex: string,
): SignedClaimMessage {
  const digest = claimDigest(orderHash, agentTokenId, claimedAt, deadline);
  const privKeyBytes = toBytes(`0x${privateKeyHex}` as `0x${string}`);
  const sig = ed.sign(digest, privKeyBytes);
  const pubKey = ed.getPublicKey(privKeyBytes);
  return {
    orderHash,
    agentTokenId,
    claimedAt,
    deadline,
    signerPublicKey: toHex(pubKey),
    signature: toHex(sig),
  };
}

function verifyClaim(msg: SignedClaimMessage): boolean {
  try {
    if (!msg.signerPublicKey || msg.signerPublicKey === "0x") return false;
    const digest = claimDigest(
      msg.orderHash,
      msg.agentTokenId,
      msg.claimedAt,
      msg.deadline,
    );
    const sigBytes = toBytes(msg.signature as `0x${string}`);
    const pubKeyBytes = toBytes(msg.signerPublicKey as `0x${string}`);
    return ed.verify(sigBytes, digest, pubKeyBytes);
  } catch {
    return false;
  }
}

interface AxlTransport {
  broadcastClaim(claim: SignedClaimMessage): Promise<void>;
  pollCompetingClaims(
    orderHash: string,
    ownClaimedAt: number,
    ownTokenId: string,
    durationMs: number,
  ): Promise<{ lostTo: string | null }>;
}

function createAxlTransport(
  apiUrl: string,
  peerKeys: string[],
): AxlTransport {
  return {
    async broadcastClaim(claim: SignedClaimMessage): Promise<void> {
      for (const peerKey of peerKeys) {
        try {
          await fetch(`${apiUrl}/send`, {
            method: "POST",
            headers: { "X-Destination-Peer-Id": peerKey },
            body: JSON.stringify(claim),
            signal: AbortSignal.timeout(AXL_SEND_TIMEOUT_MS),
          });
        } catch {
          // AXL send failure is non-fatal — KV is the durable layer
        }
      }
    },

    async pollCompetingClaims(
      orderHash: string,
      ownClaimedAt: number,
      ownTokenId: string,
      durationMs: number,
    ): Promise<{ lostTo: string | null }> {
      const deadline = Date.now() + durationMs;
      while (Date.now() < deadline) {
        try {
          const resp = await fetch(`${apiUrl}/recv`, {
            signal: AbortSignal.timeout(AXL_SEND_TIMEOUT_MS),
          });
          if (resp.status === 200) {
            const msg = (await resp.json()) as SignedClaimMessage;

            if (
              msg.orderHash === orderHash &&
              msg.agentTokenId !== ownTokenId
            ) {
              if (!verifyClaim(msg)) {
                console.warn(
                  `[coordinate] Rejected invalid signature from agent ${msg.agentTokenId}`,
                );
                continue;
              }

              if (
                msg.claimedAt < ownClaimedAt ||
                (msg.claimedAt === ownClaimedAt && msg.agentTokenId < ownTokenId)
              ) {
                return { lostTo: msg.agentTokenId };
              }
            }
          }
        } catch {
          // recv failure — continue polling
        }
        await sleep(AXL_POLL_INTERVAL_MS);
      }
      return { lostTo: null };
    },
  };
}

function createNoopTransport(): AxlTransport {
  return {
    async broadcastClaim(): Promise<void> {},
    async pollCompetingClaims(): Promise<{ lostTo: string | null }> {
      return { lostTo: null };
    },
  };
}

export async function coordinate(
  action: "acquire" | "check" | "release",
  orderHash: string,
  agentTokenId: string,
  config: CoordinateConfig,
): Promise<CoordinateResult> {
  const { ethers } = await import("ethers");
  const { Indexer, Batcher, getFlowContract, KvClient } = await import(
    "@0gfoundation/0g-ts-sdk"
  );

  const provider = new ethers.JsonRpcProvider(config.zgRpcUrl);
  const signer = new ethers.Wallet(config.zgPrivateKey, provider);
  const orderKey = ethers.keccak256(ethers.toUtf8Bytes(orderHash));
  const keyBytes = Uint8Array.from(
    Buffer.from(orderKey.slice(2), "hex"),
  );

  if (action === "check") {
    return checkClaim(config, keyBytes, KvClient);
  }

  if (action === "release") {
    return releaseClaim(config, keyBytes, signer, Indexer, Batcher, getFlowContract);
  }

  // action === "acquire"
  const transport =
    config.axlApiUrl && config.axlPeerKeys?.length
      ? createAxlTransport(config.axlApiUrl, config.axlPeerKeys)
      : createNoopTransport();

  const now = Math.floor(Date.now() / 1000);

  // Sign the claim with Ed25519 if we have the key
  let claim: SignedClaimMessage;
  if (config.axlPrivateKeyHex) {
    claim = signClaim(
      orderHash,
      agentTokenId,
      now,
      now + AXL_DEADLINE_SECONDS,
      config.axlPrivateKeyHex,
    );
  } else {
    claim = {
      orderHash,
      agentTokenId,
      claimedAt: now,
      deadline: now + AXL_DEADLINE_SECONDS,
      signerPublicKey: "0x",
      signature: "0x",
    };
  }

  // 1. Broadcast via AXL (fast, ephemeral)
  await transport.broadcastClaim(claim);

  // 2. Poll for competing claims during backoff window
  const { lostTo } = await transport.pollCompetingClaims(
    orderHash,
    now,
    agentTokenId,
    AXL_BACKOFF_SECONDS * 1000,
  );

  if (lostTo) {
    return {
      claimAcquired: false,
      claimedBy: lostTo,
      reason: "claim_yielded_axl",
    };
  }

  // 3. Verify KV doesn't already have a claim (durable truth)
  const kvCheck = await checkClaim(config, keyBytes, KvClient);
  if (kvCheck.claimedBy && kvCheck.claimedBy !== agentTokenId) {
    return {
      claimAcquired: false,
      claimedBy: kvCheck.claimedBy,
      reason: "kv_collision_yielded",
    };
  }

  // 4. Write claim to KV (slow, durable)
  try {
    const indexer = new Indexer(config.zgIndexerUrl);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [nodes, nodeErr] = await (indexer as any).selectNodes(1);
    if (nodeErr) throw nodeErr;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const flowContract = getFlowContract(ZG_FLOW_CONTRACT, signer as any);
    const batcher = new Batcher(1, nodes, flowContract, config.zgRpcUrl);

    const valBytes = encodeClaimValue(agentTokenId, now, claim.deadline);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (batcher as any).streamDataBuilder.set(
      CLAIM_STATE_STREAM_ID,
      keyBytes,
      valBytes,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [_result, err] = await (batcher as any).exec();
    if (err) throw err;

    // 5. Read-after-write: verify we won the KV race
    await sleep(1000);
    const verifyResult = await checkClaim(config, keyBytes, KvClient);
    if (verifyResult.claimedBy && verifyResult.claimedBy !== agentTokenId) {
      return {
        claimAcquired: false,
        claimedBy: verifyResult.claimedBy,
        reason: "kv_race_lost",
      };
    }

    return {
      claimAcquired: true,
      claimedBy: agentTokenId,
      reason: "claim_acquired",
    };
  } catch (err) {
    console.warn(
      `[coordinate] KV write failed, yielding: ${err instanceof Error ? err.message : err}`,
    );
    return {
      claimAcquired: false,
      claimedBy: "",
      reason: "kv_write_failed",
    };
  }
}

async function checkClaim(
  config: CoordinateConfig,
  keyBytes: Uint8Array,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  KvClient: any,
): Promise<CoordinateResult> {
  if (!config.kvNodeUrl) {
    return { claimAcquired: false, claimedBy: "", reason: "no_kv_node_url" };
  }

  try {
    const kvClient = new KvClient(config.kvNodeUrl);
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      AXL_KV_VERIFY_TIMEOUT_MS,
    );

    const keyBase64 = Buffer.from(keyBytes).toString("base64");
    const value = await kvClient.getValue(CLAIM_STATE_STREAM_ID, keyBase64);
    clearTimeout(timeout);

    if (!value || value.length === 0) {
      return { claimAcquired: false, claimedBy: "", reason: "unclaimed" };
    }

    const decoded = decodeClaimValue(value);
    const now = Math.floor(Date.now() / 1000);

    if (decoded.deadline < now) {
      return { claimAcquired: false, claimedBy: "", reason: "claim_expired" };
    }

    return {
      claimAcquired: true,
      claimedBy: decoded.agentTokenId,
      reason: "claimed",
    };
  } catch {
    return { claimAcquired: false, claimedBy: "", reason: "kv_read_failed" };
  }
}

async function releaseClaim(
  config: CoordinateConfig,
  keyBytes: Uint8Array,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signer: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Indexer: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Batcher: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getFlowContract: any,
): Promise<CoordinateResult> {
  try {
    const indexer = new Indexer(config.zgIndexerUrl);
    const [nodes, nodeErr] = await indexer.selectNodes(1);
    if (nodeErr) throw nodeErr;

    const flowContract = getFlowContract(ZG_FLOW_CONTRACT, signer);
    const batcher = new Batcher(1, nodes, flowContract, config.zgRpcUrl);

    const valBytes = new Uint8Array(96);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (batcher as any).streamDataBuilder.set(
      CLAIM_STATE_STREAM_ID,
      keyBytes,
      valBytes,
    );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [_result, err] = await (batcher as any).exec();
    if (err) throw err;

    return { claimAcquired: false, claimedBy: "", reason: "released" };
  } catch (err) {
    console.warn(
      `[coordinate] Release failed: ${err instanceof Error ? err.message : err}`,
    );
    return { claimAcquired: false, claimedBy: "", reason: "release_failed" };
  }
}

function encodeClaimValue(
  agentTokenId: string,
  claimedAt: number,
  deadline: number,
): Uint8Array {
  const buf = new Uint8Array(96);
  const view = new DataView(buf.buffer);
  const tokenIdBig = BigInt(agentTokenId);
  view.setBigUint64(24, tokenIdBig, false);
  view.setBigUint64(40, BigInt(claimedAt), false);
  view.setBigUint64(56, BigInt(deadline), false);
  return buf;
}

function decodeClaimValue(value: Uint8Array): {
  agentTokenId: string;
  claimedAt: number;
  deadline: number;
} {
  const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
  return {
    agentTokenId: view.getBigUint64(24, false).toString(),
    claimedAt: Number(view.getBigUint64(40, false)),
    deadline: Number(view.getBigUint64(56, false)),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
