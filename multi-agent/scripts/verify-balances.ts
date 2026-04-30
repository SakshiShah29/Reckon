import { createPublicClient, http, formatEther, formatUnits } from "viem";
import { base } from "viem/chains";

async function main() {
  const client = createPublicClient({
    chain: base,
    transport: http("http://147.182.164.208:8545"),
  });

  const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
  const agents = [
    { name: "Agent 2", addr: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as const },
    { name: "Agent 3", addr: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" as const },
  ];

  for (const a of agents) {
    const ethBal = await client.getBalance({ address: a.addr });
    const usdcBal = await client.readContract({
      address: USDC,
      abi: [{ inputs: [{ name: "account", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" }],
      functionName: "balanceOf",
      args: [a.addr],
    });
    console.log(`${a.name} (${a.addr}): ${formatEther(ethBal)} ETH, ${formatUnits(usdcBal, 6)} USDC`);
  }
}
main();
