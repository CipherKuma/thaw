"use client";

import { cn } from "@/lib/utils";
import { EXCHANGE_RATE_PRECISION } from "@/lib/casper";

interface HealthFactorProps {
  healthFactor: bigint;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}

export function HealthFactor({
  healthFactor,
  showLabel = true,
  size = "md",
}: HealthFactorProps) {
  const healthFactorNum = Number(healthFactor) / Number(EXCHANGE_RATE_PRECISION);

  const getHealthColor = () => {
    if (healthFactorNum >= 2) return "text-green-500";
    if (healthFactorNum >= 1.5) return "text-yellow-500";
    if (healthFactorNum >= 1.1) return "text-orange-500";
    return "text-red-500";
  };

  const getHealthStatus = () => {
    if (healthFactorNum >= 2) return "Healthy";
    if (healthFactorNum >= 1.5) return "Moderate";
    if (healthFactorNum >= 1.1) return "At Risk";
    return "Danger";
  };

  const getProgressColor = () => {
    if (healthFactorNum >= 2) return "bg-green-500";
    if (healthFactorNum >= 1.5) return "bg-yellow-500";
    if (healthFactorNum >= 1.1) return "bg-orange-500";
    return "bg-red-500";
  };

  const progressPercentage = Math.min(
    100,
    Math.max(0, ((healthFactorNum - 1) / 2) * 100)
  );

  const sizeClasses = {
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
  };

  return (
    <div className="space-y-2">
      {showLabel && (
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground text-sm">Health Factor</span>
          <span className={cn(sizeClasses[size], "font-semibold", getHealthColor())}>
            {healthFactorNum >= 10 ? ">10" : healthFactorNum.toFixed(2)} ({getHealthStatus()})
          </span>
        </div>
      )}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full transition-all duration-300", getProgressColor())}
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>Liquidation (1.0)</span>
        <span>Safe (3.0+)</span>
      </div>
    </div>
  );
}
