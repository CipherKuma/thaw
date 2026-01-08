// Thaw Protocol Types

export interface WithdrawalRequest {
  id: number;
  user: string;
  csprAmount: bigint;
  thcsprBurned: bigint;
  requestTimestamp: number;
  claimableTimestamp: number;
  claimed: boolean;
}

export interface PoolStats {
  totalPooledCspr: bigint;
  totalThcsprSupply: bigint;
  exchangeRate: bigint;
  protocolFeeBps: number;
  minStake: bigint;
  isPaused: boolean;
}

export interface UserState {
  csprBalance: bigint;
  thcsprBalance: bigint;
  pendingWithdrawals: WithdrawalRequest[];
}

export interface StakeParams {
  amount: bigint;
}

export interface UnstakeParams {
  thcsprAmount: bigint;
}

export interface ClaimParams {
  withdrawalId: number;
}

// Casper Wallet Types
export interface CasperWallet {
  isConnected: boolean;
  publicKey: string | null;
  accountHash: string | null;
}

export interface TransactionResult {
  deployHash: string;
  success: boolean;
  error?: string;
}

// Lending Pool Types
export interface LendingPoolStats {
  totalDeposits: bigint;
  totalBorrowed: bigint;
  availableLiquidity: bigint;
  utilizationRate: number;
  collateralFactor: number;
  liquidationThreshold: number;
  liquidationBonus: number;
  baseRate: number;
}

export interface UserPosition {
  collateral: bigint;
  borrowed: bigint;
  healthFactor: bigint;
  maxBorrow: bigint;
  lenderDeposit: bigint;
}

// Leverage Types
export interface LeverageParams {
  amount: bigint;
  loops: number;
}

// Borrow Types
export interface DepositCollateralParams {
  amount: bigint;
}

export interface BorrowParams {
  amount: bigint;
}

export interface RepayParams {
  amount: bigint;
}

// Lend Types
export interface LendDepositParams {
  amount: bigint;
}

export interface LendWithdrawParams {
  amount: bigint;
}
