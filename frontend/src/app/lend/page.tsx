"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCasperWallet } from "@/hooks/useCasperWallet";
import { Navigation } from "@/components/navigation";
import { useTransactionToast } from "@/components/transaction-toast";
import { formatCspr } from "@/lib/utils";
import {
  getLendingPoolStats,
  getUserPosition,
  buildLendingDepositDeploy,
  buildLendingWithdrawDeploy,
  formatDeploy,
  submitDeploy,
  csprToMotes,
  motesToCspr,
  parsePublicKey,
  LendingPoolStats,
  UserPosition,
  LENDING_POOL_HASH,
} from "@/lib/casper";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Percent } from "lucide-react";

type Tab = "deposit" | "withdraw";

export default function LendPage() {
  const { wallet, sign, refreshBalance, balance } = useCasperWallet();
  const { showToast, ToastComponent } = useTransactionToast();
  const [activeTab, setActiveTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [poolStats, setPoolStats] = useState<LendingPoolStats | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const stats = await getLendingPoolStats();
      setPoolStats(stats);

      if (wallet.accountHash) {
        const position = await getUserPosition(wallet.accountHash);
        setUserPosition(position);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    }
  }, [wallet.accountHash]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleDeposit = async () => {
    if (!wallet.publicKey || !amount) return;

    setIsLoading(true);
    showToast("pending", "Preparing deposit transaction...");

    try {
      const amountMotes = csprToMotes(amount);
      const publicKey = parsePublicKey(wallet.publicKey);
      const deploy = buildLendingDepositDeploy(publicKey, amountMotes);
      const deployJson = JSON.stringify(formatDeploy(deploy));

      showToast("pending", "Please sign the transaction...");
      const signature = await sign(deployJson);

      showToast("pending", "Submitting transaction...");
      const deployHash = await submitDeploy(deploy, signature);

      showToast("success", "Deposit submitted successfully!", { deployHash });
      setAmount("");
      await refreshBalance();
      await fetchData();
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Deposit failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!wallet.publicKey || !amount) return;

    setIsLoading(true);
    showToast("pending", "Preparing withdrawal transaction...");

    try {
      const amountMotes = csprToMotes(amount);
      const publicKey = parsePublicKey(wallet.publicKey);
      const deploy = buildLendingWithdrawDeploy(publicKey, amountMotes);
      const deployJson = JSON.stringify(formatDeploy(deploy));

      showToast("pending", "Please sign the transaction...");
      const signature = await sign(deployJson);

      showToast("pending", "Submitting transaction...");
      const deployHash = await submitDeploy(deploy, signature);

      showToast("success", "Withdrawal submitted successfully!", { deployHash });
      setAmount("");
      await refreshBalance();
      await fetchData();
    } catch (error) {
      showToast("error", error instanceof Error ? error.message : "Withdrawal failed");
    } finally {
      setIsLoading(false);
    }
  };

  const estimatedApy = poolStats
    ? poolStats.baseRate + (poolStats.utilizationRate * poolStats.baseRate) / 100
    : 0;

  const userDeposit = userPosition?.lenderDeposit || BigInt(0);

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted">
      <Navigation />

      <div className="container py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Lend CSPR</h1>
          <p className="text-muted-foreground">
            Deposit CSPR to earn yield from borrowers
          </p>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Total Deposits
              </CardDescription>
              <CardTitle className="text-2xl">
                {poolStats
                  ? formatCspr(poolStats.totalDeposits)
                  : "..."}{" "}
                CSPR
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <ArrowUpFromLine className="h-4 w-4" />
                Total Borrowed
              </CardDescription>
              <CardTitle className="text-2xl">
                {poolStats
                  ? formatCspr(poolStats.totalBorrowed)
                  : "..."}{" "}
                CSPR
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Percent className="h-4 w-4" />
                Utilization Rate
              </CardDescription>
              <CardTitle className="text-2xl">
                {poolStats ? `${poolStats.utilizationRate}%` : "..."}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Percent className="h-4 w-4" />
                Est. Supply APY
              </CardDescription>
              <CardTitle className="text-2xl text-green-500">
                {estimatedApy.toFixed(2)}%
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Main Action Card */}
        <div className="grid gap-8 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex gap-2">
                {(["deposit", "withdraw"] as Tab[]).map((tab) => (
                  <Button
                    key={tab}
                    variant={activeTab === tab ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActiveTab(tab)}
                    className="capitalize"
                  >
                    {tab === "deposit" ? (
                      <ArrowDownToLine className="h-4 w-4 mr-2" />
                    ) : (
                      <ArrowUpFromLine className="h-4 w-4 mr-2" />
                    )}
                    {tab}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeTab === "deposit" && (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Amount</span>
                      <span className="text-muted-foreground">
                        Balance: {balance || "0"} CSPR
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="0.0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={isLoading}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAmount(balance || "0")}
                        disabled={isLoading}
                      >
                        Max
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-sm space-y-2">
                    <div className="flex justify-between">
                      <span>Estimated APY</span>
                      <span className="text-green-500">
                        {estimatedApy.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Available Liquidity</span>
                      <span>
                        {poolStats
                          ? formatCspr(poolStats.availableLiquidity)
                          : "..."}{" "}
                        CSPR
                      </span>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleDeposit}
                    disabled={
                      !wallet.isConnected ||
                      !amount ||
                      isLoading ||
                      !LENDING_POOL_HASH
                    }
                  >
                    {!wallet.isConnected
                      ? "Connect Wallet"
                      : !LENDING_POOL_HASH
                      ? "Contract Not Deployed"
                      : isLoading
                      ? "Processing..."
                      : "Deposit CSPR"}
                  </Button>
                </>
              )}

              {activeTab === "withdraw" && (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Amount</span>
                      <span className="text-muted-foreground">
                        Deposited: {formatCspr(userDeposit)} CSPR
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        placeholder="0.0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        disabled={isLoading}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setAmount(motesToCspr(userDeposit).toString())
                        }
                        disabled={isLoading}
                      >
                        Max
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-sm space-y-2">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Available to Withdraw</span>
                      <span>
                        {poolStats
                          ? formatCspr(
                              userDeposit < poolStats.availableLiquidity
                                ? userDeposit
                                : poolStats.availableLiquidity
                            )
                          : "..."}{" "}
                        CSPR
                      </span>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleWithdraw}
                    disabled={
                      !wallet.isConnected ||
                      !amount ||
                      isLoading ||
                      !LENDING_POOL_HASH
                    }
                  >
                    {!wallet.isConnected
                      ? "Connect Wallet"
                      : !LENDING_POOL_HASH
                      ? "Contract Not Deployed"
                      : isLoading
                      ? "Processing..."
                      : "Withdraw CSPR"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Your Position Card */}
          <Card>
            <CardHeader>
              <CardTitle>Your Lending Position</CardTitle>
              <CardDescription>
                Track your deposits and earnings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4">
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                  <span className="text-muted-foreground">Total Deposited</span>
                  <span className="font-semibold">
                    {formatCspr(userDeposit)} CSPR
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                  <span className="text-muted-foreground">Current APY</span>
                  <span className="font-semibold text-green-500">
                    {estimatedApy.toFixed(2)}%
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                  <span className="text-muted-foreground">Share of Pool</span>
                  <span className="font-semibold">
                    {poolStats && poolStats.totalDeposits > 0
                      ? (
                          (Number(userDeposit) /
                            Number(poolStats.totalDeposits)) *
                          100
                        ).toFixed(2)
                      : "0.00"}
                    %
                  </span>
                </div>
              </div>

              {userDeposit === BigInt(0) && wallet.isConnected && (
                <p className="text-center text-muted-foreground text-sm py-4">
                  You have no active deposits. Deposit CSPR to start earning
                  yield.
                </p>
              )}

              {!wallet.isConnected && (
                <p className="text-center text-muted-foreground text-sm py-4">
                  Connect your wallet to view your position
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Info Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>How Lending Works</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <h3 className="font-semibold">1. Deposit CSPR</h3>
                <p className="text-sm text-muted-foreground">
                  Deposit your CSPR into the lending pool to make it available
                  for borrowers.
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">2. Earn Interest</h3>
                <p className="text-sm text-muted-foreground">
                  Borrowers pay interest on their loans, which is distributed to
                  lenders based on their share of the pool.
                </p>
              </div>
              <div className="space-y-2">
                <h3 className="font-semibold">3. Withdraw Anytime</h3>
                <p className="text-sm text-muted-foreground">
                  Withdraw your deposits plus earned interest at any time,
                  subject to available liquidity.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {ToastComponent}
    </main>
  );
}
