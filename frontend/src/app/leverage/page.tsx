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
  getLendingPoolStats,
  getUserPosition,
  buildLeverageStakeDeploy,
  formatDeploy,
  submitDeploy,
  csprToMotes,
  parsePublicKey,
  PoolStats,
  LendingPoolStats,
  UserPosition,
  LENDING_POOL_HASH,
  EXCHANGE_RATE_PRECISION,
} from "@/lib/casper";
import { cn } from "@/lib/utils";
import { Zap, TrendingUp, AlertTriangle, Info } from "lucide-react";

export default function LeveragePage() {
  const { wallet, sign, refreshBalance, balance } = useCasperWallet();
  const { showToast, ToastComponent } = useTransactionToast();
  const [amount, setAmount] = useState("");
  const [loops, setLoops] = useState(2);
  const [isLoading, setIsLoading] = useState(false);
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null);
  const [lendingStats, setLendingStats] = useState<LendingPoolStats | null>(null);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [staking, lending] = await Promise.all([
        getPoolStats(),
        getLendingPoolStats(),
      ]);
      setPoolStats(staking);
      setLendingStats(lending);

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

  const handleLeverageStake = async () => {
    if (!wallet.publicKey || !amount) return;

    setIsLoading(true);
    showToast("pending", `Preparing ${loops}x leveraged stake...`);

    try {
      const amountMotes = csprToMotes(amount);
      const publicKey = parsePublicKey(wallet.publicKey);
      const deploy = buildLeverageStakeDeploy(publicKey, amountMotes, loops);
      const deployJson = JSON.stringify(formatDeploy(deploy));

      showToast("pending", "Please sign the transaction...");
      const signature = await sign(deployJson);

      showToast("pending", "Submitting transaction...");
      const deployHash = await submitDeploy(deploy, signature);

      showToast("success", `${loops}x leverage stake submitted!`, { deployHash });
      setAmount("");
      await refreshBalance();
      await fetchData();
    } catch (error) {
      showToast(
        "error",
        error instanceof Error ? error.message : "Leverage stake failed"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Calculate leverage metrics
  const collateralFactor = lendingStats?.collateralFactor || 75;
  const baseAmount = amount ? parseFloat(amount) : 0;

  // Calculate total exposure based on loops
  const calculateExposure = (initialAmount: number, loopCount: number): number => {
    let total = initialAmount;
    let current = initialAmount;
    for (let i = 1; i < loopCount; i++) {
      current = current * (collateralFactor / 100);
      total += current;
    }
    return total;
  };

  const totalExposure = calculateExposure(baseAmount, loops);
  const effectiveLeverage = baseAmount > 0 ? totalExposure / baseAmount : loops;

  // Staking APY
  const stakingApy = 8.5; // Mock - replace with actual calculation
  const leveragedApy = stakingApy * effectiveLeverage;

  // Borrow cost
  const borrowApy = lendingStats
    ? lendingStats.baseRate + (lendingStats.utilizationRate * lendingStats.baseRate) / 50
    : 10;
  const borrowCost = (totalExposure - baseAmount) * (borrowApy / 100);

  // Net APY
  const netApy = leveragedApy - (borrowApy * (effectiveLeverage - 1));

  // Health factor after leverage
  const estimatedHealthFactor = collateralFactor > 0
    ? (collateralFactor / 100) / ((effectiveLeverage - 1) / effectiveLeverage * (100 / (lendingStats?.liquidationThreshold || 80)))
    : 2;

  return (
    <main className="min-h-screen bg-gradient-to-b from-background to-muted">
      <Navigation />

      <div className="container py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Zap className="h-8 w-8 text-yellow-500" />
            Leveraged Staking
          </h1>
          <p className="text-muted-foreground">
            Amplify your staking rewards with up to 4x leverage
          </p>
        </div>

        {/* Warning Banner */}
        <Card className="mb-8 border-yellow-500/50 bg-yellow-500/5">
          <CardContent className="flex items-start gap-4 py-4">
            <AlertTriangle className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-500">
                High Risk Strategy
              </h3>
              <p className="text-sm text-muted-foreground">
                Leveraged positions can be liquidated if the health factor drops
                below 1.0. Higher leverage means higher rewards but also higher
                risk of liquidation.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Leverage Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Configure Leverage</CardTitle>
              <CardDescription>
                Choose your initial stake and leverage multiplier
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Amount Input */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Initial Stake</span>
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

              {/* Leverage Selector */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Leverage Multiplier</label>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((level) => (
                    <Button
                      key={level}
                      variant={loops === level ? "default" : "outline"}
                      onClick={() => setLoops(level)}
                      disabled={isLoading}
                      className={cn(
                        "flex flex-col py-4 h-auto",
                        loops === level && "ring-2 ring-primary"
                      )}
                    >
                      <span className="text-xl font-bold">{level}x</span>
                      <span className="text-xs text-muted-foreground">
                        {level === 1
                          ? "Safe"
                          : level === 2
                          ? "Moderate"
                          : level === 3
                          ? "Aggressive"
                          : "Max"}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Preview */}
              <div className="rounded-lg bg-muted p-4 space-y-3">
                <h4 className="font-medium flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Position Preview
                </h4>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Initial Stake</span>
                    <span>{baseAmount.toFixed(2)} CSPR</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Exposure</span>
                    <span className="font-semibold">
                      {totalExposure.toFixed(2)} CSPR
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Effective Leverage
                    </span>
                    <span className="font-semibold text-yellow-500">
                      {effectiveLeverage.toFixed(2)}x
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Borrowed Amount</span>
                    <span>{(totalExposure - baseAmount).toFixed(2)} CSPR</span>
                  </div>
                  <hr className="border-border" />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Staking APY</span>
                    <span className="text-green-500">
                      {leveragedApy.toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Borrow Cost</span>
                    <span className="text-red-500">
                      -{(borrowApy * (effectiveLeverage - 1)).toFixed(2)}%
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <span>Net APY</span>
                    <span
                      className={cn(
                        netApy > 0 ? "text-green-500" : "text-red-500"
                      )}
                    >
                      {netApy.toFixed(2)}%
                    </span>
                  </div>
                </div>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={handleLeverageStake}
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
                  : `Stake with ${loops}x Leverage`}
              </Button>
            </CardContent>
          </Card>

          {/* Risk Analysis */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Risk Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Health Factor Preview */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Estimated Health Factor</span>
                    <span
                      className={cn(
                        "font-semibold",
                        estimatedHealthFactor >= 1.5
                          ? "text-green-500"
                          : estimatedHealthFactor >= 1.2
                          ? "text-yellow-500"
                          : "text-red-500"
                      )}
                    >
                      {estimatedHealthFactor.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full transition-all",
                        estimatedHealthFactor >= 1.5
                          ? "bg-green-500"
                          : estimatedHealthFactor >= 1.2
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      )}
                      style={{
                        width: `${Math.min(100, ((estimatedHealthFactor - 1) / 2) * 100)}%`,
                      }}
                    />
                  </div>
                </div>

                {/* Risk Metrics */}
                <div className="grid gap-3">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                    <span className="text-muted-foreground">
                      Liquidation Price
                    </span>
                    <span className="font-semibold">
                      {loops > 1
                        ? `${((1 - (lendingStats?.liquidationThreshold || 80) / 100) * 100).toFixed(0)}% drop`
                        : "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                    <span className="text-muted-foreground">Liquidation Bonus</span>
                    <span className="font-semibold">
                      {lendingStats?.liquidationBonus || 5}%
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted">
                    <span className="text-muted-foreground">
                      Available Liquidity
                    </span>
                    <span className="font-semibold">
                      {lendingStats
                        ? formatCspr(lendingStats.availableLiquidity)
                        : "..."}{" "}
                      CSPR
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Current Position */}
            {wallet.isConnected && userPosition && (
              <Card>
                <CardHeader>
                  <CardTitle>Current Leveraged Position</CardTitle>
                </CardHeader>
                <CardContent>
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
                      <span className="text-muted-foreground">Health Factor</span>
                      <span
                        className={cn(
                          "font-semibold",
                          Number(userPosition.healthFactor) /
                            Number(EXCHANGE_RATE_PRECISION) >=
                          1.5
                            ? "text-green-500"
                            : "text-yellow-500"
                        )}
                      >
                        {(
                          Number(userPosition.healthFactor) /
                          Number(EXCHANGE_RATE_PRECISION)
                        ).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* How It Works */}
            <Card>
              <CardHeader>
                <CardTitle>How Leveraged Staking Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                    1
                  </div>
                  <p className="text-muted-foreground">
                    Your CSPR is staked to receive thCSPR
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                    2
                  </div>
                  <p className="text-muted-foreground">
                    thCSPR is used as collateral to borrow more CSPR
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                    3
                  </div>
                  <p className="text-muted-foreground">
                    Borrowed CSPR is staked again (repeated for each loop)
                  </p>
                </div>
                <div className="flex gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                    4
                  </div>
                  <p className="text-muted-foreground">
                    Net rewards = Staking APY × Leverage - Borrow APR
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {ToastComponent}
    </main>
  );
}
