# WORK-033 Evidence — Zeck UX experience shell and dashboard realization

Work Order: `WORK-033` (spec/work-orders/WORK-033.md) · Assurance: **HIGH_ASSURANCE** · Requirement IDs: N/A (presentation realization; frozen requirement ownership untouched)
Frozen wave base: `9bc408da3a65c9418b858e8e87c8add18b4f79e1` + the disclosed baseline governance repair `b2b1417` (the orchestrator's in-branch repair of the inherited missing "# Implementation Requirements" section — the Architect owns that file and may amend at review)
Branch: `work/WORK-033-ux-dashboard` · **Final head: this doc's commit** (the house two-phase binding — the exact SHA is recorded by the orchestrator in the PR body; the last code commit is `6095a6d`) · Zero merge commits; the merge-base is the frozen base exactly (b2b1417's parent is 9bc408d, one commit beyond the frozen pin by the disclosed orchestrator repair only)

## Implementation history (the ratchet — every commit compiles and is full-suite green)

1. `8025292` — the view system: the design tokens, the HTML-first typed component system, the pure projection model, the app shell, the HTTP kernel, the entry server, the full route map and the client script, plus the five unit suites.
2. `6095a6d` — the proof suites: request-mapping unit tests, the (a)–(k) integration journeys over the real server, and the D1–D7 surface discriminations.
3. This doc (the final head).

A prior worker round had left the full view system + four unit suites uncommitted in the tree; this round critically re-reviewed all of it against the briefing before committing. **Defects found in that review and fixed in `8025292`**: (1) `readFormBody` was called OUTSIDE the dispatch try-block, making the `FormTooLargeError` → 413 page dead code — an oversized POST body fell through to the raw 502 fallback (fixed: the size cap now fires before the handler and renders the 413 page; regression-pinned in navigation.test.ts); (2) the server's catch-all fallback could itself throw after headers were sent (guarded; the socket is destroyed instead); (3) the mobile ≥44px touch-target rule missed nav item links and the suggested-action links (added). No other defects found; the prior round's architecture, projection honesty and escape discipline were kept as-is.

## Gate runs per commit (the ratchet record)

- `8025292`: governance OK (33 orders, frontier=['WORK-033']) · typecheck 0 errors · biome clean (948 files) · full suite with real PG = **266 files / 3672 tests** (157.2s).
- `6095a6d`: governance OK · typecheck 0 errors · biome clean (951 files) · full suite with real PG = **269 files / 3737 tests** (158.0s).
- The doc commit (final head): the complete gate below, run TWICE consecutively.

## The integration world (an honest disclosure of the test double)

The journeys' fake `fetchImpl` implements the public API wire surface over an in-memory world: the create path enforces the REAL contract semantics (mandatory Idempotency-Key header, the closed create body vocabulary — unknown keys rejected 400, same key + same fingerprint → the same receipt with `replayed: true`, same key + different fingerprint → 409 `IDEMPOTENCY_KEY_REUSED`) and the cancel path enforces the governed transition (a terminal execution cannot be cancelled → 409 `INVALID_STATE_TRANSITION`; the transition lands `CANCELLED` + the `execution.cancel` event). The dashboard never knows the difference — it only ever speaks to the SDK client — and the REAL API behavior is pinned by the existing (untouched) API suites. Test-local state (the world Maps) is allowed by the briefing exactly as the frozen R-M24 scan scopes to `apps/`.

## The architecture decision (DISCLOSED deviation from the UX plan's recommendation)

`docs/UX-IMPLEMENTATION-PLAN.md` recommends a React implementation shape. This realization is a **zero-dependency, server-rendered, HTML-first typed component system with native progressive enhancement** (TypeScript functions returning escaped HTML strings; `<details>/<summary>` for all progressive disclosure; real links for tabs; GET forms for search and the create review; POST forms for the two governed mutations; one small vanilla-JS enhancement script served as a static asset). Reason: the frozen gate `tests/architecture/dependency-direction.test.ts` pins root `package.json` dependencies to exactly `["fastify"]`; React would require either an out-of-surface semantic edit of that frozen gate, a dishonest devDependencies placement of a runtime dependency, an out-of-surface root `tsconfig.json` "jsx" edit, or an `apps/dashboard`-local install that CI's root `bun install --frozen-lockfile` would not cover (red CI). The accepted `docs/UX-ARCHITECTURE.md` §32 non-goals explicitly include "require a particular frontend framework", so the binding UX contract does not require one. **One disclosed route addition**: `GET /appearance` (a GET form target that sets the presentation cookie and redirects back) — the no-JavaScript fallback for the appearance control the briefing's client script implements; it changes no platform fact, mutates nothing, and is pinned in navigation.test.ts.

