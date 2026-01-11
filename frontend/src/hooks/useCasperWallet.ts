"use client";

import { useWalletContext } from "@/providers/wallet-provider";

export function useCasperWallet() {
  const {
    isConnected,
    isConnecting,
    publicKey,
    accountHash,
    balance,
    walletType,
    error,
    connect,
    disconnect,
    sign,
    refreshBalance,
    availableWallets,
    hasMetaMask,
    network,
    setNetwork,
  } = useWalletContext();

  const truncatedAddress = publicKey
    ? `${publicKey.slice(0, 8)}...${publicKey.slice(-6)}`
    : null;

  const hasWalletExtension = availableWallets.length > 0;

  // Keep backward compatible API with wallet object
  const wallet = {
    isConnected,
    publicKey,
    accountHash,
  };

  return {
    wallet,
    isLoading: isConnecting,
    error,
    connect,
    disconnect,
    sign, // Direct access to sign function
    signDeploy: sign, // Backward compatible alias
    isWalletAvailable: hasWalletExtension,
    // New properties
    balance,
    walletType,
    truncatedAddress,
    hasWalletExtension,
    hasMetaMask,
    availableWallets,
    refreshBalance,
    network,
    setNetwork,
  };
}
