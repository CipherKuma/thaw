// Casper SDK Configuration and Utilities

import {
  CasperClient,
  CLPublicKey,
  DeployUtil,
  RuntimeArgs,
  CLValueBuilder,
  CLU512,
  CLU64,
} from "casper-js-sdk";

// Network configuration - can be switched between localnet/testnet/mainnet
export const NETWORK_CONFIG = {
  localnet: {
    nodeUrl: "http://localhost:11101/rpc",
    chainName: "casper-net-1",
  },
  testnet: {
    nodeUrl: "https://node.testnet.casper.network/rpc",
    chainName: "casper-test",
  },
  mainnet: {
    nodeUrl: "https://node.mainnet.casper.network/rpc",
    chainName: "casper",
  },
} as const;

// Current network (change this to switch networks)
export const CURRENT_NETWORK: keyof typeof NETWORK_CONFIG = "testnet";

export const CASPER_NODE_URL = NETWORK_CONFIG[CURRENT_NETWORK].nodeUrl;
export const CASPER_CHAIN_NAME = NETWORK_CONFIG[CURRENT_NETWORK].chainName;

// Contract hashes (to be updated after deployment)
// Format: "hash-<hex>" for contract hashes
export const THAW_CORE_HASH: string = "hash-6dcfc9d903e1c8757503b44f0bd104fcbbe2cd9807dcdf0fe4e9044382596b79";
export const THCSPR_TOKEN_HASH: string = "hash-075f46fd3f4a5f382e8083dfd8ac9bbe9af012c0bc7acef2d84186be337f789e";
export const LENDING_POOL_HASH: string = ""; // Optional: Not yet deployed

// Contract package hashes (if using versioned contracts)
export const THAW_CORE_PACKAGE_HASH: string = "";
export const THCSPR_TOKEN_PACKAGE_HASH: string = "";
export const LENDING_POOL_PACKAGE_HASH: string = "";

// Gas costs in motes (adjust based on actual deployment costs)
export const GAS_COSTS = {
  stake: BigInt(5_000_000_000), // 5 CSPR
  unstake: BigInt(3_000_000_000), // 3 CSPR
  claim: BigInt(2_000_000_000), // 2 CSPR
  compound: BigInt(5_000_000_000), // 5 CSPR
  lendingDeposit: BigInt(3_000_000_000), // 3 CSPR
  lendingWithdraw: BigInt(3_000_000_000), // 3 CSPR
  depositCollateral: BigInt(4_000_000_000), // 4 CSPR
  withdrawCollateral: BigInt(3_000_000_000), // 3 CSPR
  borrow: BigInt(4_000_000_000), // 4 CSPR
  repay: BigInt(3_000_000_000), // 3 CSPR
  leverageStake: BigInt(15_000_000_000), // 15 CSPR (complex operation)
  liquidate: BigInt(10_000_000_000), // 10 CSPR
  approve: BigInt(1_000_000_000), // 1 CSPR
};

// Create Casper client
export function createCasperClient(): CasperClient {
  return new CasperClient(CASPER_NODE_URL);
}

// Parse public key from hex string
export function parsePublicKey(publicKeyHex: string): CLPublicKey {
  return CLPublicKey.fromHex(publicKeyHex);
}

// Get account hash from public key
export function getAccountHash(publicKey: CLPublicKey): string {
  return publicKey.toAccountHashStr();
}

// Format deploy for signing (returns the full deploy JSON object)
export function formatDeploy(deploy: DeployUtil.Deploy): { deploy: unknown } {
  return DeployUtil.deployToJson(deploy);
}

// Motes conversion utilities
export const MOTES_PER_CSPR = BigInt(1_000_000_000);

export function csprToMotes(cspr: number | string): bigint {
  const csprNum = typeof cspr === "string" ? parseFloat(cspr) : cspr;
  return BigInt(Math.floor(csprNum * Number(MOTES_PER_CSPR)));
}