## The honest projection map (live vs honestly unavailable — NEVER fabricated)

The SDK client (`createZeckClient`, exactly 8 methods) is the ONLY transport. **Live surfaces**: Home's attention/active/recent (live re-reads of the recents ids), the execution detail (getExecution/getResult/listEvents/listVerification), create (`createExecution`), cancel (`cancelExecution`), agents inventory + detail (`listAgents`/`getAgentStatus`), command-search agent matches (`listAgents`), artifact anchors from executions opened in this browser (per-execution `getResult` facts). **Honestly unavailable** (the public API exposes no route — each renders the unavailable-state primitive with a one-line user-language concept explanation and the pointer to where its facts WILL come from): execution LISTING (no listing route — hence lookup-by-id + browser-local recents), scheduled runs, artifact inventory/content/lineage (artifacts cross only as per-execution references), competences, connections (with the secret-safety note), evaluations, insights, learning, policies, budgets, team, environments, audit, deployment views, workload/training authoring, agent creation (read-only agents surface, M14/M15). No economic-action or codebase-analysis surface is rendered at all (never hand-rolled fetch — SDK only).

## The mutation inventory (EXACTLY two, both SDK-mediated)

1. `createExecution` — from the POST /build/execution review form. The **idempotency key is generated at step 1** (`dash-<uuid>`), carried as a hidden field through the review, the edit link, the invalid-review re-render and the platform-rejection re-render, so retries converge on one durable execution (pinned: request-mapping + journeys (b); the fake API enforces the real semantics: same key + same fingerprint → same receipt, same key + different fingerprint → 409 `IDEMPOTENCY_KEY_REUSED` surfaced as the honest 422 re-render).
2. `cancelExecution` — only from the confirmation-gated flow (`?action=cancel` view → POST /runs/:id/cancel, or the preserved legacy POST /executions/:id/cancel). The confirmation states the consequence and the authorization; its own idempotency key makes a double submit converge; a terminal-execution cancel surfaces the platform 409 as a redirect to the unchanged live view.

Everything else is a GET. The command surface proposes mutations ONLY as links into the confirmation flow (D7). The form→request builder can never emit a forbidden key (closed vocabulary; pinned in request-mapping + journeys).

## The recents cookie (DISCLOSED navigation-only presentation state)

`zeck_recent_executions` (comma-separated ids, max 8, most-recent-first, HttpOnly, SameSite=Lax, Path=/), set/refreshed on every /runs/:executionId GET, dropped ids pruned when the live read 404s. It is **navigation state, never a fact cache**: every Home/Runs/Active/History/Artifacts view re-reads each id LIVE through the SDK on every request; no fact is ever served from the cookie; it is never sent to the API; the sections are labeled "recently opened in this browser — navigation only; every view reads live through the governed API". The appearance cookie (`zeck_appearance`, not HttpOnly so the enhancement script can keep it in sync) is presentation state only, allowed by the plan's data rules.

## The trust-axes model (the trust checkpoint — four SEPARATE axes, never one score)

| Axis | Honest derivation | Fact source |
|---|---|---|
| Provider success | route ≠ null && modelCalls > 0 → "Provider calls completed (N)"; route null → "No route recorded yet"; calls 0 → honest zero-call label | ExecutionResult.route |
| Execution success | COMPLETED → "Execution completed"; FAILED/CANCELLED/EXPIRED → the honest terminal label; else "In progress (<status>)" | Execution.status |
| Quality success | "M of N checks passed"; zero results → "No verification results recorded" — NEVER a confidence verdict; the derived "High confidence" chip appears ONLY when all checks PASS and every confidence is present, and always carries its derivation ("N/N checks passed") | ExecutionResult.verification / listVerification |
| Policy success | `execution.policy-denied` event → "Policy denied admission" (also surfaced as an attention card); progression past CREATED (status ≥ AUTHORIZED or any non-created event) → "Admitted by policy"; else "Not yet admitted" | Execution.status + events |

