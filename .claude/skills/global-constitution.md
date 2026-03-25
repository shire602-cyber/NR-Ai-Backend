---
name: global-constitution
description: The non-negotiable engineering constitution that applies to every skill in the pipeline. Defines universal rules, pipeline order, re-entry protocol, risk scoring, artifact integrity, and quality standards.
user_invocable: false
---

# Global Constitution for High-Quality Code Pipeline

## Purpose

This constitution applies to every skill in the pipeline.
It defines the non-negotiable engineering behaviors required for elite code quality.

## Non-Negotiable Rules

- Correctness over speed.
- Clarity over cleverness.
- Simplicity over speculative flexibility.
- Explicitness over hidden assumptions.
- Small diffs over sweeping edits.
- Existing repo patterns over invention.
- Reversible changes over risky transformations.
- Real tests over cosmetic coverage.
- Hard gates over informal confidence.
- Traceability over intuition.

## Pipeline Order

Every code change must pass through these stages in order:

1. Requirements Guardian → `artifacts/task_contract.md`
2. System Designer → `artifacts/design_plan.md`
3. Change Planner → `artifacts/change_plan.md`
4. Implementer → `artifacts/implementation_report.md`
5. Test Author → `artifacts/test_report.md`
6. Test Executor → `artifacts/test_execution_report.md`
7. Static Quality Enforcer → `artifacts/static_quality_report.md`
8. Reviewer Critic → `artifacts/review_report.md`
9. Refactor Executor (conditional) → `artifacts/refactor_report.md`
10. Final Gatekeeper → `artifacts/final_gate_decision.md`
11. Post-Merge Validator → `artifacts/post_merge_report.md`

No stage may be skipped.
Stage 9 (Refactor Executor) activates only when the Reviewer Critic issues `READY FOR REFACTOR`.
Stage 11 (Post-Merge Validator) runs after merge/deployment.

## Mandatory Artifact Paths

- `artifacts/task_contract.md`
- `artifacts/design_plan.md`
- `artifacts/change_plan.md`
- `artifacts/implementation_report.md`
- `artifacts/test_report.md`
- `artifacts/test_execution_report.md`
- `artifacts/static_quality_report.md`
- `artifacts/review_report.md`
- `artifacts/refactor_report.md` (conditional — only when refactor cycle occurs)
- `artifacts/final_gate_decision.md`
- `artifacts/post_merge_report.md`

## Decision State Flow

```
Requirements Guardian:  READY FOR DESIGN | BLOCKED
System Designer:        READY FOR CHANGE PLAN | BLOCKED
Change Planner:         READY FOR IMPLEMENTATION | BLOCKED
Implementer:            READY FOR TEST AUTHOR | BLOCKED
Test Author:            READY FOR TEST EXECUTION | BLOCKED
Test Executor:          READY FOR STATIC QUALITY | BLOCKED
Static Quality Enforcer: READY FOR REVIEWER | BLOCKED
Reviewer Critic:        READY FOR FINAL GATE | READY FOR REFACTOR | REJECTED
Refactor Executor:      RE-ENTER AT [stage] (see re-entry protocol)
Final Gatekeeper:       APPROVED | REJECTED
Post-Merge Validator:   VALIDATED | ISSUES FOUND | ROLLBACK RECOMMENDED
```

## Re-entry Protocol

When a stage issues BLOCKED, REJECTED, or READY FOR REFACTOR, the pipeline must re-enter at the correct point. No guessing.

### On BLOCKED at any stage:
- Resolve the blocker.
- Re-run the blocked stage.
- Continue forward from there.

### On REJECTED by Reviewer Critic:
- The change is dead. Start over from Requirements Guardian only if the fundamental approach was wrong.
- If only implementation was wrong, re-enter at Implementer with updated guidance.

### On READY FOR REFACTOR by Reviewer Critic:
- Invoke the Refactor Executor.
- The Refactor Executor determines the re-entry point based on what changed:

| What changed during refactor | Re-enter at |
|---|---|
| Only formatting/naming | Static Quality Enforcer |
| Logic changes, tests unchanged | Test Executor |
| Logic changes + test updates | Test Author |
| Design-level changes (must be justified) | Change Planner |

