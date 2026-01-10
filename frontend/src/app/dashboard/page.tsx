"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCasperWallet } from "@/hooks/useCasperWallet";
import { Navigation } from "@/components/navigation";
import { HealthFactor } from "@/components/health-factor";
import { useTransactionToast } from "@/components/transaction-toast";
import { formatCspr, shortenAddress } from "@/lib/utils";
import {
  getPoolStats,
  getLendingPoolStats,
  getUserPosition,
  getUserWithdrawals,
  buildClaimDeploy,
  buildCompoundDeploy,
  formatDeploy,
  submitDeploy,
  parsePublicKey,
  PoolStats,
  LendingPoolStats,
  UserPosition,
  WithdrawalRequest,
  THAW_CORE_HASH,
  EXCHANGE_RATE_PRECISION,
} from "@/lib/casper";
import { cn } from "@/lib/utils";
import {
  Wallet,
  Coins,
  TrendingUp,
  Clock,
  ArrowRight,
  RefreshCw,
  CheckCircle,
  AlertCircle,
} from "lucide-react";

export default function DashboardPage() {
  const { wallet, sign, refreshBalance, balance } = useCasperWallet();
  const { showToast, ToastComponent } = useTransactionToast();
  const [isLoading, setIsLoading] = useState(false);
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [lendingStats, setLendingStats] = useState<LendingPoolStats | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [thcsprBalance, setThcsprBalance] = useState<bigint>(BigInt(0));

  const fetchData = useCallback(async () => {
    try {
      const [staking, lending] = await Promise.all([
        getPoolStats(),
        getLendingPoolStats(),
      ]);
      setPoolStats(staking);
      setLendingStats(lending);

      if (wallet.accountHash) {
        const [position, userWithdrawals] = await Promise.all([
          getUserPosition(wallet.accountHash),
          getUserWithdrawals(wallet.accountHash),
        ]);
        setUserPosition(position);
        setWithdrawals(userWithdrawals);
        // Mock thCSPR balance
        setThcsprBalance(BigInt("5000000000000"));
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

      showToast("success", "Claim submitted successfully!", { deployHash });
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

  const handleCompound = async () => {
    if (!wallet.publicKey) return;

    setIsLoading(true);
    showToast("pending", "Preparing compound transaction...");

    try {
      const publicKey = parsePublicKey(wallet.publicKey);
      const deploy = buildCompoundDeploy(publicKey);
      const deployJson = JSON.stringify(formatDeploy(deploy));

      showToast("pending", "Please sign the transaction...");
      const signature = await sign(deployJson);

      showToast("pending", "Submitting transaction...");
      const deployHash = await submitDeploy(deploy, signature);

      showToast("success", "Rewards compounded!", { deployHash });
      await fetchData();
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Compound failed"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const exchangeRate = poolStats
    ? Number(poolStats.exchangeRate) / Number(EXCHANGE_RATE_PRECISION)
    : 1;

  const thcsprValue =
    (Number(thcsprBalance) / 1e9) * exchangeRate;

  const totalValue =
    parseFloat(balance || "0") +
    thcsprValue +
    Number(userPosition?.lenderDeposit || 0) / 1e9;

  const pendingWithdrawals = withdrawals.filter((w) => !w.claimed);
  const claimableWithdrawals = pendingWithdrawals.filter(
    (w) => w.claimableTimestamp <= Date.now()
  );

  if (!wallet.isConnected) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-background to-muted">
        <Navigation />
        <div className="container py-16">
          <Card className="max-w-md mx-auto">
            <CardContent className="py-12 text-center">
              <Wallet className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-semibold mb-2">Connect Your Wallet</h2>
              <p className="text-muted-foreground mb-6">
                Connect your wallet to view your dashboard and manage your
                positions
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted">
      <Navigation />

      <div className="container py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
            <p className="text-muted-foreground">
              {shortenAddress(wallet.publicKey || "", 8)}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => fetchData()}
            disabled={isLoading}
          >
            <RefreshCw
              className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")}
            />
            Refresh
          </Button>
        </div>

        {/* Portfolio Overview */}
        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <CardDescription>Total Portfolio Value</CardDescription>
              <CardTitle className="text-3xl">
                {totalValue.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                CSPR
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                CSPR Balance
              </CardDescription>
              <CardTitle className="text-2xl">
                {balance || "0"} CSPR
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Coins className="h-4 w-4" />
                thCSPR Balance
              </CardDescription>
              <CardTitle className="text-2xl">
                {formatCspr(thcsprBalance)} thCSPR
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Staking Position */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Coins className="h-5 w-5" />
                  Staking Position
                </CardTitle>
                <Link href="/">
                  <Button variant="ghost" size="sm">
                    Manage <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                  <span className="text-muted-foreground">Staked thCSPR</span>
                  <span className="font-semibold">
                    {formatCspr(thcsprBalance)} thCSPR
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                  <span className="text-muted-foreground">Current Value</span>
                  <span className="font-semibold">
                    ~{thcsprValue.toFixed(2)} CSPR
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                  <span className="text-muted-foreground">Exchange Rate</span>
                  <span className="font-semibold">
                    1 thCSPR = {exchangeRate.toFixed(4)} CSPR
                  </span>
                </div>
              </div>

              {THAW_CORE_HASH && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleCompound}
                  disabled={isLoading}
                >
                  <RefreshCw
                    className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")}
                  />
                  Compound Rewards
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Lending Position */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Lending Position
                </CardTitle>
                <Link href="/lend">
                  <Button variant="ghost" size="sm">
                    Manage <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                  <span className="text-muted-foreground">Deposited</span>
                  <span className="font-semibold">
                    {formatCspr(userPosition?.lenderDeposit || BigInt(0))} CSPR
                  </span>
                </div>
                <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                  <span className="text-muted-foreground">Current APY</span>
                  <span className="font-semibold text-green-500">
                    {lendingStats
                      ? (
                          lendingStats.baseRate +
                          (lendingStats.utilizationRate * lendingStats.baseRate) /
                            100
                        ).toFixed(2)
                      : "..."}
                    %
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Borrow Position */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5" />
                  Borrow Position
                </CardTitle>
                <Link href="/borrow">
                  <Button variant="ghost" size="sm">
                    Manage <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {userPosition &&
              (userPosition.collateral > 0 || userPosition.borrowed > 0) ? (
                <>
                  <HealthFactor healthFactor={userPosition.healthFactor} />
                  <div className="grid gap-3">
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                      <span className="text-muted-foreground">Collateral</span>
                      <span className="font-semibold">
                        {formatCspr(userPosition.collateral)} thCSPR
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                      <span className="text-muted-foreground">Borrowed</span>
                      <span className="font-semibold">
                        {formatCspr(userPosition.borrowed)} CSPR
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                      <span className="text-muted-foreground">
                        Available to Borrow
                      </span>
                      <span className="font-semibold">
                        {formatCspr(userPosition.maxBorrow)} CSPR
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-center text-muted-foreground py-4">
                  No active borrow position
                </p>
              )}
            </CardContent>
          </Card>

          {/* Pending Withdrawals */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Pending Withdrawals
              </CardTitle>
              <CardDescription>
                {pendingWithdrawals.length} pending,{" "}
                {claimableWithdrawals.length} claimable
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingWithdrawals.length > 0 ? (
                <div className="space-y-3">
                  {pendingWithdrawals.map((withdrawal) => {
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
                          disabled={!isClaimable || isLoading}
                          onClick={() => handleClaim(withdrawal.id)}
                        >
                          Claim
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-muted-foreground">No pending withdrawals</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Unstake thCSPR to create a withdrawal request
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Protocol Stats */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Protocol Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <div className="text-center p-4 rounded-lg bg-muted">
                <p className="text-2xl font-bold">
                  {poolStats ? formatCspr(poolStats.totalPooledCspr) : "..."}
                </p>
                <p className="text-sm text-muted-foreground">
                  Total CSPR Staked
                </p>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted">
                <p className="text-2xl font-bold">
                  {poolStats ? formatCspr(poolStats.totalThcsprSupply) : "..."}
                </p>
                <p className="text-sm text-muted-foreground">
                  Total thCSPR Supply
                </p>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted">
                <p className="text-2xl font-bold">
                  {lendingStats
                    ? formatCspr(lendingStats.totalDeposits)
                    : "..."}
                </p>
                <p className="text-sm text-muted-foreground">
                  Lending Pool TVL
                </p>
              </div>
              <div className="text-center p-4 rounded-lg bg-muted">
                <p className="text-2xl font-bold">
                  {lendingStats ? `${lendingStats.utilizationRate}%` : "..."}
                </p>
                <p className="text-sm text-muted-foreground">
                  Utilization Rate
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
