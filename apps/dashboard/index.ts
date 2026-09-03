/**
 * Zeck dashboard — outcome-first projection over the public API.
 *
 * The dashboard is deliberately state-light: platform facts come from the
 * SDK/API and mutations go through governed API commands. The UI owns only
 * presentation state, disclosure state and form input.
 */

import { createServer, type IncomingMessage } from "node:http";
import {
  createZeckClient,
  ZeckApiError,
  type AgentSummary,
  type AgentStatusView,
  type Execution,
  type ExecutionResult,
  type ExecutionEvent,
  type ExecutionRequest,
  type VerificationResult,
} from "../../sdk";

export interface DashboardOptions {
  readonly apiUrl: string;
  readonly token: string;
  readonly port?: number;
  readonly fetchImpl?: typeof fetch;
  readonly applicationId?: string;
}

function esc(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function microUsdToUsd(value: string | null): string {
  if (value === null) return "—";
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const padded = digits.padStart(7, "0");
  const whole = padded.slice(0, -6).replace(/^0+(?=\d)/, "");
  const decimals = padded.slice(-6).replace(/0+$/, "").padEnd(2, "0");
  return `${negative ? "-" : ""}$${whole}.${decimals}`;
}

function statusTone(status: string): string {
  if (status === "COMPLETED" || status === "PASS" || status === "active") return "success";
  if (status === "FAILED" || status === "FAIL") return "danger";
  if (status === "CANCELLED" || status === "EXPIRED" || status === "INCONCLUSIVE") return "warning";
  return "neutral";
}

function statusLabel(status: string): string {
  return status.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase());
}