Pinned in trust-state.test.ts (19 tests incl. the fabricated-confidence mutant pin), components.test.ts, journeys (a).

## Surface diff inventory (every touched file)

| File | Purpose (one line) |
|---|---|
| apps/dashboard/tokens.ts (new, 492) | The ONE stylesheet: semantic design tokens, light/dark/system, 1024/640px responsive contract, ≥44px mobile targets, focus-visible, reduced-motion |
| apps/dashboard/components.ts (new, 586) | The typed HTML component system (header/verification/timeline/why-panel/attention/result/state primitives/badge/money) |
| apps/dashboard/projection.ts (new, 608) | Pure view-model derivation: trust axes, titles/stages, secret-shape redaction, recents helpers, form→request mapping |
| apps/dashboard/shell.ts (new, 299) | The app shell: skip link, header + command search + appearance, the UX §3 nav tree, main/footer landmarks |
| apps/dashboard/http.ts (new, 229) | The pure routing kernel: route table, params, size-capped form reading, cookies, response constructors |
| apps/dashboard/pages.ts (new, 1609) | Page composition for the whole route map incl. the honest unavailable states and the legacy routes |
| apps/dashboard/client.ts (new, 66) | The ONE enhancement script (Cmd/Ctrl+K, appearance, roving focus) served as /assets/client.js |
| apps/dashboard/index.ts (modified, 257) | createDashboard entry: SDK client + http server + dispatch + the public-error-shape error pages |
| apps/dashboard/package.json (modified, 1 line) | Description only (no dependency changes) |
| tests/unit/dashboard/html-escape.test.ts (new) | The esc boundary over every component surface |
| tests/unit/dashboard/components.test.ts (new) | Every component contract incl. trust honesty pins |
| tests/unit/dashboard/trust-state.test.ts (new) | The four-axis derivation table + mutant pins |
| tests/unit/dashboard/navigation.test.ts (new) | Route map, IA tree, active marking, legacy 303s, 413, a11y frame, responsive/appearance evidence |
| tests/unit/dashboard/request-mapping.test.ts (new) | Form→ExecutionRequest mapping + forbidden keys + idempotency key carriage |
| tests/integration/dashboard/journeys.test.ts (new) | Journeys (a)–(k) over the real server + fake-API world with real idempotency semantics |
| tests/discrimination/dashboard-surface.discrimination.test.ts (new) | D1–D7 static + runtime discriminations over the real apps tree |

No file outside `apps/dashboard/**`, the new dashboard test files and this doc was touched. No migration claimed (inventory 0001–0025 untouched; 0015 burned).

## Test inventory (exact counts — 7 files / 148 tests; +7 files / +148 over the 262/3589 baseline)

| File | Tests | Proves |
|---|---|---|
| tests/unit/dashboard/html-escape.test.ts | 11 | Hostile values through every component surface render escaped (incl. attribute/head contexts, secret-shaped task fields) |
| tests/unit/dashboard/components.test.ts | 33 | ExecutionHeader facts; VerificationSummary honesty (0 results ⇒ no invented confidence; all-PASS+confidence ⇒ derived chip with derivation); timeline chronology + verbatim unknown types + payload-carried percentages only; WhyPanel platform-facts-only (provider/model ONLY inside the advanced disclosure); attention variants; ResultSurface next-actions per status family; AdvancedDisclosure collapsed-by-default; badge symbol+text; money/duration formatting (BigInt exactness) |
| tests/unit/dashboard/trust-state.test.ts | 19 | The four-axis derivation table + the fabricated-confidence mutant pin + axis separation (denial ≠ failure) |
| tests/unit/dashboard/navigation.test.ts | 20 | Every route renders (incl. tabs/views/action=cancel); the IA tree exactly; aria-current marking; legacy 303 preservation; the 413 page; the client.js asset; the a11y frame on every page; viewport/meta-query/44px/reduced-motion/light-dark-system evidence; the appearance route |
| tests/unit/dashboard/request-mapping.test.ts | 16 | dollarsToMicroUsd exactness/rejections; per-field validation; closed vocabulary (never a forbidden key); the SDK's client-side forbidden-key rejection; the honest wire body + idempotency header; the key's carriage through review/edit/re-render; never a keyless create |
| tests/integration/dashboard/journeys.test.ts | 31 | Journeys (a)–(k): first execution end-to-end; idempotent create convergence + the 409 re-render; failed/waiting/cancel flows through the fake governed authority; agents; command surface (links only, world unchanged); legacy routes; 404; 502 + unreachable transport; the recents cookie set/live/pruned; a11y frame + hostile echo escaping |
| tests/discrimination/dashboard-surface.discrimination.test.ts | 18 | D1–D7 (see below) |

