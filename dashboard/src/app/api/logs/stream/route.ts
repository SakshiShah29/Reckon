import { subscribe } from "@/lib/log-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const unsubscribe = subscribe((entry) => {
        const data = JSON.stringify(entry);
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));
      });

      // Send keepalive every 30s
      const keepalive = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 30000);

      // Cleanup on close
      const cleanup = () => {
        unsubscribe();
        clearInterval(keepalive);
      };

      // Store cleanup reference for cancel handler
      (controller as unknown as { _cleanup: () => void })._cleanup = cleanup;
    },
    cancel(controller) {
      const ctrl = controller as unknown as { _cleanup?: () => void };
      ctrl._cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