const CSS = `
:root {
  color-scheme: light dark;
  --bg: #0a0a0a;
  --surface: #111;
  --surface-2: #171717;
  --surface-3: #1d1d1d;
  --text: #f5f5f5;
  --muted: #9a9a9a;
  --line: #2a2a2a;
  --accent: #f5f5f5;
  --success: #65d48a;
  --danger: #ff7171;
  --warning: #f4c66d;
  --shadow: 0 18px 60px rgba(0,0,0,.22);
}
@media (prefers-color-scheme: light) {
  :root { --bg:#f7f7f5; --surface:#fff; --surface-2:#f1f1ef; --surface-3:#e9e9e6; --text:#111; --muted:#737373; --line:#deded8; --accent:#111; --shadow:0 16px 50px rgba(0,0,0,.08); }
}
* { box-sizing:border-box; }
html { min-height:100%; }
body { margin:0; min-height:100%; background:var(--bg); color:var(--text); font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; line-height:1.5; }
a { color:inherit; text-decoration:none; }
button,input,textarea,select { font:inherit; }
button { cursor:pointer; }
.shell { min-height:100vh; display:grid; grid-template-columns:240px minmax(0,1fr); }
.sidebar { position:sticky; top:0; height:100vh; padding:24px 16px; border-right:1px solid var(--line); background:color-mix(in srgb,var(--bg) 94%,transparent); backdrop-filter:blur(16px); }
.brand { padding:6px 10px 24px; font-size:16px; font-weight:700; letter-spacing:-.02em; }
.brand span { color:var(--muted); font-weight:500; }
.nav-group { margin:0 0 18px; }
.nav-label { padding:0 10px 6px; color:var(--muted); font-size:11px; letter-spacing:.1em; text-transform:uppercase; }
.nav a { display:flex; align-items:center; gap:9px; padding:8px 10px; border-radius:10px; color:var(--muted); font-size:14px; }
.nav a:hover,.nav a[aria-current="page"] { background:var(--surface-2); color:var(--text); }
.main { min-width:0; }
.topbar { height:68px; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:0 32px; border-bottom:1px solid var(--line); position:sticky; top:0; z-index:10; background:color-mix(in srgb,var(--bg) 88%,transparent); backdrop-filter:blur(18px); }
.command { flex:1; max-width:560px; position:relative; }
.command input { width:100%; border:1px solid var(--line); background:var(--surface); color:var(--text); border-radius:12px; padding:10px 14px; outline:none; }
.command input:focus { border-color:#666; box-shadow:0 0 0 3px color-mix(in srgb,var(--text) 9%,transparent); }
.kbd { color:var(--muted); font-size:11px; border:1px solid var(--line); border-radius:6px; padding:2px 6px; }
.command-results { position:absolute; inset:48px 0 auto 0; background:var(--surface); border:1px solid var(--line); border-radius:12px; padding:6px; box-shadow:var(--shadow); display:none; }
.command-results.open { display:block; }
.command-results a { display:block; padding:9px 10px; border-radius:8px; font-size:13px; color:var(--muted); }
.command-results a:hover { background:var(--surface-2); color:var(--text); }
.content { width:min(1180px,100%); margin:0 auto; padding:42px 32px 72px; }
.eyebrow { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.12em; }
h1 { margin:8px 0 12px; font-size:clamp(32px,4vw,54px); line-height:1.02; letter-spacing:-.045em; }
h2 { margin:0; font-size:20px; letter-spacing:-.02em; }
p { margin:0; }
.lede { max-width:720px; color:var(--muted); font-size:16px; }
.hero { display:grid; grid-template-columns:minmax(0,1.5fr) minmax(280px,.85fr); gap:22px; align-items:stretch; margin-bottom:30px; }
.card { border:1px solid var(--line); border-radius:18px; background:var(--surface); box-shadow:var(--shadow); }
.card.pad { padding:22px; }
.hero-card { padding:28px; min-height:320px; display:flex; flex-direction:column; justify-content:space-between; }
.prompt { margin-top:22px; }
.prompt textarea { width:100%; min-height:138px; resize:vertical; border:1px solid var(--line); border-radius:14px; background:var(--surface-2); color:var(--text); padding:16px; outline:none; }
.prompt textarea:focus { border-color:#666; box-shadow:0 0 0 3px color-mix(in srgb,var(--text) 8%,transparent); }
.actions { display:flex; flex-wrap:wrap; gap:9px; margin-top:12px; }
.primary,.secondary,.text-btn { border:1px solid var(--line); border-radius:10px; padding:10px 14px; }
.primary { background:var(--text); color:var(--bg); border-color:var(--text); font-weight:650; }
.secondary { background:var(--surface-2); color:var(--text); }
.text-btn { background:transparent; color:var(--muted); }
.small { font-size:12px; }
.stack { display:grid; gap:12px; }
.grid-3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
.grid-2 { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; }
.section { margin-top:30px; }
.section-head { display:flex; align-items:end; justify-content:space-between; gap:12px; margin-bottom:12px; }
.section-head .sub { color:var(--muted); font-size:13px; }
.tile { padding:18px; border:1px solid var(--line); border-radius:14px; background:var(--surface); }
.tile-title { font-weight:620; }
.tile-copy { color:var(--muted); font-size:13px; margin-top:5px; }
.chip { display:inline-flex; align-items:center; gap:6px; border:1px solid var(--line); border-radius:999px; padding:4px 8px; font-size:11px; color:var(--muted); }
.chip.success { color:var(--success); }
.chip.danger { color:var(--danger); }
.chip.warning { color:var(--warning); }
.list { display:grid; gap:10px; }
.list-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 0; border-bottom:1px solid var(--line); }
.list-row:last-child { border-bottom:0; }
.muted { color:var(--muted); }
.meta { display:flex; flex-wrap:wrap; gap:8px 14px; color:var(--muted); font-size:13px; }
.detail-header { display:flex; align-items:flex-start; justify-content:space-between; gap:20px; margin-bottom:20px; }
.metric-row { display:flex; flex-wrap:wrap; gap:10px; margin-top:16px; }
.metric { min-width:120px; padding:12px 14px; border:1px solid var(--line); border-radius:12px; background:var(--surface); }
.metric b { display:block; font-size:17px; margin-top:2px; }
.tabs { display:flex; gap:6px; border-bottom:1px solid var(--line); margin:0 0 16px; }
.tab { padding:9px 12px; color:var(--muted); border-bottom:2px solid transparent; }
.tab.active { color:var(--text); border-bottom-color:var(--text); }
.notice { border:1px solid var(--line); border-radius:14px; padding:14px; background:var(--surface-2); }
.notice.danger { border-color:color-mix(in srgb,var(--danger) 45%,var(--line)); }
.notice.success { border-color:color-mix(in srgb,var(--success) 38%,var(--line)); }
details { border-top:1px solid var(--line); padding:14px 0; }
summary { cursor:pointer; font-weight:600; }
.timeline { position:relative; margin-top:8px; }
.event { display:grid; grid-template-columns:88px 14px minmax(0,1fr); gap:12px; align-items:start; padding:8px 0; }
.event-time { color:var(--muted); font-size:12px; text-align:right; }
.dot { width:10px; height:10px; margin-top:5px; border-radius:50%; background:var(--surface-3); border:1px solid #777; }
.event-body { font-size:14px; }
.form-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.field { display:grid; gap:6px; }
.field label { color:var(--muted); font-size:12px; }
.field input,.field textarea,.field select { border:1px solid var(--line); border-radius:10px; background:var(--surface-2); color:var(--text); padding:10px 12px; }
.field textarea { min-height:110px; resize:vertical; }
.empty { padding:38px; text-align:center; color:var(--muted); }
.mobile-nav { display:none; }
@media (max-width: 980px) { .shell { grid-template-columns:72px minmax(0,1fr); } .brand { font-size:13px; padding-inline:8px; } .nav-label { display:none; } .nav a { justify-content:center; font-size:0; } .nav a::before { content:"•"; font-size:16px; } .hero { grid-template-columns:1fr; } }
@media (max-width: 720px) { .shell { display:block; } .sidebar { display:none; } .topbar { padding:0 16px; height:62px; } .content { padding:28px 16px 60px; } .grid-3,.grid-2,.form-grid { grid-template-columns:1fr; } .hero-card { padding:20px; min-height:0; } .detail-header { flex-direction:column; } .mobile-nav { position:sticky; bottom:0; z-index:20; display:grid; grid-template-columns:repeat(4,1fr); border-top:1px solid var(--line); background:color-mix(in srgb,var(--surface) 92%,transparent); backdrop-filter:blur(18px); } .mobile-nav a { padding:12px 6px; text-align:center; color:var(--muted); font-size:11px; } h1 { font-size:38px; } }
`;

