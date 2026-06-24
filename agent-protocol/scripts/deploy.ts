import fs from "node:fs";
import path from "node:path";
import { createWalletClient, createPublicClient, http, type Abi } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { baseSepolia } from "viem/chains";

const root = path.resolve(import.meta.dirname, "..");
const buildDir = path.join(root, "build");

function artifact(name: string): { abi: Abi; bytecode: `0x${string}` } {
  return JSON.parse(fs.readFileSync(path.join(buildDir, `${name}.json`), "utf8"));
}

const RPC_URL = process.env.RPC_URL || "https://sepolia.base.org";
const rawKey = process.env.DEPLOYER_PRIVATE_KEY;
if (!rawKey) {
  console.error("DEPLOYER_PRIVATE_KEY is not set. Add it as a secret, then re-run deploy.");
  process.exit(1);
}
const deployerKey = (rawKey.startsWith("0x") ? rawKey : "0x" + rawKey) as `0x${string}`;
const master = privateKeyToAccount(deployerKey);

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(RPC_URL) });
const wallet = createWalletClient({ account: master, chain: baseSepolia, transport: http(RPC_URL) });

async function deploy(name: string, args: unknown[] = []): Promise<`0x${string}`> {
  const art = artifact(name);
  const hash = await wallet.deployContract({ abi: art.abi, bytecode: art.bytecode, args });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (!receipt.contractAddress) throw new Error(`${name} deployment produced no address`);
  console.log(`deployed ${name} -> ${receipt.contractAddress}`);
  return receipt.contractAddress;
}

async function send(address: `0x${string}`, abi: Abi, functionName: string, args: unknown[]): Promise<void> {
  const hash = await wallet.writeContract({ address, abi, functionName, args, account: master, chain: baseSepolia });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${functionName} reverted (tx ${hash})`);
}

/** Read an agentId, retrying to tolerate public-RPC read lag right after a write. */
async function readAgentId(registry: `0x${string}`, abi: Abi, agent: `0x${string}`): Promise<bigint> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = (await publicClient.readContract({ address: registry, abi, functionName: "agentId", args: [agent] })) as bigint;
    if (id !== 0n) return id;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`agentId for ${agent} still 0 after retries`);
}

const balance = await publicClient.getBalance({ address: master.address });
console.log(`Deployer (Master) ${master.address}`);
console.log(`Balance: ${balance} wei on Base Sepolia`);
if (balance === 0n) {
  console.error("Deployer has 0 testnet ETH. Fund it from a Base Sepolia faucet, then re-run.");
  process.exit(1);
}

const registryAddr = await deploy("IdentityRegistry");
const tokenAddr = await deploy("MockUSDC");
const settlementAddr = await deploy("Settlement", [registryAddr, tokenAddr]);

const registryAbi = artifact("IdentityRegistry").abi;
const tokenAbi = artifact("MockUSDC").abi;

// Worker identity — a testnet-only throwaway account. It only ever RECEIVES tokens,
// so it never needs gas. Its private key is stored in the gitignored deployment file.
const workerKey = generatePrivateKey();
const worker = privateKeyToAccount(workerKey);

await send(registryAddr, registryAbi, "register", [master.address, "master.goat.local"]);
await send(registryAddr, registryAbi, "register", [worker.address, "worker.goat.local"]);

const masterAgentId = await readAgentId(registryAddr, registryAbi, master.address);
const workerAgentId = await readAgentId(registryAddr, registryAbi, worker.address);

const MINT = 1000n * 10n ** 6n; // 1000 mUSDC
const MAX = 2n ** 256n - 1n;
await send(tokenAddr, tokenAbi, "mint", [master.address, MINT]);
await send(tokenAddr, tokenAbi, "approve", [settlementAddr, MAX]);

const deployment = {
  chainId: baseSepolia.id,
  rpcUrl: RPC_URL,
  identityRegistry: registryAddr,
  mockUSDC: tokenAddr,
  settlement: settlementAddr,
  master: { address: master.address, agentId: Number(masterAgentId) },
  worker: { address: worker.address, agentId: Number(workerAgentId), privateKey: workerKey },
};

fs.writeFileSync(path.join(root, "deployed-addresses.json"), JSON.stringify(deployment, null, 2));
console.log("\nRegistered Master agent #" + masterAgentId + " and Worker agent #" + workerAgentId);
console.log("Minted 1000 mUSDC to Master and approved the Settlement contract.");
console.log("Wrote agent-protocol/deployed-addresses.json");