export function motesToCspr(motes: bigint | string): number {
  const motesNum = typeof motes === "string" ? BigInt(motes) : motes;
  return Number(motesNum) / Number(MOTES_PER_CSPR);
}

// Exchange rate precision (1e18)
export const EXCHANGE_RATE_PRECISION = BigInt("1000000000000000000");

export function calculateThcsprFromCspr(
  csprAmount: bigint,
  totalPooled: bigint,
  totalSupply: bigint
): bigint {
  if (totalSupply === BigInt(0) || totalPooled === BigInt(0)) {
    return csprAmount;
  }
  return (csprAmount * totalSupply) / totalPooled;
}

export function calculateCsprFromThcspr(
  thcsprAmount: bigint,
  totalPooled: bigint,
  totalSupply: bigint
): bigint {
  if (totalSupply === BigInt(0)) {
    return BigInt(0);
  }
  return (thcsprAmount * totalPooled) / totalSupply;
}

// ============================================
// Deploy Builders for ThawCore Contract
// ============================================

export function buildStakeDeploy(
  senderPublicKey: CLPublicKey,
  amount: bigint
): DeployUtil.Deploy {
  if (!THAW_CORE_HASH) {
    throw new Error("ThawCore contract hash not configured");
  }

  const args = RuntimeArgs.fromMap({});

  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(senderPublicKey, CASPER_CHAIN_NAME),
    DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      Uint8Array.from(Buffer.from(THAW_CORE_HASH.replace("hash-", ""), "hex")),
      "stake",
      args
    ),
    DeployUtil.standardPayment(GAS_COSTS.stake + amount) // Payment includes stake amount
  );

  return deploy;
}

export function buildUnstakeDeploy(
  senderPublicKey: CLPublicKey,
  thcsprAmount: bigint
): DeployUtil.Deploy {
  if (!THAW_CORE_HASH) {
    throw new Error("ThawCore contract hash not configured");
  }

  const args = RuntimeArgs.fromMap({
    thcspr_amount: new CLU512(thcsprAmount),
  });

  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(senderPublicKey, CASPER_CHAIN_NAME),
    DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      Uint8Array.from(Buffer.from(THAW_CORE_HASH.replace("hash-", ""), "hex")),
      "unstake",
      args
    ),
    DeployUtil.standardPayment(GAS_COSTS.unstake)
  );

  return deploy;
}

export function buildClaimDeploy(
  senderPublicKey: CLPublicKey,
  withdrawalId: number
): DeployUtil.Deploy {
  if (!THAW_CORE_HASH) {
    throw new Error("ThawCore contract hash not configured");
  }

  const args = RuntimeArgs.fromMap({
    withdrawal_id: new CLU64(BigInt(withdrawalId)),
  });

  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(senderPublicKey, CASPER_CHAIN_NAME),
    DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      Uint8Array.from(Buffer.from(THAW_CORE_HASH.replace("hash-", ""), "hex")),
      "claim",
      args
    ),
    DeployUtil.standardPayment(GAS_COSTS.claim)
  );

  return deploy;
}

export function buildCompoundDeploy(
  senderPublicKey: CLPublicKey
): DeployUtil.Deploy {
  if (!THAW_CORE_HASH) {
    throw new Error("ThawCore contract hash not configured");
  }

  const args = RuntimeArgs.fromMap({});

  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(senderPublicKey, CASPER_CHAIN_NAME),
    DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      Uint8Array.from(Buffer.from(THAW_CORE_HASH.replace("hash-", ""), "hex")),
      "compound",
      args
    ),
    DeployUtil.standardPayment(GAS_COSTS.compound)
  );

  return deploy;
}

// ============================================
// Deploy Builders for ThCsprToken Contract
// ============================================

