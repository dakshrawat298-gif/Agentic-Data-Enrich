import solc from "solc";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const contractsDir = path.join(root, "contracts");
const buildDir = path.join(root, "build");

const files = fs.readdirSync(contractsDir).filter((f) => f.endsWith(".sol"));
const sources: Record<string, { content: string }> = {};
for (const f of files) {
  sources[f] = { content: fs.readFileSync(path.join(contractsDir, f), "utf8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

if (output.errors) {
  let fatal = false;
  for (const e of output.errors) {
    console.log(e.formattedMessage);
    if (e.severity === "error") fatal = true;
  }
  if (fatal) {
    console.error("Compilation failed.");
    process.exit(1);
  }
}

fs.mkdirSync(buildDir, { recursive: true });
for (const file of Object.keys(output.contracts)) {
  for (const name of Object.keys(output.contracts[file])) {
    const c = output.contracts[file][name];
    fs.writeFileSync(
      path.join(buildDir, `${name}.json`),
      JSON.stringify({ abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }, null, 2),
    );
    console.log(`compiled ${name}`);
  }
}
console.log("Build artifacts written to agent-protocol/build/");