const CLIENT_SCRIPT = `
(() => {
  const input = document.querySelector('[data-command]');
  const results = document.querySelector('[data-command-results]');
  const form = document.querySelector('[data-execution-form]');
  const task = document.querySelector('[data-task]');
  const app = document.querySelector('[data-app]');
  if (input && results) {
    const commands = [
      ['Run something', '/build/execution'],
      ['View active runs', '/runs/active'],
      ['View agents', '/agents'],
      ['View artifacts', '/assets/artifacts'],
      ['View improvements', '/improve/insights'],
      ['Open policies', '/admin/policies']
    ];
    const show = () => {
      const q = String(input.value || '').trim().toLowerCase();
      const filtered = commands.filter(([label]) => label.toLowerCase().includes(q) || q.length === 0);
      results.innerHTML = filtered.map(([label, href]) => '<a href="' + href + '">' + label + '</a>').join('');
      results.classList.toggle('open', filtered.length > 0);
    };
    input.addEventListener('focus', show);
    input.addEventListener('input', show);
    document.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); input.focus(); } if (event.key === 'Escape') results.classList.remove('open'); });
    document.addEventListener('click', (event) => { if (!(event.target instanceof Node) || !results.contains(event.target) && event.target !== input) results.classList.remove('open'); });
  }
  if (form && task) {
    form.addEventListener('submit', (event) => { if (!task.value.trim()) { event.preventDefault(); task.focus(); } if (app && !app.value.trim()) { event.preventDefault(); app.focus(); } });
  }
})();
`;

function navLink(href: string, label: string, current: string): string {
  const active = current === href || (href !== "/" && current.startsWith(href));
  return `<a href="${href}"${active ? ' aria-current="page"' : ""}>${esc(label)}</a>`;
}

