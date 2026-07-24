# Repository workflow

## Start of every task

1. Read `PROJECT_STATE.md` before searching the repository.
2. Identify the affected domain and inspect only its listed files, contracts and tests.
3. Do not re-audit a consolidated domain unless code evidence shows a dependency or regression.
4. Prefer `artifacts/api-endpoint-inventory.json` and `artifacts/api-client-inventory.json`
   over broad searches.

## Validation scope

Use `pnpm validate:change -- --profile ...`:

- `docs`: documentation or metadata only.
- `domain`: isolated domain changes; pass `--tests`, `--packages` and domain `--codegen`.
- `shared`: shared libraries/components; global typecheck/lint and affected package builds.
- `phase`: phase completion, cross-domain changes, production/security changes or demonstrated
  broad regression risk. This runs the complete PostgreSQL, E2E, restore and audit gates.

Do not run global builds or full suites during ordinary domain iterations.
Expand validation only when a failure or shared dependency demonstrates the need.

## End of every delivery

1. Update `project-state.json` for domain status, decisions and pending work.
2. Run `pnpm delivery:finish -- --delivery <id> --summary "<text>" --profile <profile>`
   with any required `--tests`, `--packages` and `--codegen`.
3. Commit both `project-state.json` and regenerated `PROJECT_STATE.md`.

This workflow reduces repeated context gathering and validation while preserving required
security, contract and regression checks.