export function buildApproveDeploy(
  senderPublicKey: CLPublicKey,
  spender: string, // contract hash or account hash
  amount: bigint
): DeployUtil.Deploy {
  if (!THCSPR_TOKEN_HASH) {
    throw new Error("ThCsprToken contract hash not configured");
  }

  const args = RuntimeArgs.fromMap({
    spender: CLValueBuilder.key(
      CLValueBuilder.byteArray(
        Uint8Array.from(Buffer.from(spender.replace(/^(hash-|account-hash-)/, ""), "hex"))
      )
    ),
    amount: CLValueBuilder.u256(amount),
  });

  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(senderPublicKey, CASPER_CHAIN_NAME),
    DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      Uint8Array.from(Buffer.from(THCSPR_TOKEN_HASH.replace("hash-", ""), "hex")),
      "approve",
      args
    ),
    DeployUtil.standardPayment(GAS_COSTS.approve)
  );

  return deploy;
}

// ============================================
// Deploy Builders for LendingPool Contract
// ============================================

export function buildLendingDepositDeploy(
  senderPublicKey: CLPublicKey,
  amount: bigint
): DeployUtil.Deploy {
  if (!LENDING_POOL_HASH) {
    throw new Error("LendingPool contract hash not configured");
  }

  const args = RuntimeArgs.fromMap({});

  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(senderPublicKey, CASPER_CHAIN_NAME),
    DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      Uint8Array.from(Buffer.from(LENDING_POOL_HASH.replace("hash-", ""), "hex")),
      "deposit",
      args
    ),
    DeployUtil.standardPayment(GAS_COSTS.lendingDeposit + amount)
  );

  return deploy;
}

export function buildLendingWithdrawDeploy(
  senderPublicKey: CLPublicKey,
  amount: bigint
): DeployUtil.Deploy {
  if (!LENDING_POOL_HASH) {
    throw new Error("LendingPool contract hash not configured");
  }

  const args = RuntimeArgs.fromMap({
    amount: new CLU512(amount),
  });

  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(senderPublicKey, CASPER_CHAIN_NAME),
    DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      Uint8Array.from(Buffer.from(LENDING_POOL_HASH.replace("hash-", ""), "hex")),
      "withdraw",
      args
    ),
    DeployUtil.standardPayment(GAS_COSTS.lendingWithdraw)
  );

  return deploy;
}

export function buildDepositCollateralDeploy(
  senderPublicKey: CLPublicKey,
  amount: bigint
): DeployUtil.Deploy {
  if (!LENDING_POOL_HASH) {
    throw new Error("LendingPool contract hash not configured");
  }

  const args = RuntimeArgs.fromMap({
    amount: new CLU512(amount),
  });

  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(senderPublicKey, CASPER_CHAIN_NAME),
    DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      Uint8Array.from(Buffer.from(LENDING_POOL_HASH.replace("hash-", ""), "hex")),
      "deposit_collateral",
      args
    ),
    DeployUtil.standardPayment(GAS_COSTS.depositCollateral)
  );

  return deploy;
}

export function buildWithdrawCollateralDeploy(
  senderPublicKey: CLPublicKey,
  amount: bigint
): DeployUtil.Deploy {
  if (!LENDING_POOL_HASH) {
    throw new Error("LendingPool contract hash not configured");
  }

  const args = RuntimeArgs.fromMap({
    amount: new CLU512(amount),
  });

  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(senderPublicKey, CASPER_CHAIN_NAME),
    DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      Uint8Array.from(Buffer.from(LENDING_POOL_HASH.replace("hash-", ""), "hex")),
      "withdraw_collateral",
      args
    ),
    DeployUtil.standardPayment(GAS_COSTS.withdrawCollateral)
  );

  return deploy;
}

export function buildBorrowDeploy(
  senderPublicKey: CLPublicKey,
  amount: bigint
): DeployUtil.Deploy {
  if (!LENDING_POOL_HASH) {
    throw new Error("LendingPool contract hash not configured");
  }

  const args = RuntimeArgs.fromMap({
    amount: new CLU512(amount),
  });

  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(senderPublicKey, CASPER_CHAIN_NAME),
    DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      Uint8Array.from(Buffer.from(LENDING_POOL_HASH.replace("hash-", ""), "hex")),
      "borrow",
      args
    ),
    DeployUtil.standardPayment(GAS_COSTS.borrow)
  );

  return deploy;
}

