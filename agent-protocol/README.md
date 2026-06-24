# Agentic Data-Enrichment Protocol — Phase 1 MVP

> A two-agent protocol where an **LLM Worker** performs fuzzy extraction of messy data, a **deterministic Master** verifies the output shape with no LLM in the loop, and an on-chain **Settlement contract** executes an x402-style ERC-20 micro-payment to the Worker's on-chain identity. Built and verified on **Base Sepolia** testnet.

This is an honest **Phase 1 MVP**. It demonstrates a working end-to-end loop — real LLM enrichment, real deterministic gating, and real on-chain value transfer with replay protection — using deliberate simplifications (mock token, single operator, off-chain verification). See [§ Honest scope & limitations](#honest-scope--limitations) for exactly what is real versus simplified. A full execution-level audit lives in [`notebookllm_audit_report.md`](./notebookllm_audit_report.md).

---

## Architecture — separation of concerns

The core thesis is a clean split between **fuzzy work**, **deterministic gating**, and **on-chain settlement**:

```
  raw CSV row (messy, unstructured)
          │
          ▼
  ┌───────────────────┐   stochastic / probabilistic
  │  WORKER  (LLM)     │   gpt-5-nano via Replit OpenAI proxy
  │  worker.ts         │   messy text  ->  clean JSON
  └───────────────────┘   NO chain access
          │ {name,email,company,role,location}
          ▼
  ┌───────────────────┐   100% deterministic — NO LLM
  │  MASTER  (verify)  │   required-field + email-regex checks
  │  master.ts/schema  │   pass -> settle | fail -> withhold
  └───────────────────┘
          │ verified  ──────────────► (fail: payment withheld, no tx)
          ▼
  ┌───────────────────┐   on-chain, Base Sepolia
  │  SETTLEMENT (pay)  │   settle(workerAgentId, jobId, amount)
  │  Settlement.sol    │   replay guard + caller auth + ERC-20 transfer
  └───────────────────┘
          │ JobSettled event + mUSDC transfer
          ▼
   Worker's ERC-8004 identity receives 0.1 mUSDC
```

**Why this separation matters:** the expensive/unreliable component (the LLM) is isolated to extraction only. The money gate is a deterministic, auditable code path with no model in it. The blockchain provides tamper-evident finality, replay protection, and a public audit log of every payment — it does **not** itself judge the work (verification is off-chain; see limitations).

### Repository layout

| Path | Responsibility |
|------|----------------|
| `contracts/IdentityRegistry.sol` | ERC-8004-style on-chain agent identities |
| `contracts/MockUSDC.sol` | 6-decimal ERC-20 settlement token (testnet mock) |
| `contracts/Settlement.sol` | x402-style settlement entrypoint (replay-guarded) |
| `src/worker.ts` | LLM enrichment (messy text → clean JSON) |
| `src/master.ts` | Deterministic verification + on-chain settlement call |
| `src/schema.ts` | Target shape + pure rule-based validator |
| `src/chain.ts` | viem clients, addresses, deployment loader |
| `src/harness.ts` | Sequential orchestration loop (entrypoint) |
| `scripts/compile.ts` | Solidity compilation via `solc-js` |
| `scripts/deploy.ts` | Deploy + register agents + mint/approve via `viem` |
| `data/raw.csv` | 5-row trigger dataset (row 5 has no email) |

---

## Smart contracts

All three contracts are **self-contained** (no external imports / no OpenZeppelin) to minimize bytecode and keep the build trivial. Solidity `^0.8.20`, optimizer enabled (`runs: 200`).

### `IdentityRegistry.sol` — ERC-8004-style identity
A minimal sequential registry mapping `address ↔ agentId ↔ domain`, emitting `AgentRegistered`.
- `register(address agent, string domain) → uint256 id` — assigns the next sequential id; guards zero-address and double-registration.
- `resolve(uint256 id) → address` — reverts on unknown id.
- **Phase 1 scope:** only the Identity Registry is implemented. The Reputation and Validation registries from the full ERC-8004 design are **not** present. Registration is permissionless (not bound to `msg.sender`) — acceptable for the single-operator MVP, documented as a known limitation.

### `MockUSDC.sol` — settlement token
A hand-rolled minimal ERC-20 with **6 decimals** to mirror USDC.
- Standard `transfer` / `approve` / `transferFrom` / `balanceOf` / `allowance`, plus `Transfer` / `Approval` events.
- `transferFrom` supports the infinite-approval optimization (no allowance decrement when allowance is `type(uint256).max`).
- **Testnet only:** `mint()` is intentionally public so the Master can be funded without a faucet. This makes the token economically meaningless by design — never deploy this to mainnet.

### `Settlement.sol` — x402-style settlement
The payment entrypoint the Master calls **after** off-chain verification.
- `settle(uint256 workerAgentId, bytes32 jobId, uint256 amount)`:
  1. `require(registry.agentId(msg.sender) != 0)` — caller must be a registered agent (**authorization**).
  2. `require(!settled[jobId])` — **replay protection**.
  3. resolves the Worker, `require(worker != msg.sender)` — no self-payment.
  4. sets `settled[jobId] = true` **before** the external call (checks-effects-interactions → reentrancy-safe) then `token.transferFrom(msg.sender, worker, amount)`.
  5. emits `JobSettled(jobId, masterAgentId, workerAgentId, worker, amount)`.
- Because the transfer uses `transferFrom(msg.sender, …)`, a caller can only ever spend its **own** approved balance — no third-party fund theft.

### Tooling choice: `solc-js` + `viem` (not Hardhat/Foundry)
Compute efficiency was a hard constraint (this runs on a memory-constrained cloud instance). We deliberately avoid Hardhat/Foundry and any persistent local node:
- **`solc-js`** (`scripts/compile.ts`) compiles the contracts on demand and exits — no daemon, flat memory.
- **`viem`** (`scripts/deploy.ts`, `src/chain.ts`) handles deployment and all chain interaction with a small, tree-shakeable footprint.

The trade-off is honest: **no built-in test suite, no local fork testing, no gas profiling**. Correctness is established by the live run plus the manual on-chain audit.

---

## Base Sepolia testnet proof

**Real, verifiable on-chain data** (chainId `84532`). All transactions are settlement calls from the Master to the `Settlement` contract, each confirmed with `status: success` and emitting an ERC-20 `Transfer` + a `JobSettled` event.

### Deployed contracts

| Contract | Address |
|----------|---------|
| `IdentityRegistry` | [`0x7eab0d875edc8b3f5125a1279f8ce61900fb0ca4`](https://sepolia.basescan.org/address/0x7eab0d875edc8b3f5125a1279f8ce61900fb0ca4) |
| `MockUSDC` (mUSDC, 6 dec) | [`0x8c137263b276fd450bbe21ec49713286734da467`](https://sepolia.basescan.org/address/0x8c137263b276fd450bbe21ec49713286734da467) |
| `Settlement` | [`0x49ceb0bfed6eafe8c530b07424a2bffb288368d2`](https://sepolia.basescan.org/address/0x49ceb0bfed6eafe8c530b07424a2bffb288368d2) |

### Agent identities (ERC-8004 style)

| Agent | agentId | Domain | Address |
|-------|---------|--------|---------|
| Master | `1` | `master.goat.local` | [`0x5B6EFfa8428bA5B98Ed6F75fEeA212EDf1660897`](https://sepolia.basescan.org/address/0x5B6EFfa8428bA5B98Ed6F75fEeA212EDf1660897) |
| Worker | `2` | `worker.goat.local` | [`0xe5812Be41e18248CD2801049eec117c69B03b2C6`](https://sepolia.basescan.org/address/0xe5812Be41e18248CD2801049eec117c69B03b2C6) |

### 4 successful settlement transactions

Each pays **0.1 mUSDC** to the Worker for one verified enrichment job (total **0.4 mUSDC** transferred on-chain).

| Row | Tx hash | Explorer |
|-----|---------|----------|
| 1 | `0x6278faab13ac833713f4965a793305aedcb31f9263d7aa1d39106010358faad5` | [view](https://sepolia.basescan.org/tx/0x6278faab13ac833713f4965a793305aedcb31f9263d7aa1d39106010358faad5) |
| 2 | `0xc16e985dd1dcc5537aa28366a288d24d6fdb74489cae742fb39a3e67ee9b9d90` | [view](https://sepolia.basescan.org/tx/0xc16e985dd1dcc5537aa28366a288d24d6fdb74489cae742fb39a3e67ee9b9d90) |
| 3 | `0xbc39a9f7bdd822e74f256f3b33a89fe164678bc5783dc9eb960dedc6787cf02d` | [view](https://sepolia.basescan.org/tx/0xbc39a9f7bdd822e74f256f3b33a89fe164678bc5783dc9eb960dedc6787cf02d) |
| 4 | `0x1365e8c4b58759111fe44f27207305551c4d0dad70fe162c11011fc98dc4e320` | [view](https://sepolia.basescan.org/tx/0x1365e8c4b58759111fe44f27207305551c4d0dad70fe162c11011fc98dc4e320) |

> Note: `jobId = keccak256("enrich-row-<id>-<runId>")` where `runId` is a per-run timestamp, so each demo run produces a fresh, non-colliding set of transactions. The hashes above are from one verified run; re-running produces new hashes while the replay guard correctly rejects any repeated `jobId`. Row 5 of the dataset (no email) is rejected by the Master and produces **no** transaction.

---

## Setup & run instructions

### Prerequisites
- Node.js 24+ and `pnpm`
- A **testnet-only** wallet with a little Base Sepolia ETH (from a [Base Sepolia faucet](https://docs.base.org/tools/network-faucets)) — used as both deployer and Master
- LLM access: on Replit, the OpenAI AI Integration is auto-provisioned (`AI_INTEGRATIONS_OPENAI_BASE_URL` / `AI_INTEGRATIONS_OPENAI_API_KEY`). Outside Replit, point these at any OpenAI-compatible endpoint.

### 1. Clone & install
```bash
git clone <your-repo-url>
cd <repo>
pnpm install
```

### 2. Set environment variables — safely
**Never** put secrets in a committed file. `.env`, `*.key`, `*.pem`, and `deployed-addresses.json` are all git-ignored.

| Variable | Required | Purpose |
|----------|----------|---------|
| `DEPLOYER_PRIVATE_KEY` | for LIVE mode | Testnet-only key; acts as deployer **and** Master |
| `RPC_URL` | optional | Base Sepolia RPC (default `https://sepolia.base.org`) |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | yes | OpenAI-compatible base URL |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | yes | API key for the above |
| `WORKER_MODEL` | optional | LLM model (default `gpt-5-nano`) |

- **On Replit:** add `DEPLOYER_PRIVATE_KEY` via the Secrets pane (never paste keys into chat or code). The AI integration variables are provisioned automatically.
- **Local:** export them in your shell, e.g. `export DEPLOYER_PRIVATE_KEY=0x...` — do not write them to a tracked file.

### 3. Compile contracts
```bash
pnpm --filter @workspace/agent-protocol run compile
# -> writes ABIs + bytecode to agent-protocol/build/
```

### 4. Deploy to Base Sepolia
```bash
pnpm --filter @workspace/agent-protocol run deploy
```
This deploys all three contracts, registers the Master and a freshly-generated Worker identity, mints 1000 mUSDC to the Master, approves the Settlement contract, and writes `deployed-addresses.json` (**git-ignored — contains the Worker's private key**).

### 5. Run the enrichment + settlement loop
```bash
pnpm --filter @workspace/agent-protocol run start
```
Processes `data/raw.csv` one row at a time: Worker enriches → Master verifies → on success, Master settles on-chain. Prints a per-row transcript with live tx hashes and a final summary.

- **LIVE mode** activates automatically when `DEPLOYER_PRIVATE_KEY`, build artifacts, and `deployed-addresses.json` are all present.
- **SIMULATED mode** (no key/deployment) still runs enrichment + verification and logs the payment it *would* make — useful for testing the loop without funds.

### Other commands
```bash
pnpm --filter @workspace/agent-protocol run typecheck
```

---

## Honest scope & limitations

This is a Phase 1 MVP. What is **real and verifiable on-chain**: contract deployment, ERC-8004-style identities, ERC-20 value transfer to the Worker, replay protection, and caller authorization (all confirmed via direct RPC, not just app logs). What is **deliberately simplified**:

- **Mock token.** `MockUSDC` has an open `mint()` and no economic meaning. Testnet only.
- **"x402-style", not the x402 standard.** Settlement is a direct `transferFrom` pushed by the Master — there is no EIP-3009 `transferWithAuthorization`, no facilitator/relayer, and no buyer-signed payment authorization.
- **Verification is off-chain.** `Settlement.settle()` performs **no** validation of the work; it pays whatever the Master submits. Trust is concentrated in the (deterministic, no-LLM) Master, with the chain providing finality, replay-safety, and an audit log — not validation.
- **Shape, not truth.** The Master checks the JSON shape and email format; it does **not** verify the data faithfully reflects the source, so a well-formed LLM hallucination could pass. Row 5's rejection is real but depends on the LLM returning an empty field.
- **Single operator.** The Master is the deployer and only funded key; the Worker is a receive-only throwaway keypair (0 ETH). Both run in one Node process, sequentially — "two agents" is representational (two on-chain identities), not two independent networked services.
- **Identities are unauthenticated.** `register` is permissionless and not bound to `msg.sender`.
- **Contracts are not source-verified on Basescan** — bytecode and transactions are public, but the source is not published on the explorer.

For the full execution-level teardown with on-chain evidence, see [`notebookllm_audit_report.md`](./notebookllm_audit_report.md).
