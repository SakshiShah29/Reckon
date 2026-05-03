import { NextRequest, NextResponse } from "next/server";

const RELAYER_URL = process.env.RELAYER_URL || "http://localhost:10000";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { label, address, role } = body;

    if (!label || !address || !role) {
      return NextResponse.json(
        { error: "Missing required fields: label, address, role" },
        { status: 400 },
      );
    }

    const res = await fetch(`${RELAYER_URL}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, address, role }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: data.error || "Registration failed" },
        { status: res.status },
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Relayer unreachable: ${message}` },
      { status: 502 },
    );
  }
}
