import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia } from "wagmi/chains";
import { http, type Chain } from "wagmi";

const ANVIL_RPC =
  process.env.NEXT_PUBLIC_ANVIL_RPC_URL || "http://147.182.164.208:8545";

const BASE_SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org";

/** Anvil fork of Base mainnet — same chain ID (8453), custom RPC */
export const anvilFork: Chain = {
  ...base,
  name: "Reckon (Base Fork)",
  rpcUrls: {
    default: { http: [ANVIL_RPC] },
  },
};

export const config = getDefaultConfig({
  appName: "Reckon Protocol",
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || "reckon-demo",
  chains: [anvilFork, baseSepolia],
  transports: {
    [anvilFork.id]: http(ANVIL_RPC),
    [baseSepolia.id]: http(BASE_SEPOLIA_RPC),
  },
  ssr: true,
});
