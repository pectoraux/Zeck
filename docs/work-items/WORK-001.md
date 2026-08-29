# WORK-001 Evidence — Repository, modular-monolith and governance foundation

Status: IN REVIEW — implementation complete on `work/WORK-001-foundation`; PR open; architect review and merge pending.

## Requirement mapping

WORK-001 owns no frozen requirement IDs directly (substrate/governance Work Order per `spec/work-orders/WORK-001.md`). Acceptance criteria are mapped instead:

| Acceptance criterion | Implementation | Proof |
|---|---|---|
| 1. Strict TypeScript/Bun toolchain, deterministic commands | `package.json` (exact-pinned devDependencies, canonical scripts), `tsconfig.json` (strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`), `biome.json`, `vitest.config.ts`, committed `bun.lock` | `tests/integration/toolchain-contract.test.ts`; CI `implementation` job (activates via `hashFiles` gate) |
| 2. Module skeleton + public/internal boundary convention | 18 modules under `src/modules/*` with `public.ts` + `domain/ application/ ports/ adapters/ internal/`; `src/integrations/workflowos/`; typed `ModuleDescriptor` in `src/shared/module.ts` | `tests/architecture/module-skeleton.test.ts`; `tests/unit/modules.test.ts` (spec §6 sync) |
| 3. db, Redis, object-store, clock, crypto, secret-store ports without domain coupling | `src/platform/{db,redis,object-store,clock,crypto,secret-store}/port.ts` (+ `config/port.ts`, `db/migrations/` home); ports are interface-only; domain/application/ports layers are forbidden from importing platform | `tests/architecture/dependency-direction.test.ts`; `tests/discrimination/dependency-rules.discrimination.test.ts` (domain-coupled-to-platform cases) |
| 4. Architecture/dependency tests rejecting cross-module internal imports and out-of-adapter SDK imports | Rule engine `tests/architecture/lib/dependency-rules.ts` (13 rules incl. `internal-never-cross-module`, `cross-module-public-only`, `provider-sdk-outside-adapter`, undeclared-import fail-closed) + SDK boundary table | `tests/architecture/dependency-direction.test.ts`; `tests/architecture/provider-sdk-boundaries.test.ts`; discrimination proofs in `tests/discrimination/dependency-rules.discrimination.test.ts` |
| 5. Fresh clone runs governance validation without application source | `scripts/governance-check.py` unchanged and source-independent; tracked-file copy (clone-equivalent) validated | `tests/integration/fresh-clone-governance.test.ts`; `tests/discrimination/governance-gate.discrimination.test.ts` (gate rejects mutated state) |

## Implementation

- Base revision: `463e6a677630cdc3cae5914abc01aafdd154c795` (`main`)
- Implementation revision: head of `work/WORK-001-foundation` at PR open (stable binding identity is the PR number below; final identity is the architect merge commit recorded at post-merge finalization)
- Changed surfaces:
  - `src/platform/` — ports (config, db, redis, object-store, clock, crypto, secret-store) + migrations home
  - `src/api/` — transport-only placeholder contract
  - `src/shared/` — module descriptors, canonical error taxonomy, UUIDv7 primitives
  - `spec/development-state/` — WORK-001 marked in-flight (program/frontier), checkpoint outcomes recorded (evidence-only, verdicts pending)
  - `src/modules/*`, `src/integrations/workflowos` — module skeleton created per acceptance criterion 2 (`IMPLEMENTATION.md` §2 layout)
  - Toolchain root files directly required by acceptance criterion 1: `package.json` (devDependencies added; scripts unchanged), `tsconfig.json`, `biome.json`, `vitest.config.ts`, `bun.lock` (new)
  - Tests/evidence directly required by the Work Order: `tests/{unit,architecture,discrimination,integration}/**`, this evidence file
- Changed files: 141 added/modified, 0 removed — 18 module skeletons ×6 files, 8 platform port/README files, 3 shared primitives, 11 test files, 5 toolchain files, 3 development-state files, 1 evidence file
- Not touched: frozen architecture (`spec/architecture.md`, `spec/architecture-lock.md`, ADRs), `spec/contracts.md`, all other Work Orders, `scripts/governance-check.py` (verified byte-identical to base), `.github/` (CI contract already encodes the WORK-001 activation gate; no change required)

## Verification

Commands run with Bun 1.3.4 (the CI-pinned version) on the branch head:

- Governance check: `python3 scripts/governance-check.py` → `Governance OK: 20 Work Orders, 45 requirements, frontier=[]` (exit 0)
- Deterministic install: `bun install --frozen-lockfile` → no changes, 53 installs across 102 packages (exit 0)
- Typecheck: `bun run typecheck` → exit 0 (TypeScript strict + noUncheckedIndexedAccess)
- Lint: `bun run lint` → exit 0 (Biome, 137 files, no findings)
- Unit tests: `bun run test:unit` → 20 passed (3 files): UUIDv7 (format/uniqueness/monotonicity/counter/clock-regression), error taxonomy spec-sync vs `spec/contracts.md`, module registry spec-sync vs `spec/architecture.md` §6
- Integration tests: `bun run test:integration` → 6 passed (2 files): fresh-clone governance validation, toolchain contract
- Architecture + discrimination: `bun run test:architecture` → 58 passed (5 files): real-tree zero violations, module skeleton completeness, SDK boundary table, 20+ synthetic violation injections all rejected, valid-shape negative control clean
- Real PostgreSQL/Redis: not required for this Work Order — no durable authority boundary, schema, accounting, identity store, idempotency ledger or durable execution state was introduced (see checkpoint scope notes)
- Discrimination/mutation proof: `tests/discrimination/dependency-rules.discrimination.test.ts` (every named boundary weakened and rejected, incl. negative controls) and `tests/discrimination/governance-gate.discrimination.test.ts` (governance gate rejects hand-edited frontier, deleted lock artifact, dependency mismatch, merge-evidence-before-complete)
- Concurrency/crash proof: not applicable yet (no concurrent durable state); monotonic/clock-regression safety of UUIDv7 proven in `tests/unit/ids.test.ts`

## Checkpoint evidence

Applicable blocking contracts from `spec/governance/checkpoint-contract.json`:

- `IMPLEMENTATION-COMPLETENESS` — acceptance criteria 1–5 each implemented and mapped to passing tests (table above); full verification gate green.
- `IDENTITY-IDEMPOTENCY` — scope note: no durable authority boundary introduced; frozen idempotency contract untouched (`spec/contracts.md`); `IDEMPOTENCY_KEY_REUSED` present in canonical taxonomy; UUIDv7 identity primitives proven.
- `CONCURRENCY-CRASH-SAFETY` — scope note: no concurrent durable state introduced; UUIDv7 generator proven monotonic under same-millisecond and clock-regression.
- `SELF-HOSTING-BOUNDARY` — no second authority created; worker did not merge its own PR; governance gate proven discriminating against state corruption; fresh-clone validation proven.
- `DEPENDENCY-DIRECTION` — rule engine over the real tree reports zero violations; every rule proven discriminating via synthetic mutation.

Recorded in `spec/development-state/checkpoint-state.json` as worker-recorded outcomes with verdicts pending architect review.

## Known limitations

- No runtime dependencies exist yet by design: `src/` currently contains ports and skeleton only; adapters (PostgreSQL, Redis, object store, Fastify transport, provider SDKs) arrive with the Work Orders that own them. The SDK boundary table is therefore exercised by synthetic discrimination tests, not by live SDK imports.
- Architecture tests are deterministic static scans; they do not replace the dynamic boundary tests that later Work Orders must add at real authority boundaries.
- `spec/work-orders/WORK-001.md` still reads `Status: PENDING` because `spec/work-orders/` is outside this Work Order's declared surfaces; program-state carries the authoritative in-flight status.
- The CI `implementation` job activates on this PR via the `hashFiles('tsconfig.json','bun.lock')` gate — that activation is itself part of what this PR proves.
- `bun.lock` was generated with Bun 1.3.4 exactly (the version CI pins); `--frozen-lockfile` verified.

## PR / merge

- PR number: 3 (https://github.com/pectoraux/Zeck/pull/3)
- Architect review verdict: pending
- Merge commit: pending (architect merge authority; worker does not merge its own PR)
- Post-merge finalization revision: pending
