#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def load(rel):
    path = ROOT / rel
    if not path.exists():
        raise SystemExit(f"missing required artifact: {rel}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise SystemExit(f"invalid JSON in {rel}: {exc}")

# Required governance/control artifacts.
required = [
    "spec/governance/architect.json",
    "spec/governance/worker-protocol.json",
    "spec/governance/assurance-profiles.json",
    "spec/governance/checkpoint-contract.json",
    "spec/development-state/governance-model.json",
    "spec/development-state/program-state.json",
    "spec/development-state/dependency-state.json",
    "spec/development-state/frontier-state.json",
    "spec/development-state/checkpoint-state.json",
    "IMPLEMENTATION.md",
    "spec/contracts.md",
    "spec/worker-runbook.md",
    "docs/ARCHITECT-RUNBOOK.md",
    "AGENTS.md",
    "spec/requirements.md",
    "spec/requirement-traceability.md",
]
for rel in required:
    if rel.endswith(".json"):
        load(rel)
    else:
        assert (ROOT / rel).exists(), f"missing required artifact: {rel}"

program = load("spec/development-state/program-state.json")
deps = load("spec/development-state/dependency-state.json")
governance = load("spec/development-state/governance-model.json")
checkpoint_contracts = load("spec/governance/checkpoint-contract.json")
worker = load("spec/governance/worker-protocol.json")
architect = load("spec/governance/architect.json")
architecture = (ROOT / "spec/architecture.md").read_text(encoding="utf-8")
lock = (ROOT / "spec/architecture-lock.md").read_text(encoding="utf-8")
requirements_text = (ROOT / "spec/requirements.md").read_text(encoding="utf-8")
trace_text = (ROOT / "spec/requirement-traceability.md").read_text(encoding="utf-8")

# Core frozen authority assertions.
assert program["governing"]["architectureVersion"] == "v1.0"
assert architecture.startswith("# AI Execution OS Architecture")
assert "Execution is the primary abstraction" in architecture
assert "Workers cannot merge their own PRs" in lock
assert worker["mergeAuthority"] == "architect"
assert "merge-own-pr" in worker["workerMayNot"]
assert "approve-merge" in architect["decisionRights"]
assert "approve-architecture-change" in architect["decisionRights"]
assert (ROOT / ".github/CODEOWNERS").exists()
assert (ROOT / ".github/pull_request_template.md").exists()

# Public architecture module set must remain represented in the implementation contract.
module_names = re.findall(r"\| `/([a-z0-9-]+)` \|", architecture)
implementation_text = (ROOT / "IMPLEMENTATION.md").read_text(encoding="utf-8")
for module in module_names:
    assert f"    {module}/" in implementation_text or f"    {module}/" in implementation_text.replace("modules/\n", ""), (
        f"architecture module /{module} is missing from IMPLEMENTATION.md layout"
    )

orders = {w["id"]: w for w in program["workOrders"]}
assert orders, "program state contains no Work Orders"
assert set(orders) == set(deps["dependencies"]), "program-state and dependency-state have different Work Order identities"

# Dependency lists are duplicated in program-state and dependency-state on purpose; they must agree.
for wid, record in orders.items():
    assert record["dependencies"] == deps["dependencies"][wid], f"dependency mismatch for {wid}"

# Dependency closure + acyclicity.
for wid, parents in deps["dependencies"].items():
    for parent in parents:
        assert parent in orders, f"{wid} depends on unknown Work Order {parent}"

WHITE, GRAY, BLACK = 0, 1, 2
marks = {w: WHITE for w in orders}
def visit(w):
    if marks[w] == GRAY:
        raise SystemExit(f"dependency cycle detected at {w}")
    if marks[w] == BLACK:
        return
    marks[w] = GRAY
    for parent in deps["dependencies"][w]:
        visit(parent)
    marks[w] = BLACK
for wid in orders:
    visit(wid)

# Canonical Work Order identity surface: exactly WORK-NNN.md + TEMPLATE.md.
wo_dir = ROOT / "spec/work-orders"
files = sorted(wo_dir.iterdir())
for path in files:
    if path.name == "TEMPLATE.md":
        continue
    assert re.fullmatch(r"WORK-\d{3}\.md", path.name), f"non-canonical Work Order artifact in spec/work-orders: {path.name}"
assert {p.stem for p in files if p.name != "TEMPLATE.md"} == set(orders), "Work Order files do not match program-state identities"

# Contract vocabulary.
contract_ids = {c["id"] for c in checkpoint_contracts["contracts"]}
for wid, record in orders.items():
    path = wo_dir / f"{wid}.md"
    text = path.read_text(encoding="utf-8")
    for heading in [
        "# Objective",
        "# Dependencies",
        "# Requirement IDs",
        "# Declared Change Surfaces",
        "# Scope Boundaries",
        "# Architecture Invariants",
        "# Acceptance Criteria",
        "# Implementation Requirements",
        "# Required Checkpoint Contracts",
        "# Checkpoints",
        "# Evidence Contract",
        "# Required Verification",
        "# Completion",
    ]:
        assert heading in text, f"{wid} missing {heading}"
    assert text.count("# Acceptance Criteria") == 1
    criteria = text.split("# Acceptance Criteria", 1)[1].split("# Implementation Requirements", 1)[0]
    assert len(re.findall(r"^\d+\. ", criteria, re.M)) >= 3, f"{wid} needs at least three concrete acceptance criteria"

    required_contracts = text.split("# Required Checkpoint Contracts", 1)[1].split("# Checkpoints", 1)[0]
    for contract_id in re.findall(r"^- `([^`]+)`", required_contracts, re.M):
        assert contract_id in contract_ids, f"{wid} references unknown checkpoint contract {contract_id}"

    # Exact dependency declaration must agree with canonical JSON state.
    dep_line = re.search(r"^Requires:\s*(.*)$", text, re.M)
    expected = ", ".join(record["dependencies"]) if record["dependencies"] else "none"
    assert dep_line, f"{wid} missing Requires line"
    actual = dep_line.group(1).strip()
    assert actual == expected, f"{wid} dependency declaration mismatch: expected '{expected}', got '{actual}'"

# Requirement traceability: every requirement exactly once, every owner exists, every owner lists its requirements.
required_ids = re.findall(r"^- ([A-Z]+-\d+):", requirements_text, re.M)
assert len(required_ids) == 45, f"expected 45 frozen requirements, found {len(required_ids)}"
assert len(set(required_ids)) == len(required_ids), "duplicate requirement IDs in requirements.md"

owner_rows = {}
for line in trace_text.splitlines():
    if line.startswith("| ") and not line.startswith("| Requirement |") and not line.startswith("|---"):
        parts = [p.strip() for p in line.strip("|").split("|")]
        if len(parts) >= 2 and re.fullmatch(r"[A-Z]+-\d+", parts[0]):
            rid, owner = parts[0], parts[1]
            owner_rows.setdefault(rid, []).append(owner)

assert set(owner_rows) == set(required_ids), "traceability does not cover exactly the frozen requirement set"
for rid in required_ids:
    assert len(owner_rows[rid]) == 1, f"requirement {rid} must have exactly one primary owner"
    owner = owner_rows[rid][0]
    assert owner in orders, f"requirement {rid} names unknown Work Order {owner}"
    text = (wo_dir / f"{owner}.md").read_text(encoding="utf-8")
    assert f"`{rid}`" in text, f"owner {owner} does not declare requirement {rid}"

for wid in orders:
    owned = [rid for rid, owners in owner_rows.items() if wid in owners]
    text = (wo_dir / f"{wid}.md").read_text(encoding="utf-8")
    for rid in owned:
        assert f"`{rid}`" in text

# Initial frontier must be exactly pending Work Orders whose dependencies are complete.
complete = {w["id"] for w in program["workOrders"] if w["status"] == "complete"}
eligible = [
    w["id"] for w in program["workOrders"]
    if w["status"] == "pending" and all(parent in complete for parent in w["dependencies"])
]
frontier = load("spec/development-state/frontier-state.json")["eligible"]
assert set(frontier) == set(eligible), f"frontier mismatch: expected {eligible}, got {frontier}"

# Work Order surfaces are required to exist in machine-readable program state and prose declaration.
for wid, record in orders.items():
    wo_text = (wo_dir / f"{wid}.md").read_text(encoding="utf-8")
    assert record.get("surfaces") is not None, f"{wid} missing machine-readable surfaces"
    assert "# Declared Change Surfaces" in wo_text

# Post-merge invariant.
for record in program["workOrders"]:
    if "mergedAs" in record:
        assert record["status"] == "complete", f"{record['id']} has merge evidence but is not complete"

# Governance model must explicitly preserve authority and fail-closed behavior.
assert governance.get("engineeringControlLoop" ) or governance.get("authority") is not None
assert "Policy" in implementation_text or "policy" in implementation_text

print(f"Governance OK: {len(orders)} Work Orders, {len(required_ids)} requirements, frontier={eligible}")
