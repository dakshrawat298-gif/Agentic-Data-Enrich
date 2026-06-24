---
name: solc-js + viem over Hardhat on mobile Replit
description: Lightweight Solidity build/deploy stack chosen to avoid compute crashes.
---

For small on-chain projects on a memory-constrained (mobile) Replit instance,
prefer compiling with `solc` (solc-js, compile-on-demand) and deploying/interacting
with `viem`, instead of Hardhat.

**Why:** Hardhat pulls in a large toolchain and encourages a persistent local
node — both inflate memory and risk crashing a mobile instance. solc-js compiles
and exits; viem is small and tree-shakeable. Foundry/anvil were also avoided (need
the Rust toolchain).

**How to apply:** write self-contained single-file contracts (no imports) so
solc-js needs no import-resolution callback. `solc.compile(JSON.stringify(input))`
with `outputSelection['*']['*'] = ['abi','evm.bytecode.object']`, then deploy each
artifact with `walletClient.deployContract`. Keep a SIMULATED fallback in the app
so the loop runs before a funded key exists.