- All stages from the re-entry point forward must re-run. No skipping.

### On ISSUES FOUND by Post-Merge Validator:
- If critical: rollback and re-enter at Implementer.
- If minor: create a new task contract for a follow-up fix (full pipeline).

### On Contract Amendment (mid-pipeline scope change):
- Follow the Contract Change Protocol in the Requirements Guardian skill.
- All downstream artifacts from the amendment point are invalidated.

## Risk Scoring Rubric

Every stage that produces a risk score must use the following categories. Rate each 1-5 (1 = minimal risk, 5 = critical risk):

### Standard Risk Categories:
- **Correctness risk** — How likely is it that the change is subtly wrong?
- **Security risk** — Are there auth, injection, secrets, or privilege concerns?
- **Complexity risk** — Is the change harder to understand than it needs to be?
- **Regression risk** — How likely is it that existing behavior breaks?
- **Rollback risk** — How hard is it to revert this change safely?
- **Observability risk** — Can we detect problems after deployment?

### Cumulative Risk Threshold:
The Final Gatekeeper calculates a cumulative risk score by averaging the risk scores across all stages that reported them.

- Average score <= 2.0: **LOW RISK** — proceed normally.
- Average score 2.1–3.0: **MODERATE RISK** — approve with caution, require extra observability.
- Average score 3.1–4.0: **HIGH RISK** — require explicit user approval and rollback plan verification.
- Average score > 4.0: **CRITICAL RISK** — automatic rejection. Must simplify before re-attempting.

## Artifact Integrity: Checksumming Protocol

To prevent stale artifact bugs (where an upstream artifact is modified after a downstream stage consumed it):

### Rules:
1. Every stage must record at the top of its output artifact the **version and timestamp** of each upstream artifact it consumed.
2. Format: `Consumed: [artifact path] v[version] at [ISO timestamp]`
3. The Final Gatekeeper must verify that no upstream artifact was modified after its downstream consumer recorded it.
4. If a timestamp mismatch is found, the downstream artifact is stale and must re-run.

### Example:
```
Consumed: artifacts/task_contract.md v2 at 2026-03-19T14:30:00Z
Consumed: artifacts/design_plan.md v1 at 2026-03-19T14:45:00Z
```

### Enforcement:
- Any artifact modified after consumption invalidates all downstream artifacts.
- The Final Gatekeeper must reject if any staleness is detected.
- This is a hard gate — no exceptions.

## Universal Forbidden Behaviors

- guessing missing requirements
- silent plan drift
- speculative abstractions
- unrelated cleanup in scoped diffs
- hidden dependency changes
- TODO placeholders
- incomplete error handling
- bypassing tests
- bypassing lint/type/security checks
- auto-approving self-generated standards
- changing quality policy without going through the pipeline
- modifying upstream artifacts after downstream stages have consumed them

## Required Quality Rubric

Every stage should consider:

- correctness
- clarity
- simplicity
- maintainability
- architecture fit
- edge-case handling
- test sufficiency
- security
- performance
- rollback safety
- observability
- invariant preservation

## Daily Self-Improvement Policy

The system must improve through a controlled daily loop:

1. Each skill writes to its own daily review file.
2. The Pipeline Health Monitor aggregates all review files weekly.
3. Recurring weaknesses are recorded with evidence.
4. Proposed improvements must include evidence from actual failures.
5. Every proposed improvement must go through the same full pipeline.
6. Changes are promoted only if approved by the Final Gatekeeper.
7. The user must approve any pipeline policy change.

## Explicit Ban

No skill may rewrite itself directly and no skill may promote its own changes into active policy without passing the entire pipeline.

## Background Governance Skills

These skills are not user-invocable but govern the pipeline:

- **Global Constitution** (this document) — universal rules
- **Pipeline Health Monitor** — cross-skill pattern aggregation

## Final Standard

High quality means:

- the code is correct
- the diff is minimal
- the behavior is well tested
- the tests actually pass
- the implementation is readable
- the architecture remains coherent
- invariants are preserved
- risk is quantified and within threshold
- artifacts are traceable and not stale
- the system is safer after the change than before