function layout(title: string, body: string, currentPath: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Zeck</title>
<style>${CSS}</style>
</head>
<body>
<div class="shell">
<aside class="sidebar">
  <div class="brand">ZECK <span>execution workspace</span></div>
  <nav class="nav">
    <div class="nav-group"><div class="nav-label">Workspace</div>${navLink("/home", "Home", currentPath)}</div>
    <div class="nav-group"><div class="nav-label">Build</div>${navLink("/build", "Build", currentPath)}${navLink("/agents", "Agents", currentPath)}${navLink("/workloads", "Workloads", currentPath)}${navLink("/deployments", "Deployments", currentPath)}</div>
    <div class="nav-group"><div class="nav-label">Runs</div>${navLink("/runs/active", "Active", currentPath)}${navLink("/runs/history", "History", currentPath)}${navLink("/runs/scheduled", "Scheduled", currentPath)}</div>
    <div class="nav-group"><div class="nav-label">Assets</div>${navLink("/assets/artifacts", "Artifacts", currentPath)}${navLink("/assets/competences", "Competences", currentPath)}${navLink("/connections", "Connections", currentPath)}</div>
    <div class="nav-group"><div class="nav-label">Improve</div>${navLink("/improve/insights", "Insights", currentPath)}${navLink("/improve/evaluations", "Evaluations", currentPath)}</div>
    <div class="nav-group"><div class="nav-label">Admin</div>${navLink("/admin/policies", "Policies", currentPath)}${navLink("/admin/budgets", "Budgets", currentPath)}${navLink("/admin/audit", "Audit", currentPath)}</div>
  </nav>
</aside>
<main class="main">
  <header class="topbar">
    <div class="command"><input data-command aria-label="Search Zeck" placeholder="Search or run a command…"><div class="command-results" data-command-results></div></div>
    <span class="kbd">⌘K</span>
  </header>
  <div class="content">${body}</div>
</main>
</div>
<nav class="mobile-nav">${navLink("/home", "Home", currentPath)}${navLink("/runs/active", "Runs", currentPath)}${navLink("/agents", "Agents", currentPath)}${navLink("/build", "Build", currentPath)}</nav>
<script>${CLIENT_SCRIPT}</script>
</body>
</html>`;
}

function renderHome(agents: readonly AgentSummary[], applicationId: string | undefined): string {
  const agentTiles = agents.slice(0, 3).map((agent) => `
    <a class="tile" href="/agents/${encodeURIComponent(agent.id)}">
      <div class="meta"><span class="chip ${statusTone(agent.status)}">${esc(statusLabel(agent.status))}</span><span>${esc(agent.activeVersion ?? "No active version")}</span></div>
      <div class="tile-title" style="margin-top:9px">${esc(agent.name)}</div>
      <div class="tile-copy">${esc(agent.description ?? "Reusable governed execution system.")}</div>
    </a>`).join("");
  return `
  <section class="hero">
    <div class="card hero-card">
      <div>
        <div class="eyebrow">Execution workspace</div>
        <h1>What would you like Zeck to accomplish?</h1>
        <p class="lede">Describe an outcome. Zeck handles planning, routing, tools, compute and verification through the governed execution path.</p>
      </div>
      <form class="prompt" data-execution-form method="post" action="/executions">
        <textarea name="task" data-task aria-label="Describe what you want Zeck to accomplish" placeholder="Analyze these contracts and flag termination risk…"></textarea>
        <div class="form-grid" style="margin-top:10px">
          <div class="field"><label for="application">Application</label><input id="application" data-app name="applicationId" value="${esc(applicationId ?? "")}" placeholder="Defaults from ZECK_APPLICATION_ID"></div>
          <div class="field"><label for="maxCost">Cost limit (micro-USD, optional)</label><input id="maxCost" name="maxCostMicroUsd" inputmode="numeric" placeholder="10000000"></div>
        </div>
        <div class="actions"><button class="primary" type="submit">Run with Zeck</button><a class="secondary" href="/build">Explore Build</a></div>
      </form>
    </div>
    <div class="stack">
      <div class="card pad"><div class="eyebrow">Attention</div><div style="margin-top:8px;font-size:20px;font-weight:650">Your decisions stay visible.</div><p class="tile-copy" style="margin-top:8px">Approvals, blocked actions and unresolved execution choices belong here rather than in a noisy notification stream.</p></div>
      <div class="card pad"><div class="eyebrow">Trust</div><div style="margin-top:8px;font-size:20px;font-weight:650">Evidence is part of the result.</div><p class="tile-copy" style="margin-top:8px">Completed work exposes its verification evidence, provenance and execution history.</p></div>
    </div>
  </section>

  <section class="section"><div class="section-head"><div><h2>Build something reusable</h2><div class="sub">Start with purpose, not infrastructure.</div></div></div>
    <div class="grid-3">
      <a class="tile" href="/build"><div class="eyebrow">Build</div><div class="tile-title" style="margin-top:7px">An agent</div><div class="tile-copy">Describe a role, guardrails and approvals. Refine the proposed design before exposing internals.</div></a>
      <a class="tile" href="/workloads"><div class="eyebrow">Compute</div><div class="tile-title" style="margin-top:7px">A workload</div><div class="tile-copy">Training, batch processing and specialized compute remain governed executions.</div></a>
      <a class="tile" href="/deployments"><div class="eyebrow">Operate</div><div class="tile-title" style="margin-top:7px">A deployment</div><div class="tile-copy">Make a reusable system continuously available without confusing it with a single run.</div></a>
    </div>
  </section>

  <section class="section"><div class="section-head"><div><h2>Agents</h2><div class="sub">Reusable execution systems already connected to the platform.</div></div><a class="text-btn" href="/agents">View all</a></div>
    ${agentTiles === "" ? '<div class="card empty">No agents are registered yet.</div>' : `<div class="grid-3">${agentTiles}</div>`}
  </section>
  `;
}

function renderExecution(execution: Execution, result: ExecutionResult, events: readonly ExecutionEvent[], verification: readonly VerificationResult[]): string {
  const checksPassed = verification.filter((v) => v.status === "PASS").length;
  const checksTotal = verification.length;
  const routeText = result.route === null ? "Not planned yet" : `${result.route.strategyClass ?? "Governed route"} · ${result.route.modelCalls} model calls`;
  const status = execution.status;
  const warningBlock = result.warnings.length === 0 ? "" : `<div class="notice warning" style="margin-bottom:14px"><b>Warnings</b><div class="stack" style="margin-top:8px">${result.warnings.map((warning) => `<div>${esc(warning)}</div>`).join("")}</div></div>`;
  const verifyBlock = checksTotal === 0 ? `<div class="card pad"><div class="muted">No verification results have been recorded yet.</div></div>` : `
    <div class="card pad">
      <div class="section-head"><div><h2>Verification</h2><div class="sub">Evidence-backed checks returned by the verification authority.</div></div><span class="chip ${checksPassed === checksTotal ? "success" : "warning"}">${checksPassed}/${checksTotal} passed</span></div>
      <div class="list">${verification.map((v) => `<div class="list-row"><div><div class="tile-title">${esc(v.criterionId)}</div><div class="tile-copy">${esc(v.strategy)} · ${esc(v.evaluator.kind)}:${esc(v.evaluator.id)}</div></div><span class="chip ${statusTone(v.status)}">${esc(v.status)}</span></div>`).join("")}</div>
    </div>`;
  const timeline = events.length === 0 ? '<div class="empty">No execution events recorded yet.</div>' : `<div class="timeline">${events.map((event) => `<div class="event"><div class="event-time">${esc(new Date(event.occurredAt).toLocaleTimeString())}</div><div class="dot"></div><div class="event-body"><b>${esc(statusLabel(event.type))}</b><div class="muted small">Event ${esc(event.sequence)}</div></div></div>`).join("")}</div>`;

  return `
  <div class="detail-header"><div><div class="eyebrow">Execution</div><h1>${esc(String(execution.task.title ?? execution.task.name ?? "Untitled execution"))}</h1><div class="meta"><span class="chip ${statusTone(status)}">${esc(statusLabel(status))}</span><span>${esc(execution.id)}</span><span>Created ${esc(new Date(execution.createdAt).toLocaleString())}</span></div></div></div>
  <div class="metric-row"><div class="metric"><span class="muted small">Status</span><b>${esc(statusLabel(status))}</b></div><div class="metric"><span class="muted small">Cost</span><b>${microUsdToUsd(result.cost?.totalMicroUsd ?? null)}</b></div><div class="metric"><span class="muted small">Checks</span><b>${checksPassed}/${checksTotal}</b></div><div class="metric"><span class="muted small">Route</span><b>${esc(routeText)}</b></div></div>

  <div class="tabs" style="margin-top:24px"><a class="tab active" href="#result">Result</a><a class="tab" href="#evidence">Evidence</a><a class="tab" href="#activity">Activity</a></div>
  ${warningBlock}
  <section id="result" class="section" style="margin-top:16px"><div class="card pad"><div class="section-head"><div><h2>Result</h2><div class="sub">The primary outcome of this execution.</div></div></div>
    <div class="notice ${status === "COMPLETED" ? "success" : status === "FAILED" ? "danger" : ""}"><b>${status === "COMPLETED" ? "Execution completed." : status === "FAILED" ? "Zeck could not complete this execution." : "Execution is still in progress."}</b><div class="tile-copy" style="margin-top:7px">The dashboard shows platform facts only; correctness is established by the verification evidence below.</div></div>
    <div class="section" style="margin-top:18px"><details open><summary>How Zeck did it</summary><div class="grid-2" style="margin-top:12px"><div class="tile"><div class="eyebrow">Task</div><div class="tile-title" style="margin-top:7px">Outcome intent</div><div class="tile-copy">${esc(JSON.stringify(execution.task))}</div></div><div class="tile"><div class="eyebrow">Route</div><div class="tile-title" style="margin-top:7px">${esc(routeText)}</div><div class="tile-copy">Provider/model details remain secondary implementation facts.</div></div><div class="tile"><div class="eyebrow">Compute</div><div class="tile-title" style="margin-top:7px">Governed environment</div><div class="tile-copy">The execution selected its compute path through Zeck's policy and capability authorities.</div></div><div class="tile"><div class="eyebrow">Cost</div><div class="tile-title" style="margin-top:7px">${microUsdToUsd(result.cost?.totalMicroUsd ?? null)}</div><div class="tile-copy">Actual settled usage when available.</div></div></div>${result.route !== null ? `<details style="margin-top:12px"><summary>Advanced route detail</summary><div class="meta" style="margin-top:10px"><span>Provider: ${esc(result.route.provider ?? "deterministic")}</span><span>Model: ${esc(result.route.model ?? "—")}</span><span>Strategy: ${esc(result.route.strategyClass ?? "—")}</span><span>Model calls: ${esc(result.route.modelCalls)}</span></div></details>` : ""}</details></div>
    <div class="section"><div class="section-head"><div><h2>Artifacts</h2><div class="sub">Outputs produced by the execution.</div></div></div>${result.outputArtifacts.length === 0 ? '<div class="empty">No output artifacts recorded.</div>' : `<div class="list">${result.outputArtifacts.map((artifact) => `<a class="list-row" href="/assets/artifacts/${encodeURIComponent(artifact.id)}"><div><div class="tile-title">${esc(artifact.id)}</div><div class="tile-copy">Created ${esc(new Date(artifact.createdAt).toLocaleString())}</div></div><span class="muted small">${esc(artifact.digest ?? "No digest")}</span></a>`).join("")}</div>`}</div>
  </div></section>

  <section id="evidence" class="section">${verifyBlock}</section>
  <section id="activity" class="section"><div class="card pad"><div class="section-head"><div><h2>Activity</h2><div class="sub">Chronological execution history.</div></div></div>${timeline}</div></section>
  ${status !== "COMPLETED" && status !== "FAILED" && status !== "CANCELLED" && status !== "EXPIRED" ? `<form method="post" action="/executions/${encodeURIComponent(execution.id)}/cancel" class="section"><button class="secondary" type="submit">Cancel execution</button></form>` : ""}
  `;
}

function renderAgents(agents: readonly AgentSummary[]): string {
  return `<div class="eyebrow">Assets</div><h1>Agents</h1><p class="lede">Reusable governed execution systems. Open one to inspect purpose, version state and recent platform facts.</p><section class="section">${agents.length === 0 ? '<div class="card empty">No agents are registered yet.</div>' : `<div class="grid-2">${agents.map((agent) => `<a class="card pad" href="/agents/${encodeURIComponent(agent.id)}"><div class="meta"><span class="chip ${statusTone(agent.status)}">${esc(statusLabel(agent.status))}</span><span>${esc(agent.activeVersion ?? "No active version")}</span></div><h2 style="margin-top:12px">${esc(agent.name)}</h2><p class="tile-copy">${esc(agent.description ?? "No description")}</p><div class="meta" style="margin-top:14px"><span>${esc(agent.slug)}</span><span>Updated ${esc(new Date(agent.updatedAt).toLocaleDateString())}</span></div></a>`).join("")}</div>`}</section>`;
}

function renderAgentStatus(status: AgentStatusView): string {
  const versions = status.availableVersions.map((version) => `<div class="list-row"><div><div class="tile-title">v${esc(version.version)}</div><div class="tile-copy">${esc(version.validationState)} · ${esc(version.definitionDigest)}</div></div><span class="muted small">${esc(version.createdAt)}</span></div>`).join("");
  return `<div class="eyebrow">Agent</div><h1>${esc(status.agent.name)}</h1><p class="lede">${esc(status.agent.description ?? "Reusable governed execution system.")}</p><div class="metric-row"><div class="metric"><span class="muted small">Status</span><b>${esc(statusLabel(status.agent.status))}</b></div><div class="metric"><span class="muted small">Active version</span><b>${esc(status.agent.activeVersion ?? "—")}</b></div><div class="metric"><span class="muted small">Versions</span><b>${status.availableVersions.length}</b></div></div><section class="section"><div class="grid-2"><div class="card pad"><div class="eyebrow">Current</div><h2 style="margin-top:7px">Active version</h2>${status.activeVersion === null ? '<div class="empty">No active version.</div>' : `<div class="tile" style="margin-top:12px"><div class="tile-title">v${esc(status.activeVersion.version)}</div><div class="tile-copy">Validation: ${esc(status.activeVersion.validationState)}</div><div class="tile-copy">Digest: ${esc(status.activeVersion.definitionDigest)}</div></div>`}</div><div class="card pad"><div class="eyebrow">Selection</div><h2 style="margin-top:7px">Latest selection</h2>${status.latestSelection === null ? '<div class="empty">No promotion or rollback record.</div>' : `<div class="tile" style="margin-top:12px"><div class="tile-title">${esc(status.latestSelection.kind)}</div><div class="tile-copy">Selected version: ${esc(status.latestSelection.selectedVersionId)}</div></div>`}</div></div></section><section class="section"><div class="card pad"><div class="section-head"><div><h2>Version history</h2><div class="sub">Immutable version facts returned by the platform.</div></div></div>${versions || '<div class="empty">No versions available.</div>'}</div></section>`;
}

function renderBuild(): string {
  return `<div class="eyebrow">Build</div><h1>Start with an outcome.</h1><p class="lede">Zeck should propose a design before exposing implementation detail. Choose what you want to make and the dashboard will keep the complexity behind progressive disclosure.</p><section class="section"><div class="grid-2"><a class="card pad" href="/home"><div class="eyebrow">Execution</div><h2 style="margin-top:8px">Run work now</h2><p class="tile-copy">Describe an outcome and let Zeck plan and execute it.</p></a><div class="card pad"><div class="eyebrow">Reusable system</div><h2 style="margin-top:8px">Agent</h2><p class="tile-copy">Agent authoring is the next implementation slice; the accepted UX contract already defines the proposed-design flow.</p></div><div class="card pad"><div class="eyebrow">Compute</div><h2 style="margin-top:8px">Workload</h2><p class="tile-copy">Training, batch and accelerator work remain governed executions.</p></div><div class="card pad"><div class="eyebrow">Operate</div><h2 style="margin-top:8px">Deployment</h2><p class="tile-copy">Persistent availability stays distinct from an individual run.</p></div></div></section>`;
}

function renderPlaceholder(title: string, description: string, path: string): string {
  return `<div class="eyebrow">Zeck</div><h1>${esc(title)}</h1><p class="lede">${esc(description)}</p><section class="section"><div class="card empty">This surface is defined by the accepted UX architecture and reserved for the next implementation slice. The current dashboard does not invent API state that the platform does not expose yet.</div></section><p class="small muted" style="margin-top:14px">Requested path: ${esc(path)}</p>`;
}

async function readBody(request: IncomingMessage): Promise<URLSearchParams> {
  let body = "";
  for await (const chunk of request) body += String(chunk);
  return new URLSearchParams(body);
}

export function createDashboard(options: DashboardOptions): {
  readonly server: ReturnType<typeof createServer>;
  readonly port: number;
} {
  const client = createZeckClient({ baseUrl: options.apiUrl, token: options.token, ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }) });
  const port = options.port ?? 4545;
  const applicationId = options.applicationId ?? process.env.ZECK_APPLICATION_ID;

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://dashboard.local");
    const path = url.pathname;
    const html = (status: number, title: string, body: string) => {
      response.writeHead(status, { "content-type": "text/html; charset=utf-8" });
      response.end(layout(title, body, path));
    };
    try {
      if (request.method === "GET" && (path === "/" || path === "/home")) {
        html(200, "Home", renderHome(await client.listAgents(), applicationId));
        return;
      }
      if (request.method === "POST" && path === "/executions") {
        const form = await readBody(request);
        const taskText = form.get("task")?.trim() ?? "";
        const application = form.get("applicationId")?.trim() || applicationId || "";
        if (taskText === "" || application === "") {
          html(400, "Start an execution", renderHome(await client.listAgents(), applicationId) + `<div class="notice danger" style="margin-top:16px">Add a task and an application before running.</div>`);
          return;
        }
        const maxCost = form.get("maxCostMicroUsd")?.trim();
        const requestBody: ExecutionRequest = {
          applicationId: application,
          task: { title: taskText, description: taskText },
          ...(maxCost === undefined || maxCost === "" ? {} : { constraints: { maxCostMicroUsd: maxCost } }),
        };
        const created = await client.createExecution(requestBody);
        response.writeHead(303, { location: `/executions/${encodeURIComponent(created.receipt.executionId)}` });
        response.end();
        return;
      }
      const executionMatch = /^\/executions\/([^/]+)$/.exec(path);
      if (request.method === "GET" && executionMatch !== null) {
        const id = decodeURIComponent(executionMatch[1] ?? "");
        const [execution, result, events, verification] = await Promise.all([client.getExecution(id), client.getResult(id), client.listEvents(id), client.listVerification(id)]);
        html(200, "Execution", renderExecution(execution, result, events, verification));
        return;
      }
      const cancelMatch = /^\/executions\/([^/]+)\/cancel$/.exec(path);
      if (request.method === "POST" && cancelMatch !== null) {
        await readBody(request);
        const receipt = await client.cancelExecution(decodeURIComponent(cancelMatch[1] ?? ""));
        response.writeHead(303, { location: `/executions/${encodeURIComponent(receipt.executionId)}` });
        response.end();
        return;
      }
      if (request.method === "GET" && path === "/agents") {
        html(200, "Agents", renderAgents(await client.listAgents()));
        return;
      }
      const agentMatch = /^\/agents\/([^/]+)$/.exec(path);
      if (request.method === "GET" && agentMatch !== null) {
        html(200, "Agent", renderAgentStatus(await client.getAgentStatus(decodeURIComponent(agentMatch[1] ?? ""))));
        return;
      }
      if (request.method === "GET" && path === "/build") {
        html(200, "Build", renderBuild());
        return;
      }
      if (request.method === "GET" && ["/workloads", "/deployments", "/runs", "/runs/active", "/runs/history", "/runs/scheduled", "/assets/artifacts", "/assets/competences", "/connections", "/improve/insights", "/improve/evaluations", "/admin/policies", "/admin/budgets", "/admin/audit"].includes(path)) {
        html(200, "Zeck", renderPlaceholder(statusLabel(path.split("/").filter(Boolean).slice(-1)[0] ?? "Workspace"), "The accepted UX contract defines this surface; it will be connected as the corresponding public API projection becomes available.", path));
        return;
      }
      if (request.method === "GET" && path === "/styles.css") {
        response.writeHead(200, { "content-type": "text/css; charset=utf-8", "cache-control": "no-store" });
        response.end(CSS);
        return;
      }
      response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      response.end(layout("Not found", `<div class="eyebrow">Zeck</div><h1>That page does not exist.</h1><p class="lede">Return to the workspace or use search.</p><div class="actions"><a class="primary" href="/home">Go home</a></div>`, path));
    } catch (error) {
      const message = error instanceof ZeckApiError ? error.message : error instanceof Error ? error.message : "Unexpected failure";
      html(502, "Error", `<div class="eyebrow">Zeck</div><h1>We couldn't load that right now.</h1><p class="lede">${esc(message)}</p><div class="actions"><a class="primary" href="/home">Return home</a></div>`);
    }
  });
  return { server, port };
}

if (process.argv[1]?.endsWith("apps/dashboard/index.ts") === true) {
  const token = process.env.ZECK_TOKEN;
  if (token === undefined || token.length === 0) {
    console.error("error: ZECK_TOKEN is not set");
    process.exit(1);
  }
  const { server, port } = createDashboard({
    apiUrl: process.env.ZECK_API_URL ?? "http://127.0.0.1:3000",
    token,
    applicationId: process.env.ZECK_APPLICATION_ID,
    port: Number(process.env.DASHBOARD_PORT ?? 4545),
  });
  server.listen(port, () => console.log(`zeck dashboard listening on http://127.0.0.1:${port}`));
}
