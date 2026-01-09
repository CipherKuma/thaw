"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle, XCircle, Loader2, ExternalLink } from "lucide-react";
import { CURRENT_NETWORK } from "@/lib/casper";

export type TransactionStatus = "pending" | "success" | "error";

interface TransactionToastAction {
  label: string;
  onClick: () => void;
}

interface TransactionToastProps {
  status: TransactionStatus;
  message: string;
  deployHash?: string;
  onClose?: () => void;
  action?: TransactionToastAction;
  explorerBaseUrl?: string;
}

const explorerUrls = {
  localnet: "http://localhost:8080/deploy",
  testnet: "https://testnet.cspr.live/deploy",
  mainnet: "https://cspr.live/deploy",
};

export function TransactionToast({
  status,
  message,
  deployHash,
  onClose,
  action,
  explorerBaseUrl,
}: TransactionToastProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    if (status === "success" || status === "error") {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onClose?.();
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [status, onClose]);

  if (!isVisible) return null;

  const explorerUrl = explorerBaseUrl || explorerUrls[CURRENT_NETWORK];

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg p-4 shadow-lg border",
        status === "pending" && "bg-background border-primary/50",
        status === "success" && "bg-green-500/10 border-green-500/50",
        status === "error" && "bg-red-500/10 border-red-500/50"
      )}
    >
      {status === "pending" && (
        <Loader2 className="h-5 w-5 text-primary animate-spin" />
      )}
      {status === "success" && (
        <CheckCircle className="h-5 w-5 text-green-500" />
      )}
      {status === "error" && <XCircle className="h-5 w-5 text-red-500" />}

      <div className="flex flex-col">
        <span className="text-sm font-medium">{message}</span>
        {deployHash && explorerUrl && (
          <a
            href={`${explorerUrl}/${deployHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            View on Explorer
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
        {action && (
          <button
            onClick={action.onClick}
            className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
          >
            {action.label}
            <ExternalLink className="h-3 w-3" />
          </button>
        )}
      </div>

      <button
        onClick={() => {
          setIsVisible(false);
          onClose?.();
        }}
        className="ml-2 text-muted-foreground hover:text-foreground"
      >
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  );
}

// Hook for managing transaction toasts
export function useTransactionToast() {
  const [toast, setToast] = useState<{
    status: TransactionStatus;
    message: string;
    deployHash?: string;
    action?: TransactionToastAction;
    explorerBaseUrl?: string;
  } | null>(null);

  const showToast = (
    status: TransactionStatus,
    message: string,
    options?: {
      deployHash?: string;
      action?: TransactionToastAction;
      explorerBaseUrl?: string;
    }
  ) => {
    setToast({ status, message, ...options });
  };

  const hideToast = () => {
    setToast(null);
  };

  const ToastComponent = toast ? (
    <TransactionToast
      status={toast.status}
      message={toast.message}
      deployHash={toast.deployHash}
      action={toast.action}
      explorerBaseUrl={toast.explorerBaseUrl}
      onClose={hideToast}
    />
  ) : null;

  return { showToast, hideToast, ToastComponent };
}
