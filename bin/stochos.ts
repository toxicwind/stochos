#!/usr/bin/env bun
// bin/stochos.ts — stochos CLI.
// Subcommands:
//   stochos matrix <role>   — resolve a role against the default matrix
//   stochos probe           — run a live provider×model probe (latency+status)
//   stochos coerce <script> — evaluate a Lua coercion script against candidates
import { defineMatrix, resolveAll } from "../src/matrix";
import { applyCoercion } from "../src/lua";
import { defaultMatrix } from "../src/default-matrix";

const [,, sub, arg] = process.argv;

async function main() {
  const matrix = defaultMatrix();
  switch (sub) {
    case "matrix": {
      const available = async () => true; // offline: all available
      const all = await resolveAll(matrix, available);
      for (const r of all) {
        console.log(`${r.role.padEnd(14)} ${r.router.padEnd(14)} ${r.target.provider}/${r.target.model}`);
      }
      break;
    }
    case "coerce": {
      if (!arg) { console.error("usage: stochos coerce <lua-script>"); process.exit(1); }
      const role = matrix.roles[0];
      const idx = applyCoercion(arg, { role: role.role, router: matrix.router, candidates: role.targets });
      console.log(`coerced index: ${idx}${idx >= 0 ? ` → ${role.targets[idx].provider}/${role.targets[idx].model}` : " (fall through)"}`);
      break;
    }
    default:
      console.log("stochos — per-model-per-provider-per-router routing control plane");
      console.log("  stochos matrix   — resolve all roles against the default matrix");
      console.log("  stochos coerce   — evaluate a Lua coercion script");
  }
}

main().catch((e) => { console.error(String(e)); process.exit(1); });