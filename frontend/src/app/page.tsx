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
  getPoolStats,
  getUserWithdrawals,
  buildStakeDeploy,
  buildUnstakeDeploy,
  buildClaimDeploy,
  formatDeploy,
  submitDeploy,
  csprToMotes,
  motesToCspr,
  calculateThcsprFromCspr,
  calculateCsprFromThcspr,
  parsePublicKey,
  PoolStats,
  WithdrawalRequest,
  THAW_CORE_HASH,
  EXCHANGE_RATE_PRECISION,
} from "@/lib/casper";
import { Coins, ArrowDownUp, Clock, CheckCircle } from "lucide-react";

type Tab = "stake" | "unstake" | "claim";

export default function Home() {
  const { wallet, sign, refreshBalance, balance } = useCasperWallet();
  const { showToast, ToastComponent } = useTransactionToast();
  const [activeTab, setActiveTab] = useState<Tab>("stake");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [thcsprBalance, setThcsprBalance] = useState<bigint>(BigInt(0));

  const fetchData = useCallback(async () => {
    try {
      const stats = await getPoolStats();
      setPoolStats(stats);

      if (wallet.accountHash) {
        const userWithdrawals = await getUserWithdrawals(wallet.accountHash);
        setWithdrawals(userWithdrawals.filter((w) => !w.claimed));
        // Mock thCSPR balance - in production, fetch from token contract
        setThcsprBalance(BigInt("5000000000000")); // 5000 thCSPR
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

  const handleStake = async () => {
    if (!wallet.publicKey || !amount) return;

    setIsLoading(true);
    showToast("pending", "Preparing stake transaction...");

    try {
      const amountMotes = csprToMotes(amount);
      const publicKey = parsePublicKey(wallet.publicKey);
      const deploy = buildStakeDeploy(publicKey, amountMotes);
      const deployJson = JSON.stringify(formatDeploy(deploy));

      showToast("pending", "Please sign the transaction...");
      const signature = await sign(deployJson);

      showToast("pending", "Submitting transaction...");
      const deployHash = await submitDeploy(deploy, signature);

      showToast("success", "Stake submitted successfully!", { deployHash });
      setAmount("");
      await refreshBalance();
      await fetchData();
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Stake failed"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnstake = async () => {
    if (!wallet.publicKey || !amount) return;

    setIsLoading(true);
    showToast("pending", "Preparing unstake transaction...");

    try {
      const amountMotes = csprToMotes(amount);
      const publicKey = parsePublicKey(wallet.publicKey);
      const deploy = buildUnstakeDeploy(publicKey, amountMotes);
      const deployJson = JSON.stringify(formatDeploy(deploy));

      showToast("pending", "Please sign the transaction...");
      const signature = await sign(deployJson);

      showToast("pending", "Submitting transaction...");
      const deployHash = await submitDeploy(deploy, signature);

      showToast("success", "Unstake submitted!", { deployHash });
      setAmount("");
      await fetchData();
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Unstake failed"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClaim = async (withdrawalId: number) => {
    if (!wallet.publicKey) return;

    setIsLoading(true);
    showToast("pending", "Preparing claim transaction...");

    try {
      const publicKey = parsePublicKey(wallet.publicKey);
      const deploy = buildClaimDeploy(publicKey, withdrawalId);
      const deployJson = JSON.stringify(formatDeploy(deploy));

      showToast("pending", "Please sign the transaction...");
      const signature = await sign(deployJson);

      showToast("pending", "Submitting transaction...");
      const deployHash = await submitDeploy(deploy, signature);

      showToast("success", "Claim submitted!", { deployHash });
      await refreshBalance();
      await fetchData();
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Claim failed"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate exchange rates
  const exchangeRate = poolStats
    ? Number(poolStats.exchangeRate) / Number(EXCHANGE_RATE_PRECISION)
    : 1;

  const estimatedThcspr = amount && poolStats
    ? calculateThcsprFromCspr(
        csprToMotes(amount),
        poolStats.totalPooledCspr,
        poolStats.totalThcsprSupply
      )
    : BigInt(0);

  const estimatedCspr = amount && poolStats
    ? calculateCsprFromThcspr(
        csprToMotes(amount),
        poolStats.totalPooledCspr,
        poolStats.totalThcsprSupply
      )
    : BigInt(0);

  // Calculate APY (mock calculation - in production, calculate from actual rewards)
  const apy = "8.5%";

  const claimableWithdrawals = withdrawals.filter(
    (w) => w.claimableTimestamp <= Date.now()
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted">
      <Navigation />

      <div className="container py-8">
        {/* Stats Cards */}
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Coins className="h-4 w-4" />
                Total Value Locked
              </CardDescription>
              <CardTitle className="text-2xl">
                {poolStats
                  ? formatCspr(poolStats.totalPooledCspr)
                  : "..."}{" "}
                CSPR
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <ArrowDownUp className="h-4 w-4" />
                Exchange Rate
              </CardDescription>
              <CardTitle className="text-2xl">
                1 thCSPR = {exchangeRate.toFixed(4)} CSPR
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Staking APY</CardDescription>
              <CardTitle className="text-2xl text-green-500">{apy}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Main Action Card */}
        <div className="mx-auto max-w-md">
          <Card>
            <CardHeader>
              {/* Tabs */}
              <div className="flex gap-2">
                {(["stake", "unstake", "claim"] as Tab[]).map((tab) => (
                  <Button
                    key={tab}
                    variant={activeTab === tab ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActiveTab(tab)}
                    className="capitalize"
                  >
                    {tab}
                    {tab === "claim" && claimableWithdrawals.length > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary-foreground text-primary rounded-full">
                        {claimableWithdrawals.length}
                      </span>
                    )}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeTab === "stake" && (
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
                  <div className="rounded-lg bg-muted p-3 text-sm">
                    <div className="flex justify-between">
                      <span>You will receive</span>
                      <span>~ {formatCspr(estimatedThcspr)} thCSPR</span>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleStake}
                    disabled={
                      !wallet.isConnected ||
                      !amount ||
                      isLoading ||
                      !THAW_CORE_HASH
                    }
                  >
                    {!wallet.isConnected
                      ? "Connect Wallet"
                      : !THAW_CORE_HASH
                      ? "Contract Not Deployed"
                      : isLoading
                      ? "Processing..."
                      : "Stake CSPR"}
                  </Button>
                </>
              )}

              {activeTab === "unstake" && (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Amount</span>
                      <span className="text-muted-foreground">
                        Balance: {formatCspr(thcsprBalance)} thCSPR
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
                          setAmount(motesToCspr(thcsprBalance).toString())
                        }
                        disabled={isLoading}
                      >
                        Max
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-sm">
                    <div className="flex justify-between">
                      <span>You will receive</span>
                      <span>~ {formatCspr(estimatedCspr)} CSPR</span>
                    </div>
                    <div className="mt-1 flex justify-between text-muted-foreground">
                      <span>Unbonding period</span>
                      <span>~14 hours</span>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleUnstake}
                    disabled={
                      !wallet.isConnected ||
                      !amount ||
                      isLoading ||
                      !THAW_CORE_HASH
                    }
                  >
                    {!wallet.isConnected
                      ? "Connect Wallet"
                      : !THAW_CORE_HASH
                      ? "Contract Not Deployed"
                      : isLoading
                      ? "Processing..."
                      : "Unstake thCSPR"}
                  </Button>
                </>
              )}

              {activeTab === "claim" && (
                <div className="space-y-4">
                  {withdrawals.length > 0 ? (
                    withdrawals.map((withdrawal) => {
                      const isClaimable =
                        withdrawal.claimableTimestamp <= Date.now();
                      const remainingTime = Math.max(
                        0,
                        withdrawal.claimableTimestamp - Date.now()
                      );
                      const hours = Math.floor(remainingTime / 3600000);
                      const minutes = Math.floor(
                        (remainingTime % 3600000) / 60000
                      );

                      return (
                        <div
                          key={withdrawal.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted"
                        >
                          <div className="flex items-center gap-3">
                            {isClaimable ? (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            ) : (
                              <Clock className="h-5 w-5 text-yellow-500" />
                            )}
                            <div>
                              <p className="font-medium">
                                {formatCspr(withdrawal.csprAmount)} CSPR
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {isClaimable
                                  ? "Ready to claim"
                                  : `${hours}h ${minutes}m remaining`}
                              </p>
                            </div>
                          </div>
                          <Button
                            size="sm"
                            disabled={!isClaimable || isLoading || !THAW_CORE_HASH}
                            onClick={() => handleClaim(withdrawal.id)}
                          >
                            {isLoading ? "..." : "Claim"}
                          </Button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-8 text-center text-muted-foreground">
                      <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No pending withdrawals</p>
                      <p className="mt-2 text-sm">
                        Unstake thCSPR to create a withdrawal request
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Info Section */}
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Liquid Staking</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Stake your CSPR and receive thCSPR, a liquid token that
                represents your staked position. Use thCSPR across DeFi while
                earning staking rewards.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Auto-Compounding</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Staking rewards are automatically compounded, increasing the
                value of thCSPR over time. No manual claiming required.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">DeFi Ready</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Use thCSPR as collateral to borrow CSPR, or leverage your
                position up to 4x for amplified staking rewards.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {ToastComponent}
    </main>
  );
}