**D1–D7**: D1 every `client.<method>(` call site in the real apps tree ∈ the exactly-8 SDK methods (13 call sites today; mutant flagged); D2 no direct `fetch(` in apps code (mutant flagged); D3 no module-level Map cache pattern in ANY apps file — R-M24 extended beyond index.ts (mutants flagged in pages.ts AND components.ts); D4 `publicSurfaceViolations` empty over the real apps file list + no SQL-shaped text (provider-literal and SQL-comment mutants flagged); D5 hostile secret-shaped task/metadata/payload values never echo into any rendered surface (result tab, raw activity JSON, failure-message path); D6 zero-verification honesty with the fabricated-confidence mutant pin; D7 the /command page carries links only (no POST form — mutant flagged) and a proposed cancel links into the confirmation flow.

## Acceptance-criteria mapping (the Work Order's AC1–AC12)

| AC | Where realized | Pinned by |
|---|---|---|
| 1 Home outcome-first + attention/active/recent, no analytics aesthetics | Home's textarea-first form + suggested actions, the attention/active/recent sections from live re-reads, no charts (flat tokens, no gradients) | journeys (a)/(j); navigation (CSS no-gradient pin) |
| 2 Execution detail Result/Evidence/Activity + header facts + How Zeck did it | executionDetailPage + executionHeader/whyPanel/resultSurface/tabs | components; trust-state; journeys (a) |
| 3 Runs active/history/scheduled + recoverable failure/waiting | runsOverview/active/history/scheduled + failedSurface/waitingSurface | navigation (route map); journeys (c)/(d) |
| 4 Build outcome-first entries with proposed-plan review | buildOverview + the two-step execution flow + the agent/workload proposal entries with honest terminal states | request-mapping; journeys (a)/(b) |
| 5 Agents/artifacts/competences/connections/improve/admin map to API objects without parallel state machines | Live agents reads; honest unavailable states for every unexposed surface; D1/D3 prove no second authority | navigation; journeys (e); discrimination D1/D3 |
| 6 Global command/search + mutations only through governed paths | The shell command form + /command; D7 (links only) | journeys (f); discrimination D7 |
| 7 Responsive desktop/tablet/mobile preserving hierarchy | tokens.ts media queries + the same nav DOM | navigation (CSS evidence) |
| 8 Keyboard/screen-reader usable, non-color status | The a11y contract section above | navigation; journeys (k); components (symbol+text) |
| 9 No raw credential/secret/authoritative backend state in the frontend | Secret-shape redaction + esc boundary + D5; zero module state (D3) | html-escape; discrimination D3/D5 |
| 10 Existing developer dashboard behavior stays API-backed and tenant-safe | Every legacy route preserved (POST /executions/:id/cancel, GET /executions/:id, GET /executions?id=) with SDK-only reads | navigation; journeys (g) |
| 11 Expert views without polluting the default experience | AdvancedDisclosure everywhere: route/compute/warnings, versions/selection, raw events/payloads, activity views | components; journeys (a)/(e) |
| 12 The public API mental model preserved (no second execution semantics) | The projection renders only wire shapes; the two mutations use the platform idempotency discipline; D1 pins the 8-method client surface | request-mapping; journeys (b); discrimination D1 |

## Required checkpoint contracts (doc-only evidence per the house convention)

