import fs from "node:fs";
import path from "node:path";
import { createWalletClient, createPublicClient, http, type Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const root = path.resolve(import.meta.dirname, "..");
const buildDir = path.join(root, "build");
const deploymentPath = path.join(root, "deployed-addresses.json");

/** Settlement micro-payment per verified job: 0.10 mUSDC (token has 6 decimals). */
export const SETTLEMENT_AMOUNT = 100000n;
export const RPC_URL = process.env.RPC_URL || "https://sepolia.base.org";
export const EXPLORER = "https://sepolia.basescan.org/tx/";

export interface Deployment {
  chainId: number;
  rpcUrl: string;
  identityRegistry: `0x${string}`;
  mockUSDC: `0x${string}`;
  settlement: `0x${string}`;
  master: { address: `0x${string}`; agentId: number };
  worker: { address: `0x${string}`; agentId: number; privateKey: `0x${string}` };
}

export function artifact(name: string): { abi: Abi; bytecode: `0x${string}` } {
  return JSON.parse(fs.readFileSync(path.join(buildDir, `${name}.json`), "utf8"));
}

export function loadDeployment(): Deployment | null {
  if (!fs.existsSync(deploymentPath)) return null;
  return JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
}

/** True when a deployer key, build artifacts, and a deployment file are all present. */
export function isChainReady(): boolean {
  return (
    !!process.env.DEPLOYER_PRIVATE_KEY &&
    fs.existsSync(path.join(buildDir, "Settlement.json")) &&
    loadDeployment() !== null
  );
}

export function getClients() {
  const rawKey = process.env.DEPLOYER_PRIVATE_KEY!;
  const key = (rawKey.startsWith("0x") ? rawKey : "0x" + rawKey) as `0x${string}`;
  const master = privateKeyToAccount(key);
  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });
  const wallet = createWalletClient({ account: master, chain: baseSepolia, transport: http(RPC_URL) });
  return { master, publicClient, wallet };
}
