---
name: security-audit
description: >
  Conduct rigorous, security-focused code reviews with zero tolerance for mediocrity.
---

You are performing a comprehensive adversarial audit of this codebase. Your job is to think like an attacker, a hostile code reviewer, and a future maintainer who inherited a mess — not like the person who wrote this code and wants it to look good.

## Scope
Audit the full codebase at /Users/nick/development/github.com/graze-social/cocore. If it's large, start with an inventory pass (entry points, dependency graph, trust boundaries) before going deep on any one area.

## Method
1. **Map trust boundaries first.** Identify every place untrusted input enters the system (HTTP handlers, CLI args, file reads, env vars, deserialized data, third-party API responses, message queue payloads). For each, trace how far the data flows before it's validated or sanitized.
2. **Adversarial framing.** For each component, ask: "If I wanted to break this, corrupt its data, escalate privilege, or exfiltrate something, how would I do it?" Don't just check for known vuln patterns — reason about the specific logic.
3. **No charity toward the code.** Don't assume input is well-formed, callers are honest, network calls succeed, or config is correct. Assume the worst plausible caller/environment at every boundary.
4. **Check, don't guess.** For any finding, cite the actual file and line, and if uncertain, run/trace the code path rather than speculating.

## Specific categories to cover
- **Injection**: SQL/NoSQL, command, template, log, header injection wherever strings are built from input
- **AuthN/AuthZ**: missing checks, checks in the wrong order, IDOR (object references not scoped to the requester), privilege escalation paths
- **Deserialization & parsing**: unsafe deserialization, XXE, prototype pollution, unchecked type coercion
- **Secrets & config**: hardcoded credentials, secrets in logs/error messages, overly permissive defaults, unsafe fallback behavior when config is missing
- **Concurrency**: race conditions, TOCTOU bugs, unsynchronized shared state
- **Dependency risk**: outdated/abandoned packages, known CVEs, overly broad permissions requested by dependencies
- **Error handling**: swallowed exceptions that mask failures, information leakage in error responses, fail-open behavior where fail-closed is needed
- **Business logic abuse**: workflows that assume happy-path usage (e.g., can a step be skipped, replayed, or called out of order to reach an invalid state?)
- **Resource exhaustion**: unbounded loops/recursion/allocations driven by user input, missing rate limits or size caps

## Output format
For each finding:
- **Severity** (Critical/High/Medium/Low) with brief justification
- **Location** (file:line)
- **Attack scenario**: concrete, specific steps an attacker would take — not a generic category name
- **Fix**: minimal, specific remediation (not "add validation" — say what validation, where)

End with a short summary: the 3-5 issues that matter most if I can only fix a handful today, and any systemic pattern (e.g., "input validation is inconsistent across handlers") worth addressing structurally rather than patch-by-patch.

Do not soften findings to be diplomatic. Do not treat "this matches existing patterns in the codebase" as a mitigating factor — if the existing pattern is unsafe, say so.
