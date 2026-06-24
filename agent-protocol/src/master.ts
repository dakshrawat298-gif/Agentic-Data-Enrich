import { keccak256, toBytes } from "viem";
import { baseSepolia } from "viem/chains";
import { validateRecord, type ValidationResult } from "./schema";
import { artifact, getClients, isChainReady, loadDeployment, SETTLEMENT_AMOUNT, EXPLORER } from "./chain";

/**
 * Master agent. Verifies Worker output deterministically (NO LLM), and on success
 * settles an x402-style on-chain micro-payment to the Worker's ERC-8004 identity.
 * When no chain is configured, settlement is simulated so the loop still runs.
 */

export function verify(record: unknown): ValidationResult {
  return validateRecord(record);
}

export interface SettlementResult {
  simulated: boolean;
  amount: bigint;
  worker: string;
  txHash?: `0x${string}`;
  explorerUrl?: string;
}

export async function settle(jobLabel: string): Promise<SettlementResult> {
  const deployment = loadDeployment();
  const amount = SETTLEMENT_AMOUNT;

  if (!isChainReady() || !deployment) {
    return { simulated: true, amount, worker: deployment?.worker.address ?? "unregistered" };
  }

  const { publicClient, wallet, master } = getClients();
  const settlementAbi = artifact("Settlement").abi;
  const jobId = keccak256(toBytes(jobLabel));

  const hash = await wallet.writeContract({
    address: deployment.settlement,
    abi: settlementAbi,
    functionName: "settle",
    args: [BigInt(deployment.worker.agentId), jobId, amount],
    account: master,
    chain: baseSepolia,
  });
  await publicClient.waitForTransactionReceipt({ hash });

  return { simulated: false, amount, worker: deployment.worker.address, txHash: hash, explorerUrl: EXPLORER + hash };
}
