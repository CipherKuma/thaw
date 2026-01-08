import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCspr(motes: bigint): string {
  const cspr = Number(motes) / 1_000_000_000;
  return cspr.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

export function parseCsprToMotes(cspr: string): bigint {
  const amount = parseFloat(cspr);
  return BigInt(Math.floor(amount * 1_000_000_000));
}

export function formatExchangeRate(rate: bigint): string {
  const rateNum = Number(rate) / 1e18;
  return rateNum.toFixed(6);
}

export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}
