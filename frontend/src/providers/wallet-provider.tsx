"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from "react";
import { CLPublicKey } from "casper-js-sdk";

// Casper Network RPC endpoints
export const CASPER_RPC_URLS = {
  localnet: "http://localhost:11101/rpc",
  testnet: "https://node.testnet.casper.network/rpc",
  mainnet: "https://node.mainnet.casper.network/rpc",
} as const;

export type CasperNetwork = keyof typeof CASPER_RPC_URLS;

const STORAGE_KEY = "thaw_wallet_connection";
const NETWORK_STORAGE_KEY = "thaw_network";
const CASPER_SNAP_ID = "npm:casper-manager";

type WalletType = "casper-signer" | "casper-wallet" | "metamask-snap" | null;

interface WalletState {
  isConnected: boolean;
  isConnecting: boolean;
  publicKey: string | null;
  accountHash: string | null;
  balance: string | null;
  walletType: WalletType;
  error: string | null;
}

interface WalletContextType extends WalletState {
  connect: (type?: WalletType) => Promise<void>;
  disconnect: () => void;
  sign: (deployJson: string) => Promise<string>;
  refreshBalance: () => Promise<void>;
  availableWallets: WalletType[];
  hasMetaMask: boolean;
  network: CasperNetwork;
  setNetwork: (network: CasperNetwork) => void;
}