export function buildRepayDeploy(
  senderPublicKey: CLPublicKey,
  amount: bigint
): DeployUtil.Deploy {
  if (!LENDING_POOL_HASH) {
    throw new Error("LendingPool contract hash not configured");
  }

  const args = RuntimeArgs.fromMap({});

  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(senderPublicKey, CASPER_CHAIN_NAME),
    DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      Uint8Array.from(Buffer.from(LENDING_POOL_HASH.replace("hash-", ""), "hex")),
      "repay",
      args
    ),
    DeployUtil.standardPayment(GAS_COSTS.repay + amount)
  );

  return deploy;
}

export function buildLeverageStakeDeploy(
  senderPublicKey: CLPublicKey,
  amount: bigint,
  loops: number
): DeployUtil.Deploy {
  if (!LENDING_POOL_HASH) {
    throw new Error("LendingPool contract hash not configured");
  }

  if (loops < 1 || loops > 4) {
    throw new Error("Loops must be between 1 and 4");
  }

  const args = RuntimeArgs.fromMap({
    loops: CLValueBuilder.u8(loops),
  });

  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(senderPublicKey, CASPER_CHAIN_NAME),
    DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      Uint8Array.from(Buffer.from(LENDING_POOL_HASH.replace("hash-", ""), "hex")),
      "leverage_stake",
      args
    ),
    DeployUtil.standardPayment(GAS_COSTS.leverageStake + amount)
  );

  return deploy;
}

export function buildLiquidateDeploy(
  senderPublicKey: CLPublicKey,
  borrower: string,
  repayAmount: bigint
): DeployUtil.Deploy {
  if (!LENDING_POOL_HASH) {
    throw new Error("LendingPool contract hash not configured");
  }

  const args = RuntimeArgs.fromMap({
    borrower: CLValueBuilder.key(
      CLValueBuilder.byteArray(
        Uint8Array.from(Buffer.from(borrower.replace(/^(hash-|account-hash-)/, ""), "hex"))
      )
    ),
  });

  const deploy = DeployUtil.makeDeploy(
    new DeployUtil.DeployParams(senderPublicKey, CASPER_CHAIN_NAME),
    DeployUtil.ExecutableDeployItem.newStoredContractByHash(
      Uint8Array.from(Buffer.from(LENDING_POOL_HASH.replace("hash-", ""), "hex")),
      "liquidate",
      args
    ),
    DeployUtil.standardPayment(GAS_COSTS.liquidate + repayAmount)
  );

  return deploy;
}

// ============================================
// Contract State Queries
// ============================================

export interface PoolStats {
  totalPooledCspr: bigint;
  totalThcsprSupply: bigint;
  exchangeRate: bigint;
  protocolFeeBps: number;
  minStake: bigint;
  isPaused: boolean;
}

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

export interface WithdrawalRequest {
  id: number;
  user: string;
  csprAmount: bigint;
  thcsprBurned: bigint;
  requestTimestamp: number;
  claimableTimestamp: number;
  claimed: boolean;
}

// Query contract state via RPC
async function queryContractState(
  contractHash: string,
  key: string
): Promise<unknown> {
  const client = createCasperClient();

  try {
    const stateRootHash = await client.nodeClient.getStateRootHash();
    const result = await client.nodeClient.getBlockState(
      stateRootHash,
      `${contractHash}/${key}`,
      []
    );
    return result;
  } catch (error) {
    console.error(`Failed to query ${key}:`, error);
    return null;
  }
}

// Query dictionary value
async function queryDictionary(
  contractHash: string,
  dictionaryName: string,
  dictionaryKey: string
): Promise<unknown> {
  const client = createCasperClient();

  try {
    const stateRootHash = await client.nodeClient.getStateRootHash();
    const result = await client.nodeClient.getDictionaryItemByName(
      stateRootHash,
      contractHash,
      dictionaryName,
      dictionaryKey
    );
    return result;
  } catch (error) {
    console.error(`Failed to query dictionary ${dictionaryName}/${dictionaryKey}:`, error);
    return null;
  }
}

