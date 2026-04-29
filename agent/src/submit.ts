export interface SubmitResult {
  success: boolean;
  runId?: string;
  error?: string;
}

export async function submitChallengeViaKeeperHub(
  orderHash: `0x${string}`,
  agentTokenId: string,
  khApiKey: string,
  webhookUrl: string,
): Promise<SubmitResult> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${khApiKey}`,
      },
      body: JSON.stringify({
        orderHash,
        agentTokenId,
        timestamp: Math.floor(Date.now() / 1000),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        success: false,
        error: `KeeperHub returned ${response.status}: ${text}`,
      };
    }

    const data = (await response.json()) as { runId?: string };
    return { success: true, runId: data.runId };
  } catch (err) {
    return {
      success: false,
      error: `KeeperHub webhook failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
