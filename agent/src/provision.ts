/**
 * 0G Compute sub-account provisioning.
 *
 * Per spec FR-9 and 0G Implementation Guide §3.5:
 * - Per-provider concurrency is effectively 1 (serial)
 * - Reckon provisions 3 inference sub-accounts (one per AXL node)
 * - Each node's brain blob carries its own provider sub-account address
 *
 * This module handles:
 * 1. Depositing funds into the main account
 * 2. Transferring funds to provider inference sub-accounts
 * 3. Acknowledging provider signers
 */

export interface ProvisionConfig {
  /** 0G Galileo RPC URL */
  rpcUrl: string;
  /** Agent wallet private key */
  privateKey: string;
  /** Provider addresses to provision sub-accounts for (one per AXL node) */
  providerAddresses: string[];
  /** Amount of 0G to deposit to main account (total, not per-provider) */
  depositAmount: number;
  /** Amount of 0G to transfer to each provider inference sub-account */
  perProviderAmount: number;
}

/**
 * Provisions 0G Compute sub-accounts for parallel inference.
 *
 * Call once per agent during initial setup (Phase 0 / first boot).
 * Idempotent: safe to re-run if a provider is already funded.
 *
 * Flow (from 0G Implementation Guide §3.3):
 * 1. broker.ledger.depositFund(totalAmount)
 * 2. For each provider: broker.ledger.transferFund(provider, "inference", amount)
 * 3. For each provider: broker.inference.acknowledgeProviderSigner(provider)
 */
export async function provisionComputeSubAccounts(
  config: ProvisionConfig,
): Promise<void> {
  const { ethers } = await import("ethers");
  const { createZGComputeNetworkBroker } = await import(
    "@0glabs/0g-serving-broker"
  );

  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const wallet = new ethers.Wallet(config.privateKey, provider);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CJS/ESM ethers type mismatch
  const broker = await createZGComputeNetworkBroker(wallet as any);

  // 1. Deposit funds into main account
  console.log(`[provision] Depositing ${config.depositAmount} 0G to main account...`);
  try {
    await broker.ledger.depositFund(config.depositAmount);
    console.log("[provision] Deposit successful");
  } catch (err) {
    console.warn("[provision] Deposit may have already been made:", err);
  }

  // 2 & 3. Fund and acknowledge each provider sub-account
  for (const providerAddr of config.providerAddresses) {
    console.log(`[provision] Setting up provider ${providerAddr}...`);

    try {
      const amount = ethers.parseEther(String(config.perProviderAmount));
      await broker.ledger.transferFund(providerAddr, "inference", amount);
      console.log(`[provision]   Transferred ${config.perProviderAmount} 0G to inference sub-account`);
    } catch (err) {
      console.warn(`[provision]   Transfer may have already been made: ${err}`);
    }

    try {
      await broker.inference.acknowledgeProviderSigner(providerAddr);
      console.log("[provision]   Provider signer acknowledged");
    } catch (err) {
      console.warn(`[provision]   Acknowledgement may already exist: ${err}`);
    }
  }

  console.log(`[provision] Done. ${config.providerAddresses.length} provider sub-accounts ready.`);
}

/**
 * Discovers 0G Compute providers serving a given model.
 * Uses createReadOnlyInferenceBroker — no wallet needed.
 */
export async function discoverProviders(
  rpcUrl: string,
  modelFilter: string = "Qwen3-32B",
): Promise<{ provider: string; model: string; endpoint: string }[]> {
  const { createReadOnlyInferenceBroker } = await import(
    "@0glabs/0g-serving-broker"
  );

  const readBroker = await createReadOnlyInferenceBroker(rpcUrl);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const services: any[] = await readBroker.listService();

  return services
    .filter(
      (s: { serviceType: string; model: string }) =>
        s.serviceType === "chatbot" && s.model.includes(modelFilter),
    )
    .map((s: { provider: string; model: string; endpoint: string }) => ({
      provider: s.provider,
      model: s.model,
      endpoint: s.endpoint,
    }));
}

/**
 * CLI entrypoint for provisioning. Run with:
 *   node --import tsx agent/src/provision.ts
 */
async function main() {
  const { config: dotenvConfig } = await import("dotenv");
  dotenvConfig();

  const required = (key: string): string => {
    const val = process.env[key];
    if (!val) throw new Error(`Missing env var: ${key}`);
    return val;
  };

  // Support 1-3 provider addresses
  const providerAddresses: string[] = [];
  for (const key of ["ZG_COMPUTE_PROVIDER_1", "ZG_COMPUTE_PROVIDER_2", "ZG_COMPUTE_PROVIDER_3"]) {
    const val = process.env[key];
    if (val) providerAddresses.push(val);
  }
  // Fallback to single provider if multi-provider env vars not set
  if (providerAddresses.length === 0) {
    providerAddresses.push(required("ZG_COMPUTE_PROVIDER_ADDRESS"));
  }

  await provisionComputeSubAccounts({
    rpcUrl: required("ZG_RPC_URL"),
    privateKey: required("ZG_AGENT_PRIVATE_KEY"),
    providerAddresses,
    depositAmount: 10, // 10 0G total
    perProviderAmount: 3, // 3 0G per provider (leaves 1 0G buffer)
  });
}

// Run if executed directly
const isMainModule = process.argv[1]?.endsWith("provision.ts") || process.argv[1]?.endsWith("provision.js");
if (isMainModule) {
  main().catch((err) => {
    console.error("[provision] Fatal:", err);
    process.exit(1);
  });
}
