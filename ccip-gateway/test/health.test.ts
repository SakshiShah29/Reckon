import { describe, it, expect } from "vitest";
import { createApp } from "../src/server.js";
import http from "node:http";

function request(
  app: ReturnType<typeof createApp>,
  path: string
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") return reject(new Error("bad addr"));
      const url = `http://127.0.0.1:${addr.port}${path}`;
      http.get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          server.close();
          resolve({ status: res.statusCode!, body: JSON.parse(data) });
        });
      }).on("error", (err) => { server.close(); reject(err); });
    });
  });
}

describe("health endpoint", () => {
  it("returns 200 with status ok", async () => {
    const app = createApp();
    const res = await request(app, "/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
