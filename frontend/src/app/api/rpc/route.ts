import { NextRequest, NextResponse } from "next/server";

const CASPER_RPC_URLS = {
  localnet: "http://localhost:11101/rpc",
  testnet: "https://node.testnet.casper.network/rpc",
  mainnet: "https://node.mainnet.casper.network/rpc",
} as const;

type CasperNetwork = keyof typeof CASPER_RPC_URLS;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const network = (request.headers.get("x-casper-network") || "testnet") as CasperNetwork;

    const rpcUrl = CASPER_RPC_URLS[network] || CASPER_RPC_URLS.testnet;

    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error) {
    console.error("RPC proxy error:", error);
    return NextResponse.json(
      { error: "Failed to proxy RPC request" },
      { status: 500 }
    );
  }
}
