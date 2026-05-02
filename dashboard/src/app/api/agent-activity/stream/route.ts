export const dynamic = "force-dynamic";

/**
 * SSE endpoint for live agent log streaming.
 *
 * GET /api/agent-activity/stream
 *
 * The POST handler in the parent route calls subscribers when new lines arrive.
 * We import from the parent module to share the same in-memory store.
 */

// We can't directly import the subscriber set from the parent route in Next.js
// (each route is a separate module boundary), so we use a shared module instead.
// For now, the frontend polls GET /api/agent-activity?after=<lastId> every 2-3s
// which achieves near-real-time with minimal complexity.

// This route is a placeholder — the frontend uses polling for simplicity.
export async function GET() {
  return new Response(
    JSON.stringify({ info: "Use GET /api/agent-activity?after=<lastId> for polling" }),
    { headers: { "Content-Type": "application/json" } },
  );
}
