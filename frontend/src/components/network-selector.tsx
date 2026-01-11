"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CURRENT_NETWORK, NETWORK_CONFIG } from "@/lib/casper";
import { cn } from "@/lib/utils";
import { Globe, Check, ChevronDown } from "lucide-react";

type Network = keyof typeof NETWORK_CONFIG;

const networkLabels: Record<Network, { name: string; color: string; disabled?: boolean }> = {
  localnet: { name: "Localnet", color: "text-purple-500", disabled: true },
  testnet: { name: "Testnet", color: "text-yellow-500" },
  mainnet: { name: "Mainnet", color: "text-green-500", disabled: true },
};

export function NetworkSelector() {
  const [isOpen, setIsOpen] = useState(false);
  const currentNetwork = CURRENT_NETWORK;
  const networkInfo = networkLabels[currentNetwork];

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={() => setIsOpen(!isOpen)}
      >
        <Globe className={cn("h-4 w-4", networkInfo.color)} />
        <span className="hidden sm:inline">{networkInfo.name}</span>
        <ChevronDown className="h-3 w-3" />
      </Button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 z-50 w-48 rounded-lg border bg-popover p-1 shadow-lg">
            {(Object.keys(NETWORK_CONFIG) as Network[]).map((network) => {
              const info = networkLabels[network];
              const isActive = network === currentNetwork;
              const isDisabled = info.disabled;

              return (
                <button
                  key={network}
                  disabled={isDisabled}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-3 py-2 text-sm",
                    isActive
                      ? "bg-accent"
                      : isDisabled
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:bg-muted"
                  )}
                  onClick={() => {
                    if (!isDisabled) {
                      // Network switching would require page reload and env change
                      // For now, just show which network is active
                      setIsOpen(false);
                    }
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Globe className={cn("h-4 w-4", isDisabled ? "text-muted-foreground" : info.color)} />
                    {info.name}
                  </div>
                  {isActive && <Check className="h-4 w-4" />}
                  {isDisabled && !isActive && <span className="text-xs text-muted-foreground">Soon</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
