import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { formatUnits } from "viem";
import { enrichRow } from "./worker";
import { verify, settle } from "./master";
import { isChainReady, loadDeployment } from "./chain";

/**
 * Orchestration harness. Processes the trigger CSV one row at a time (never in
 * parallel) to keep memory flat: Worker enriches -> Master verifies -> on success
 * Master settles payment on-chain. Prints a grant-demo-ready transcript.
 */

const root = path.resolve(import.meta.dirname, "..");
const line = "=".repeat(70);

interface Row {
  id: string;
  raw_text: string;
}

async function main(): Promise<void> {
  const csv = fs.readFileSync(path.join(root, "data", "raw.csv"), "utf8");
  const rows = parse(csv, { columns: true, skip_empty_lines: true, trim: true }) as Row[];

  const deployment = loadDeployment();
  const live = isChainReady();
  const runId = Date.now();

  console.log(line);
  console.log("GOAT — Decentralized Agentic Data-Enrichment Protocol (Phase 1 MVP)");
  console.log(line);
  console.log(
    `Mode: ${live ? "LIVE — settling on Base Sepolia" : "SIMULATED — settlement logged only (configure DEPLOYER_PRIVATE_KEY + deploy to go live)"}`,
  );
  if (deployment) {
    console.log(`Master  agent #${deployment.master.agentId}  ${deployment.master.address}`);
    console.log(`Worker  agent #${deployment.worker.agentId}  ${deployment.worker.address}`);
    console.log(`Settlement contract            ${deployment.settlement}`);
  }
  console.log(line);

  let processed = 0;
  let settledCount = 0;
  let totalPaid = 0n;

  for (const row of rows) {
    processed++;
    console.log(`\n[Row ${row.id}] ${row.raw_text}`);
    try {
      const enriched = await enrichRow(row.raw_text); // Worker (LLM)
      console.log(`  Worker     -> ${JSON.stringify(enriched)}`);

      const result = verify(enriched); // Master (deterministic, no LLM)
      if (!result.valid) {
        console.log(`  Master     -> REJECTED: ${result.errors.join("; ")}`);
        console.log(`  Settlement -> withheld (verification failed)`);
        continue;
      }
      console.log(`  Master     -> VERIFIED`);

      const s = await settle(`enrich-row-${row.id}-${runId}`);
      if (s.simulated) {
        console.log(`  Settlement -> [SIMULATED] would pay ${formatUnits(s.amount, 6)} mUSDC to the Worker`);
      } else {
        totalPaid += s.amount;
        console.log(`  Settlement -> PAID ${formatUnits(s.amount, 6)} mUSDC | tx ${s.txHash}`);
        console.log(`                ${s.explorerUrl}`);
      }
      settledCount++;
    } catch (err) {
      console.log(`  ERROR      -> ${(err as Error).message}`);
    }
  }

  console.log(`\n${line}`);
  console.log(
    `Summary: ${processed} processed | ${settledCount} verified & settled | ` +
      `${live ? `${formatUnits(totalPaid, 6)} mUSDC paid on-chain` : "simulated (no on-chain payment)"}`,
  );
  console.log(line);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