export async function getPoolStats(): Promise<PoolStats> {
  if (!THAW_CORE_HASH) {
    // Return mock data if contract not deployed
    return {
      totalPooledCspr: BigInt("1000000000000000"),
      totalThcsprSupply: BigInt("952380952380952"),
      exchangeRate: BigInt("1050000000000000000"),
      protocolFeeBps: 1000,
      minStake: BigInt("10000000000"),
      isPaused: false,
    };
  }

  try {
    const [totalPooled, totalSupply, feeBps, minStake, isPaused] = await Promise.all([
      queryContractState(THAW_CORE_HASH, "total_pooled_cspr"),
      queryContractState(THAW_CORE_HASH, "total_thcspr_supply"),
      queryContractState(THAW_CORE_HASH, "protocol_fee_bps"),
      queryContractState(THAW_CORE_HASH, "min_stake"),
      queryContractState(THAW_CORE_HASH, "is_paused"),
    ]);

    const totalPooledBigInt = BigInt(String(totalPooled || "0"));
    const totalSupplyBigInt = BigInt(String(totalSupply || "0"));

    let exchangeRate = EXCHANGE_RATE_PRECISION;
    if (totalSupplyBigInt > 0) {
      exchangeRate = (totalPooledBigInt * EXCHANGE_RATE_PRECISION) / totalSupplyBigInt;
    }

    return {
      totalPooledCspr: totalPooledBigInt,
      totalThcsprSupply: totalSupplyBigInt,
      exchangeRate,
      protocolFeeBps: Number(feeBps || 1000),
      minStake: BigInt(String(minStake || "10000000000")),
      isPaused: Boolean(isPaused),
    };
  } catch (error) {
    console.error("Failed to get pool stats:", error);
    throw error;
  }
}

export async function getLendingPoolStats(): Promise<LendingPoolStats> {
  if (!LENDING_POOL_HASH) {
    // Return mock data if contract not deployed
    return {
      totalDeposits: BigInt("500000000000000"),
      totalBorrowed: BigInt("200000000000000"),
      availableLiquidity: BigInt("300000000000000"),
      utilizationRate: 40,
      collateralFactor: 75,
      liquidationThreshold: 80,
      liquidationBonus: 5,
      baseRate: 5,
    };
  }

  try {
    const [totalDeposits, totalBorrowed] = await Promise.all([
      queryContractState(LENDING_POOL_HASH, "total_deposits"),
      queryContractState(LENDING_POOL_HASH, "total_borrowed"),
    ]);

    const totalDepositsBigInt = BigInt(String(totalDeposits || "0"));
    const totalBorrowedBigInt = BigInt(String(totalBorrowed || "0"));
    const availableLiquidity = totalDepositsBigInt - totalBorrowedBigInt;

    const utilizationRate = totalDepositsBigInt > 0
      ? Number((totalBorrowedBigInt * BigInt(100)) / totalDepositsBigInt)
      : 0;

    return {
      totalDeposits: totalDepositsBigInt,
      totalBorrowed: totalBorrowedBigInt,
      availableLiquidity,
      utilizationRate,
      collateralFactor: 75,
      liquidationThreshold: 80,
      liquidationBonus: 5,
      baseRate: 5,
    };
  } catch (error) {
    console.error("Failed to get lending pool stats:", error);
    throw error;
  }
}

