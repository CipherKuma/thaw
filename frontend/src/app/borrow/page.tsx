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
import { HealthFactor } from "@/components/health-factor";
import { useTransactionToast } from "@/components/transaction-toast";
import { formatCspr } from "@/lib/utils";
import {
  getLendingPoolStats,
  getUserPosition,
  getPoolStats,
  buildDepositCollateralDeploy,
  buildWithdrawCollateralDeploy,
  buildBorrowDeploy,
  buildRepayDeploy,
  buildApproveDeploy,
  formatDeploy,
  submitDeploy,
  csprToMotes,
  motesToCspr,
  parsePublicKey,
  LendingPoolStats,
  UserPosition,
  PoolStats,
  LENDING_POOL_HASH,
  EXCHANGE_RATE_PRECISION,
} from "@/lib/casper";
import {
  Shield,
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  RefreshCw,
} from "lucide-react";

type Tab = "collateral" | "borrow" | "repay";

export default function BorrowPage() {
  const { wallet, sign, refreshBalance } = useCasperWallet();
  const { showToast, ToastComponent } = useTransactionToast();
  const [activeTab, setActiveTab] = useState<Tab>("collateral");
  const [amount, setAmount] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lendingStats, setLendingStats] = useState<LendingPoolStats | null>(null);
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [thcsprBalance, setThcsprBalance] = useState<bigint>(BigInt(0));

  const fetchData = useCallback(async () => {
    try {
      const [lending, staking] = await Promise.all([
        getLendingPoolStats(),
        getPoolStats(),
      ]);
      setLendingStats(lending);
      setPoolStats(staking);

      if (wallet.accountHash) {
        const position = await getUserPosition(wallet.accountHash);
        setUserPosition(position);
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

  const handleDepositCollateral = async () => {
    if (!wallet.publicKey || !amount) return;

    setIsLoading(true);
    showToast("pending", "Preparing collateral deposit...");

    try {
      const amountMotes = csprToMotes(amount);
      const publicKey = parsePublicKey(wallet.publicKey);

      // First approve the lending pool to spend thCSPR
      showToast("pending", "Approving thCSPR transfer...");
      const approveDeploy = buildApproveDeploy(
        publicKey,
        LENDING_POOL_HASH,
        amountMotes
      );
      const approveJson = JSON.stringify(formatDeploy(approveDeploy));
      const approveSignature = await sign(approveJson);
      await submitDeploy(approveDeploy, approveSignature);

      // Then deposit collateral
      showToast("pending", "Depositing collateral...");
      const deploy = buildDepositCollateralDeploy(publicKey, amountMotes);
      const deployJson = JSON.stringify(formatDeploy(deploy));
      const signature = await sign(deployJson);
      const deployHash = await submitDeploy(deploy, signature);

      showToast("success", "Collateral deposited!", { deployHash });
      setAmount("");
      await fetchData();
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Deposit failed"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdrawCollateral = async () => {
    if (!wallet.publicKey || !amount) return;

    setIsLoading(true);
    showToast("pending", "Preparing collateral withdrawal...");

    try {
      const amountMotes = csprToMotes(amount);
      const publicKey = parsePublicKey(wallet.publicKey);
      const deploy = buildWithdrawCollateralDeploy(publicKey, amountMotes);
      const deployJson = JSON.stringify(formatDeploy(deploy));

      showToast("pending", "Please sign the transaction...");
      const signature = await sign(deployJson);

      showToast("pending", "Submitting transaction...");
      const deployHash = await submitDeploy(deploy, signature);

      showToast("success", "Collateral withdrawn!", { deployHash });
      setAmount("");
      await fetchData();
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Withdrawal failed"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleBorrow = async () => {
    if (!wallet.publicKey || !amount) return;

    setIsLoading(true);
    showToast("pending", "Preparing borrow transaction...");

    try {
      const amountMotes = csprToMotes(amount);
      const publicKey = parsePublicKey(wallet.publicKey);
      const deploy = buildBorrowDeploy(publicKey, amountMotes);
      const deployJson = JSON.stringify(formatDeploy(deploy));

      showToast("pending", "Please sign the transaction...");
      const signature = await sign(deployJson);

      showToast("pending", "Submitting transaction...");
      const deployHash = await submitDeploy(deploy, signature);

      showToast("success", "Borrow successful!", { deployHash });
      setAmount("");
      await refreshBalance();
      await fetchData();
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Borrow failed"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRepay = async () => {
    if (!wallet.publicKey || !amount) return;

    setIsLoading(true);
    showToast("pending", "Preparing repayment...");

    try {
      const amountMotes = csprToMotes(amount);
      const publicKey = parsePublicKey(wallet.publicKey);
      const deploy = buildRepayDeploy(publicKey, amountMotes);
      const deployJson = JSON.stringify(formatDeploy(deploy));

      showToast("pending", "Please sign the transaction...");
      const signature = await sign(deployJson);

      showToast("pending", "Submitting transaction...");
      const deployHash = await submitDeploy(deploy, signature);

      showToast("success", "Repayment successful!", { deployHash });
      setAmount("");
      await refreshBalance();
      await fetchData();
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Repayment failed"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const collateral = userPosition?.collateral || BigInt(0);
  const borrowed = userPosition?.borrowed || BigInt(0);
  const healthFactor = userPosition?.healthFactor || EXCHANGE_RATE_PRECISION;
  const maxBorrow = userPosition?.maxBorrow || BigInt(0);

  const borrowApy = lendingStats
    ? lendingStats.baseRate +
      (lendingStats.utilizationRate * lendingStats.baseRate) / 50
    : 0;

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted">
      <Navigation />

      <div className="container py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Borrow CSPR</h1>
          <p className="text-muted-foreground">
            Use your thCSPR as collateral to borrow CSPR
          </p>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Collateral Factor
              </CardDescription>
              <CardTitle className="text-2xl">
                {lendingStats?.collateralFactor || 75}%
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Banknote className="h-4 w-4" />
                Liquidation Threshold
              </CardDescription>
              <CardTitle className="text-2xl">
                {lendingStats?.liquidationThreshold || 80}%
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                Available Liquidity
              </CardDescription>
              <CardTitle className="text-2xl">
                {lendingStats
                  ? formatCspr(lendingStats.availableLiquidity)
                  : "..."}{" "}
                CSPR
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Borrow APR</CardDescription>
              <CardTitle className="text-2xl text-orange-500">
                {borrowApy.toFixed(2)}%
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Action Card */}
          <Card>
            <CardHeader>
              <div className="flex gap-2 flex-wrap">
                {(["collateral", "borrow", "repay"] as Tab[]).map((tab) => (
                  <Button
                    key={tab}
                    variant={activeTab === tab ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setActiveTab(tab)}
                    className="capitalize"
                  >
                    {tab === "collateral" && (
                      <Shield className="h-4 w-4 mr-2" />
                    )}
                    {tab === "borrow" && (
                      <ArrowUpFromLine className="h-4 w-4 mr-2" />
                    )}
                    {tab === "repay" && (
                      <ArrowDownToLine className="h-4 w-4 mr-2" />
                    )}
                    {tab}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {activeTab === "collateral" && (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>thCSPR Amount</span>
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
                  <div className="rounded-lg bg-muted p-3 text-sm space-y-2">
                    <div className="flex justify-between">
                      <span>Current Collateral</span>
                      <span>{formatCspr(collateral)} thCSPR</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Max Borrow After</span>
                      <span>
                        {formatCspr(
                          ((collateral + csprToMotes(amount || "0")) *
                            BigInt(75)) /
                            BigInt(100) -
                            borrowed
                        )}{" "}
                        CSPR
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      onClick={handleDepositCollateral}
                      disabled={
                        !wallet.isConnected ||
                        !amount ||
                        isLoading ||
                        !LENDING_POOL_HASH
                      }
                    >
                      {isLoading ? "Processing..." : "Deposit Collateral"}
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={handleWithdrawCollateral}
                      disabled={
                        !wallet.isConnected ||
                        !amount ||
                        isLoading ||
                        !LENDING_POOL_HASH
                      }
                    >
                      Withdraw
                    </Button>
                  </div>
                </>
              )}

              {activeTab === "borrow" && (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Borrow Amount</span>
                      <span className="text-muted-foreground">
                        Max: {formatCspr(maxBorrow)} CSPR
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
                          setAmount(motesToCspr(maxBorrow).toString())
                        }
                        disabled={isLoading}
                      >
                        Max
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-sm space-y-2">
                    <div className="flex justify-between">
                      <span>Current Debt</span>
                      <span>{formatCspr(borrowed)} CSPR</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Borrow APR</span>
                      <span className="text-orange-500">
                        {borrowApy.toFixed(2)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Health Factor After</span>
                      <span>
                        {amount && collateral > 0
                          ? (
                              (Number(collateral) * 0.8) /
                              (Number(borrowed) +
                                Number(csprToMotes(amount)))
                            ).toFixed(2)
                          : "N/A"}
                      </span>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleBorrow}
                    disabled={
                      !wallet.isConnected ||
                      !amount ||
                      isLoading ||
                      !LENDING_POOL_HASH ||
                      collateral === BigInt(0)
                    }
                  >
                    {!wallet.isConnected
                      ? "Connect Wallet"
                      : collateral === BigInt(0)
                      ? "Deposit Collateral First"
                      : !LENDING_POOL_HASH
                      ? "Contract Not Deployed"
                      : isLoading
                      ? "Processing..."
                      : "Borrow CSPR"}
                  </Button>
                </>
              )}

              {activeTab === "repay" && (
                <>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Repay Amount</span>
                      <span className="text-muted-foreground">
                        Debt: {formatCspr(borrowed)} CSPR
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
                          setAmount(motesToCspr(borrowed).toString())
                        }
                        disabled={isLoading}
                      >
                        Max
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted p-3 text-sm space-y-2">
                    <div className="flex justify-between">
                      <span>Remaining Debt After</span>
                      <span>
                        {formatCspr(
                          borrowed - csprToMotes(amount || "0") > 0
                            ? borrowed - csprToMotes(amount || "0")
                            : BigInt(0)
                        )}{" "}
                        CSPR
                      </span>
                    </div>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleRepay}
                    disabled={
                      !wallet.isConnected ||
                      !amount ||
                      isLoading ||
                      !LENDING_POOL_HASH ||
                      borrowed === BigInt(0)
                    }
                  >
                    {!wallet.isConnected
                      ? "Connect Wallet"
                      : borrowed === BigInt(0)
                      ? "No Debt to Repay"
                      : !LENDING_POOL_HASH
                      ? "Contract Not Deployed"
                      : isLoading
                      ? "Processing..."
                      : "Repay CSPR"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          {/* Position Card */}
          <Card>
            <CardHeader>
              <CardTitle>Your Borrow Position</CardTitle>
              <CardDescription>
                Manage your collateral and debt
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {wallet.isConnected ? (
                <>
                  <HealthFactor healthFactor={healthFactor} />

                  <div className="grid gap-4">
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                      <span className="text-muted-foreground">Collateral</span>
                      <span className="font-semibold">
                        {formatCspr(collateral)} thCSPR
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                      <span className="text-muted-foreground">
                        Collateral Value
                      </span>
                      <span className="font-semibold">
                        ~{" "}
                        {poolStats
                          ? formatCspr(
                              (collateral *
                                poolStats.exchangeRate) /
                                EXCHANGE_RATE_PRECISION
                            )
                          : "..."}{" "}
                        CSPR
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                      <span className="text-muted-foreground">Borrowed</span>
                      <span className="font-semibold">
                        {formatCspr(borrowed)} CSPR
                      </span>
                    </div>
                    <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                      <span className="text-muted-foreground">
                        Available to Borrow
                      </span>
                      <span className="font-semibold">
                        {formatCspr(maxBorrow)} CSPR
                      </span>
                    </div>
                  </div>

                  {collateral === BigInt(0) && borrowed === BigInt(0) && (
                    <p className="text-center text-muted-foreground text-sm">
                      Deposit thCSPR as collateral to start borrowing
                    </p>
                  )}
                </>
              ) : (
                <p className="text-center text-muted-foreground text-sm py-8">
                  Connect your wallet to view your position
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {ToastComponent}
    </main>
  );
}