const initialState: WalletState = {
  isConnected: false,
  isConnecting: false,
  publicKey: null,
  accountHash: null,
  balance: null,
  walletType: null,
  error: null,
};

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Extend the Window interface for Casper Wallet and MetaMask
// Note: casperlabsHelper is already declared in casper-js-sdk
declare global {
  interface Window {
    CasperWalletProvider?: () => {
      isConnected: () => Promise<boolean>;
      requestConnection: () => Promise<boolean>;
      disconnectFromSite: () => Promise<boolean>;
      getActivePublicKey: () => Promise<string>;
      sign: (
        deployJson: string,
        signingPublicKey: string
      ) => Promise<{ signature: string }>;
    };
    ethereum?: {
      isMetaMask?: boolean;
      request: (args: { method: string; params?: unknown[] | Record<string, unknown> }) => Promise<unknown>;
    };
  }
}

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const [state, setState] = useState<WalletState>(initialState);
  const [hasMetaMask, setHasMetaMask] = useState(false);
  // Default to testnet for deployment
  const [network, setNetworkState] = useState<CasperNetwork>("testnet");

  // Load saved network on mount
  useEffect(() => {
    const savedNetwork = localStorage.getItem(NETWORK_STORAGE_KEY) as CasperNetwork | null;
    if (savedNetwork && CASPER_RPC_URLS[savedNetwork]) {
      setNetworkState(savedNetwork);
    }
  }, []);

  const setNetwork = useCallback((newNetwork: CasperNetwork) => {
    setNetworkState(newNetwork);
    localStorage.setItem(NETWORK_STORAGE_KEY, newNetwork);
    // Disconnect wallet when switching networks
    localStorage.removeItem(STORAGE_KEY);
    setState(initialState);
  }, []);

  const getAvailableWallets = useCallback((): WalletType[] => {
    if (typeof window === "undefined") return [];

    const wallets: WalletType[] = [];

    if (window.CasperWalletProvider) {
      wallets.push("casper-wallet");
    }

    if (window.casperlabsHelper) {
      wallets.push("casper-signer");
    }

    // MetaMask Snap is always available if MetaMask is installed
    if (window.ethereum?.isMetaMask) {
      wallets.push("metamask-snap");
    }

    return wallets;
  }, []);

  const [availableWallets, setAvailableWallets] = useState<WalletType[]>([]);

  useEffect(() => {
    const checkWallets = () => {
      setAvailableWallets(getAvailableWallets());
      setHasMetaMask(!!window.ethereum?.isMetaMask);
    };

    checkWallets();

    // Check again after a delay for extensions that load slowly
    const timeout = setTimeout(checkWallets, 1000);

    return () => clearTimeout(timeout);
  }, [getAvailableWallets]);

  const fetchBalance = useCallback(
    async (publicKeyHex: string): Promise<string> => {
      try {
        // Use Next.js API route to proxy RPC calls (avoids CORS issues)
        const balanceResponse = await fetch("/api/rpc", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-casper-network": network,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "query_balance",
            params: {
              purse_identifier: {
                main_purse_under_public_key: publicKeyHex,
              },
            },
          }),
        });
        const balanceData = await balanceResponse.json();
        const balance = balanceData.result?.balance || "0";
        const cspr = (Number(balance) / 1_000_000_000).toFixed(4);
        return cspr;
      } catch (error) {
        console.error("Failed to fetch balance:", error);
        return "0";
      }
    },
    [network]
  );

  const publicKeyToAccountHash = (publicKeyHex: string): string => {
    try {
      const pk = CLPublicKey.fromHex(publicKeyHex);
      return pk.toAccountHashStr();
    } catch (error) {
      console.error("Failed to convert public key to account hash:", error);
      return "";
    }
  };

  const connectWithSigner = useCallback(async () => {
    if (!window.casperlabsHelper) {
      throw new Error("Casper Signer is not installed");
    }

    await window.casperlabsHelper.requestConnection();

    const isConnected = await window.casperlabsHelper.isConnected();
    if (!isConnected) {
      throw new Error("Connection rejected");
    }

    const publicKey = await window.casperlabsHelper.getActivePublicKey();
    return publicKey;
  }, []);

  const connectWithWallet = useCallback(async () => {
    if (!window.CasperWalletProvider) {
      throw new Error("Casper Wallet is not installed");
    }

    const provider = window.CasperWalletProvider();

    const connected = await provider.requestConnection();
    if (!connected) {
      throw new Error("Connection rejected");
    }

    const publicKey = await provider.getActivePublicKey();
    return publicKey;
  }, []);

  const connectWithSnap = useCallback(async () => {
    if (!window.ethereum?.isMetaMask) {
      throw new Error("MetaMask is not installed");
    }

    // Request snap installation/connection
    await window.ethereum.request({
      method: "wallet_requestSnaps",
      params: {
        [CASPER_SNAP_ID]: {},
      },
    });

    // Get account using the correct method name: casper_getAccount
    // The snap returns an object with a publicKey property
    const result = await window.ethereum.request({
      method: "wallet_invokeSnap",
      params: {
        snapId: CASPER_SNAP_ID,
        request: {
          method: "casper_getAccount",
          params: {
            addressIndex: 0,
          },
        },
      },
    });

    console.log("MetaMask Snap casper_getAccount result:", result, typeof result);

    // Handle various response formats
    let publicKey: string | undefined;

    if (typeof result === 'string') {
      publicKey = result;
    } else if (result && typeof result === 'object') {
      const resultObj = result as Record<string, unknown>;
      publicKey = (resultObj.publicKey ?? resultObj.public_key ?? resultObj.address) as string | undefined;
      console.log("Extracted publicKey from object:", publicKey);
    }

    if (!publicKey || typeof publicKey !== 'string') {
      console.error("Invalid public key format from snap:", result);
      throw new Error("Failed to get public key from MetaMask Snap");
    }

    return publicKey;
  }, []);

  const connect = useCallback(
    async (preferredType?: WalletType) => {
      setState((prev) => ({ ...prev, isConnecting: true, error: null }));

      try {
        let publicKey: string;
        let walletType: WalletType;

        if (preferredType === "casper-wallet" && window.CasperWalletProvider) {
          publicKey = await connectWithWallet();
          walletType = "casper-wallet";
        } else if (preferredType === "casper-signer" && window.casperlabsHelper) {
          publicKey = await connectWithSigner();
          walletType = "casper-signer";
        } else if (preferredType === "metamask-snap" && window.ethereum?.isMetaMask) {
          publicKey = await connectWithSnap();
          walletType = "metamask-snap";
        } else if (window.CasperWalletProvider) {
          publicKey = await connectWithWallet();
          walletType = "casper-wallet";
        } else if (window.casperlabsHelper) {
          publicKey = await connectWithSigner();
          walletType = "casper-signer";
        } else if (window.ethereum?.isMetaMask) {
          publicKey = await connectWithSnap();
          walletType = "metamask-snap";
        } else {
          throw new Error(
            "No Casper wallet found. Please install Casper Wallet, Casper Signer, or MetaMask."
          );
        }

        const accountHash = publicKeyToAccountHash(publicKey);
        const balance = await fetchBalance(publicKey);

        const connectionData = {
          publicKey,
          accountHash,
          walletType,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(connectionData));

        setState({
          isConnected: true,
          isConnecting: false,
          publicKey,
          accountHash,
          balance,
          walletType,
          error: null,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to connect wallet";
        setState((prev) => ({
          ...prev,
          isConnecting: false,
          error: errorMessage,
        }));
      }
    },
    [connectWithSigner, connectWithWallet, connectWithSnap, fetchBalance]
  );

  const disconnect = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setState(initialState);

    if (state.walletType === "casper-signer" && window.casperlabsHelper) {
      try {
        window.casperlabsHelper.disconnectFromSite();
      } catch (e) {
        console.error(e);
      }
    } else if (
      state.walletType === "casper-wallet" &&
      window.CasperWalletProvider
    ) {
      const provider = window.CasperWalletProvider();
      provider.disconnectFromSite().catch(console.error);
    }
    // MetaMask Snap doesn't need explicit disconnect - just clear local state
  }, [state.walletType]);

  const sign = useCallback(
    async (deployJson: string): Promise<string> => {
      if (!state.isConnected || !state.publicKey) {
        throw new Error("Wallet not connected");
      }

      if (state.walletType === "casper-signer" && window.casperlabsHelper) {
        // The SDK types don't match actual wallet API - use type assertion
        const signerHelper = window.casperlabsHelper as unknown as {
          sign: (deploy: string, publicKey: string) => Promise<{ signature: string }>;
        };
        const result = await signerHelper.sign(deployJson, state.publicKey);
        return result.signature;
      } else if (
        state.walletType === "casper-wallet" &&
        window.CasperWalletProvider
      ) {
        const provider = window.CasperWalletProvider();
        const result = await provider.sign(deployJson, state.publicKey);
        return result.signature;
      } else if (state.walletType === "metamask-snap" && window.ethereum) {
        // Use casper_sign method with the deploy JSON
        const result = await window.ethereum.request({
          method: "wallet_invokeSnap",
          params: {
            snapId: CASPER_SNAP_ID,
            request: {
              method: "casper_sign",
              params: {
                addressIndex: 0,
                deployJson: deployJson,
              },
            },
          },
        }) as string;

        return result;
      }

      throw new Error("No wallet available for signing");
    },
    [state.isConnected, state.publicKey, state.walletType]
  );

  const refreshBalance = useCallback(async () => {
    if (!state.publicKey) return;

    const balance = await fetchBalance(state.publicKey);
    setState((prev) => ({ ...prev, balance }));
  }, [state.publicKey, fetchBalance]);

  useEffect(() => {
    const restoreConnection = async () => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      try {
        const { publicKey, accountHash, walletType } = JSON.parse(stored);

        let isStillConnected = false;

        if (walletType === "casper-signer" && window.casperlabsHelper) {
          isStillConnected = await window.casperlabsHelper.isConnected();
        } else if (
          walletType === "casper-wallet" &&
          window.CasperWalletProvider
        ) {
          const provider = window.CasperWalletProvider();
          isStillConnected = await provider.isConnected();
        } else if (walletType === "metamask-snap" && window.ethereum?.isMetaMask) {
          // For MetaMask Snap, we assume it's still connected if MetaMask is available
          // and we have stored credentials
          isStillConnected = true;
        }

        if (isStillConnected) {
          const balance = await fetchBalance(publicKey);
          setState({
            isConnected: true,
            isConnecting: false,
            publicKey,
            accountHash,
            balance,
            walletType,
            error: null,
          });
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch (error) {
        console.error("Failed to restore connection:", error);
        localStorage.removeItem(STORAGE_KEY);
      }
    };

    const timeout = setTimeout(restoreConnection, 500);
    return () => clearTimeout(timeout);
  }, [fetchBalance]);

  const value: WalletContextType = {
    ...state,
    connect,
    disconnect,
    sign,
    refreshBalance,
    availableWallets,
    hasMetaMask,
    network,
    setNetwork,
  };

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

export function useWalletContext() {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error("useWalletContext must be used within a WalletProvider");
  }
  return context;
}
