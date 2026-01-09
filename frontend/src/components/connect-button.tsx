"use client";

import { useState, useRef, useEffect } from "react";
import { useCasperWallet } from "@/hooks/useCasperWallet";
import { Button } from "@/components/ui/button";
import { Droplets, Loader2 } from "lucide-react";
import { toast } from "sonner";

const walletDisplayNames: Record<string, string> = {
  "casper-wallet": "Casper Wallet",
  "casper-signer": "Casper Signer",
  "metamask-snap": "MetaMask (Casper Snap)",
};

const LOCALNET_EXPLORER_URL = "http://localhost:8080";

export function ConnectButton() {
  const {
    wallet,
    isLoading,
    truncatedAddress,
    balance,
    walletType,
    error,
    hasWalletExtension,
    availableWallets,
    connect,
    disconnect,
    network,
    refreshBalance,
  } = useCasperWallet();

  const [isOpen, setIsOpen] = useState(false);
  const [showWalletSelect, setShowWalletSelect] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDripping, setIsDripping] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setShowWalletSelect(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCopyAddress = async () => {
    if (wallet.publicKey) {
      await navigator.clipboard.writeText(wallet.publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleConnect = async (type?: "casper-signer" | "casper-wallet" | "metamask-snap" | null) => {
    setShowWalletSelect(false);
    await connect(type);
  };

  const handleFaucetDrip = async () => {
    if (!wallet.publicKey || isDripping) return;

    setIsDripping(true);
    try {
      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicKey: wallet.publicKey, amount: 1000 }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`Received ${data.amount} CSPR`, {
          description: "Faucet drip successful",
          action: {
            label: "View TX",
            onClick: () => {
              window.open(
                `${LOCALNET_EXPLORER_URL}/deploy/${data.deployHash}`,
                "_blank"
              );
            },
          },
        });
        // Refresh balance after a short delay
        setTimeout(() => refreshBalance(), 2000);
      } else {
        toast.error(data.error || "Faucet drip failed", {
          description: "Please try again",
        });
      }
    } catch (err) {
      toast.error("Could not connect to faucet", {
        description: "Check if localnet is running",
      });
    } finally {
      setIsDripping(false);
    }
  };

  if (!hasWalletExtension) {
    return (
      <div className="relative" ref={dropdownRef}>
        <Button
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
        >
          Install Wallet ▾
        </Button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-64 rounded-md border bg-white p-2 shadow-md z-50">
            <p className="text-sm text-gray-500 mb-3 px-2">
              No Casper wallet detected. Install one:
            </p>
            <a
              href="https://www.casperwallet.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-gray-100 transition-colors"
            >
              → Casper Wallet
            </a>
            <a
              href="https://chrome.google.com/webstore/detail/casper-signer/djhndpllfiibmcdbnmaaahkhchcoijce"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-gray-100 transition-colors"
            >
              → Casper Signer
            </a>
            <a
              href="https://metamask.io/download/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-gray-100 transition-colors"
            >
              → MetaMask (with Casper Snap)
            </a>
          </div>
        )}
      </div>
    );
  }

  if (wallet.isConnected) {
    return (
      <div className="relative" ref={dropdownRef}>
        <Button
          variant="outline"
          onClick={() => setIsOpen(!isOpen)}
          className="gap-2"
        >
          {balance && (
            <span className="text-muted-foreground">{balance} CSPR</span>
          )}
          <span className="font-mono">{truncatedAddress}</span>
        </Button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-48 rounded-md border bg-popover shadow-md z-50">
            <div className="p-1">
              <button
                onClick={handleCopyAddress}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                {copied ? "✓ Copied!" : "Copy Address"}
              </button>

              {network === "localnet" && (
                <button
                  onClick={handleFaucetDrip}
                  disabled={isDripping}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {isDripping ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Droplets className="h-4 w-4" />
                  )}
                  {isDripping ? "Dripping..." : "Faucet"}
                </button>
              )}

              <button
                onClick={() => {
                  disconnect();
                  setIsOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (availableWallets.length > 1 && showWalletSelect) {
    return (
      <div className="relative" ref={dropdownRef}>
        <Button variant="outline" disabled>
          Select Wallet
        </Button>

        <div className="absolute right-0 mt-2 w-64 rounded-md border bg-white p-1 shadow-md z-50">
          {availableWallets.map((walletOption) => (
            <button
              key={walletOption}
              onClick={() => handleConnect(walletOption)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-gray-100 transition-colors"
            >
              🔗 {walletOption ? walletDisplayNames[walletOption] : "Unknown"}
            </button>
          ))}
          <button
            onClick={() => setShowWalletSelect(false)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-gray-500 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <Button
        onClick={() => {
          if (availableWallets.length > 1) {
            setShowWalletSelect(true);
          } else {
            handleConnect();
          }
        }}
        disabled={isLoading}
      >
        {isLoading ? "Connecting..." : "Connect Wallet"}
      </Button>

      {error && (
        <div className="absolute right-0 mt-2 w-64 rounded-md border border-red-300 bg-white p-3 shadow-md z-50">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
