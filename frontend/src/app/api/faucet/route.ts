import { NextRequest, NextResponse } from "next/server";

const FAUCET_URL = "http://localhost:3016";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${FAUCET_URL}/drip`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        publicKey: body.publicKey,
        amount: body.amount || 1000,
      }),
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Faucet proxy error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to drip from faucet" },
      { status: 500 }
    );
  }
}