export async function getUserPosition(accountHash: string): Promise<UserPosition> {
  if (!LENDING_POOL_HASH) {
    // Return mock data if contract not deployed
    return {
      collateral: BigInt(0),
      borrowed: BigInt(0),
      healthFactor: EXCHANGE_RATE_PRECISION,
      maxBorrow: BigInt(0),
      lenderDeposit: BigInt(0),
    };
  }

  try {
    const [collateral, borrowed, lenderDeposit] = await Promise.all([
      queryDictionary(LENDING_POOL_HASH, "collateral_balances", accountHash),
      queryDictionary(LENDING_POOL_HASH, "borrowed_balances", accountHash),
      queryDictionary(LENDING_POOL_HASH, "lender_deposits", accountHash),
    ]);

    const collateralBigInt = BigInt(String(collateral || "0"));
    const borrowedBigInt = BigInt(String(borrowed || "0"));

    // Calculate health factor
    let healthFactor = EXCHANGE_RATE_PRECISION * BigInt(10); // Very healthy if no debt
    if (borrowedBigInt > 0) {
      const collateralValue = (collateralBigInt * BigInt(80)) / BigInt(100); // 80% liquidation threshold
      healthFactor = (collateralValue * EXCHANGE_RATE_PRECISION) / borrowedBigInt;
    }

    // Calculate max borrow (75% collateral factor)
    const maxBorrow = (collateralBigInt * BigInt(75)) / BigInt(100) - borrowedBigInt;

    return {
      collateral: collateralBigInt,
      borrowed: borrowedBigInt,
      healthFactor,
      maxBorrow: maxBorrow > 0 ? maxBorrow : BigInt(0),
      lenderDeposit: BigInt(String(lenderDeposit || "0")),
    };
  } catch (error) {
    console.error("Failed to get user position:", error);
    throw error;
  }
}

export async function getUserWithdrawals(accountHash: string): Promise<WithdrawalRequest[]> {
  if (!THAW_CORE_HASH) {
    return [];
  }

  try {
    const withdrawalIds = await queryDictionary(
      THAW_CORE_HASH,
      "user_withdrawals",
      accountHash
    );

    if (!withdrawalIds || !Array.isArray(withdrawalIds)) {
      return [];
    }

    const withdrawals = await Promise.all(
      (withdrawalIds as number[]).map(async (id) => {
        const withdrawal = await queryDictionary(
          THAW_CORE_HASH,
          "withdrawals",
          id.toString()
        );
        return withdrawal as WithdrawalRequest;
      })
    );

    return withdrawals.filter(Boolean);
  } catch (error) {
    console.error("Failed to get user withdrawals:", error);
    return [];
  }
}

export async function getTokenBalance(
  accountHash: string,
  tokenHash: string = THCSPR_TOKEN_HASH
): Promise<bigint> {
  if (!tokenHash) {
    return BigInt(0);
  }

  try {
    const balance = await queryDictionary(tokenHash, "balances", accountHash);
    return BigInt(String(balance || "0"));
  } catch (error) {
    console.error("Failed to get token balance:", error);
    return BigInt(0);
  }
}

// ============================================
// Deploy Submission
// ============================================

export async function submitDeploy(
  deploy: DeployUtil.Deploy,
  signature: string
): Promise<string> {
  const client = createCasperClient();

  // Convert hex signature string to Uint8Array
  const signatureBytes = Uint8Array.from(
    Buffer.from(signature.replace(/^0x/, ""), "hex")
  );

  // Add the signature to the deploy
  const signedDeploy = DeployUtil.setSignature(
    deploy,
    signatureBytes,
    deploy.header.account
  );

  // Submit the deploy
  const result = await client.putDeploy(signedDeploy);
  return result;
}

export async function waitForDeployExecution(
  deployHash: string,
  timeoutMs: number = 300000
): Promise<{ success: boolean; errorMessage?: string }> {
  const client = createCasperClient();
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await client.nodeClient.getDeployInfo(deployHash);

      if (result.execution_results && result.execution_results.length > 0) {
        const execResult = result.execution_results[0].result;

        if ("Success" in execResult) {
          return { success: true };
        } else if ("Failure" in execResult) {
          return {
            success: false,
            errorMessage: execResult.Failure?.error_message ?? "Unknown error",
          };
        }
      }
    } catch {
      // Deploy not found yet, continue waiting
    }

    await new Promise((resolve) => setTimeout(resolve, 5000));
  }

  return { success: false, errorMessage: "Timeout waiting for deploy execution" };
}