- **SELF-HOSTING-BOUNDARY**: the dashboard imports ONLY `../../sdk` + node builtins (D4's scanner run + the frozen architecture gate over the real tree); no provider literal, no SQL-shaped text, no module state (D1–D4); every fact is a live SDK read (D3, journeys).
- **EXECUTION-PROVENANCE**: the trust axes + the verification table render only platform-recorded facts with their sources; the WhyPanel discloses what is NOT carried (capability detail, plan graph, route rationale); money renders from the platform's integer micro-USD strings; unknown events render verbatim (trust-state; components; journeys (a)).

## Required verification mapping (the Work Order's list)

governance checker / typecheck / lint / full suite → the complete gate below (twice). Existing dashboard tests → the legacy behaviors preserved and re-proven (navigation + journeys (g)). Frontend/unit component tests → the five unit suites. API projection/integration tests for primary journeys → journeys (a)–(k) over the real server. Authority-boundary discrimination → D1/D2/D3. Secret-exposure discrimination → D5 (+ html-escape). Responsive browser verification + keyboard/accessibility verification → the markup/stylesheet/asset-level evidence (limitations disclosed below — no driven browser in this environment). Result/Evidence/Activity trust-state tests → trust-state + components. Command/action authorization-path tests → journeys (f) + D7.

## The route map (as shipped; query-param driven, zero server session state)

GET / · /home(→/) · /build · /build/execution (GET review + POST create) · /build/agent · /build/workload · /runs · /runs/active · /runs/history · /runs/scheduled · /runs/:id (?tab=result|evidence|activity, ?view=events|raw, ?action=cancel) · POST /runs/:id/cancel · /agents · /agents/:id · /assets/artifacts · /assets/artifacts/:id (?executionId=) · /assets/competences(+/:id) · /assets/connections · /improve/{evaluations,insights,learning} · /admin/{policies,budgets,team,environments,audit} · /command?q= · /assets/client.js · /appearance (the disclosed no-JS appearance fallback) · legacy: POST /executions/:id/cancel · GET /executions/:id (303) · GET /executions?id= (303).

## Accessibility evidence (the mechanical checklist and its pins)

Every page: `<html lang="en">` (navigation/journeys (k)); unique `<title>` per route (navigation); exactly one `<h1>` (navigation + journeys (k) + the 404/413 pages); header/nav/main/footer landmarks + `role="search"` on the command form (navigation/journeys); skip link as the first focusable element (navigation/journeys); `aria-current="page"` on the active nav item AND the active tab (navigation); visible `:focus-visible` outlines (tokens.ts + navigation CSS evidence); labels on ALL inputs (shell + form fields; navigation asserts the labeled command input); status by text+symbol, never color alone (statusBadge; components); tables with `th scope="col"`/`scope="row"` (components); inline form errors via `aria-describedby` + an `aria-live="polite"` region (request-mapping: the invalid-review and 422 re-renders); confirmation before the destructive action (journeys (d)); ≥44px touch targets in the mobile breakpoint (tokens.ts + navigation); rem-based scalable typography (tokens.ts); `prefers-reduced-motion` honored (tokens.ts + navigation); native `<details>` disclosures (components); no modals, no hidden destructive actions.

## Responsive evidence

Media queries at 1025px (persistent sidebar grid `nav header/nav main/nav footer`), ≤1024px (collapsed details-based nav bar, single-column detail grid) and ≤640px (single column, Home order preserved outcome → attention → active → recent, ≥44px targets) — pinned in navigation.test.ts (the CSS evidence tests) over `DASHBOARD_CSS`; `<meta name="viewport" content="width=device-width, initial-scale=1">` asserted on every rendered page.

## The complete gate (run at the final head, TWICE consecutively)

- RUN 1: governance `Governance OK: 33 Work Orders, 102 requirements, inFlight=[], frontier=['WORK-033']` · typecheck 0 errors · biome clean (951 files) · full suite with real PG (`ZECK_PG_TEST_URL=postgres://postgres@127.0.0.1:55432/zeck_w033_gate`) = **269 files / 3737 tests passed**.
- RUN 2: governance OK · typecheck 0 errors · biome clean (951 files) · full suite with real PG = **269 files / 3737 tests passed**.

(The gate is inert to this doc — governance reads spec/work-orders, typecheck/vitest discover only TS/tests, biome scans 951 code files with or without it — so both runs execute identically at `6095a6d` and at this doc's commit; the implementer re-verified both runs at the exact final head after committing it.)

## Limitations (honest)

- No real-browser automation in CI: the responsive, keyboard and enhancement-script behaviors are verified at the markup/stylesheet/asset level (real HTTP responses, real CSS rules, the served script's source) in CI; the orchestrator additionally drove a REAL browser out-of-band in the build environment (see the addendum below — environment-verified, the same honesty convention as the local real-PG proofs; CI itself runs no browser). No visual regression harness exists in CI.
- The client script's Cmd/Ctrl+K, appearance toggle and roving focus are verified at the source/asset level (served with the right content type, contains the documented behaviors); the orchestrator's driven-browser record additionally exercised Cmd/Ctrl+K and the appearance/dark behavior live (addendum below).
- No real multi-user/session matrix: the journeys drive one cookie jar; the 401/403 permission-denied page is exercised through the public error shape but not through a real authenticated multi-tenant API.
- English-only copy (the house language rule); no i18n.
- The recents cookie scopes Home's attention/active/recent to ONE browser (disclosed design, not a platform listing).
- The dashboard's error surfaces render the public error code/message only — the fake-API world simulates the wire contract, not the real API server (the real API behavior is pinned by the existing API suites, untouched).

## No-merge statement

The implementer does not push, does not open the PR, does not merge. The Architect (repository owner) is the merge authority; the orchestrator performs the independent verification and opens exactly one PR. Zero spec/, src/, sdk/, cli/, scripts/ or root-config files were touched by this work item.

## Addendum — the orchestrator's driven-browser verification (out-of-band, environment-executed)

After the complete gate, the orchestrator drove the REAL dashboard (the exact final-head server, booted against a harness fake-API world implementing the public wire surface — the same honest test-double family as the journeys suite) through the primary journeys in a real Chromium browser:

- **The first-execution journey end-to-end**: Home ("Zeck — Home") → fill the outcome textarea + application id → "Plan this execution" → the review page (URL carrying the idempotency key, outcome and applicationId) → "Execute" → landed on `/runs/00000000-0000-7000-8000-0001` — the created execution view. Zero browser console errors.
- **The execution work surface**: the "How Zeck did it" disclosure opened by click; the Evidence tab navigated to `?tab=evidence`; the Activity tab rendered the chronological timeline; the header showed the title, the Completed badge, duration, `$4.18` and the checks chip.
- **Keyboard**: Tab from the page start focuses the skip link first ("Skip to main content"), then the brand link — the DOM focus order is correct; **Ctrl+K moved focus to `#command-input`** (the enhancement script works in a real browser).
- **Responsive**: tablet 768px rendered the collapsed top nav; mobile 390px rendered the single-column layout with the compact horizontal row of collapsible nav groups (Build/Runs/Assets/Improve/Admin) and the outcome textarea; the mobile nav group opened by click; the run detail rendered single-column at 390px. (Verified again by visual inspection of the captured screenshots.)
- **Dark mode** (emulated `prefers-color-scheme: dark`): dark surfaces with readable text, all sections and badges visible.
- **The waiting → cancel flow**: the WAITING_USER decision surface rendered → "Cancel this execution" → the confirmation page at `?action=cancel` → "Cancel execution" POST → redirected back to `/runs/:id` showing Cancelled. The full governed flow in a real browser.
- **The command surface**: `/command?q=agents` rendered the results page (links only).
- **15 screenshots** were captured as artifacts (home, review, result, why-open, evidence, activity, tablet, mobile, mobile-run, mobile-nav-open, dark, waiting, cancel-confirm, cancelled, command) — recorded in the PR body; their contents were additionally machine-verified by a vision model against the expected structures (sidebar + textarea + sections; header facts + tabs + disclosure; single-column mobile; readable dark mode).

Honest scope: executed in the build environment against the harness world (not in CI, not against a production API); the browser artifacts and interaction log are orchestrator-side evidence attached to the PR, in the same convention as the local real-PG proofs.

**Final head: this doc's commit (the branch head; the exact SHA is recorded by the orchestrator in the PR body per the house two-phase binding). The last code commit is `6095a6d`; the complete gate ran green twice at the final head (both runs recorded above).**
