# Exedra — Overview

**Exedra** — a semicircular classical recess built for philosophical conversation and civic debate. Also phonetically *et cetera* — the mechanism for capturing everything that gets glossed over in product decisions.

Part of the Khora Labs suite alongside Khora, Domus, and Vellum.

## Purpose

A structured stakeholder interview and alignment tool that:

1. Sends invite links to stakeholders for async interviews (structured "event storming" sessions)
2. Feeds responses into an evolving knowledge base
3. Surfaces points of contention between stakeholders
4. Structures a resolution/alignment process toward shared ground truth

The product is essentially a structured version of an AI-facilitated alignment conversation, with scaffolding for teams and products.

## Roles

| Role | Description |
|---|---|
| **Facilitator** | PM, team lead, or founder. Configures the interview scope, monitors responses, manages the knowledge base. |
| **Respondent** | Stakeholder who receives an invite link and completes the structured interview. |
| **Team** | All team members have read access to the global knowledge base once facts are integrated. |

## Interview Structure

## Phases

1. **Interview** — Each stakeholder completes an independent AI-driven conversation
2. **Synthesis** — Post-hoc structured projections are extracted from all interview transcripts
3. **Contention surfacing** — Divergent beliefs/observations across stakeholders are identified
4. **Alignment** — Facilitator and stakeholders resolve conflicts; agreed items are promoted to `fact`

> The facilitator manually triggers phase 3+4, but receives an automated notification when all invited stakeholders have completed (or a deadline passes). The facilitator retains control over closing early or allowing late responses.

---

- The facilitator sets a **topic/seed prompt** that every stakeholder sees as their baseline
- The interview is an **AI-driven conversation** — the AI probes, follows up, and adapts based on what the stakeholder says
- Stakeholder responses are largely **unstructured free-form** (conversational)
- The AI interviewer has **read access to established facts** (ground truth) to use as grounding context
- The AI interviewer does **not** surface other stakeholders' unresolved beliefs during an interview — each stakeholder expresses their views without peer pressure or bias
- **Structured projections** (SPO facts, contention points, themes) are synthesized post-hoc — not captured live
- Conflict resolution happens in a separate phase after all interviews are collected

## Knowledge Base Integration

- Stakeholder responses are initially stored as `observation`-kind memories (per `@khoralabs/memories` ontology)
- Contested claims surface as divergent `belief`-kind memories (with source attribution)
- After alignment is reached, resolved facts are integrated into the shared namespace as ground-truth `fact`-kind memories
- Integration follows the memories system's LLM-driven integrator pipeline (`mergeMemory` with `fact` label kind)

## Memory System

Uses `@khoralabs/memories` as the knowledge graph backend:
- Subject/predicate/object structured facts
- Hybrid BM25 + vector search for surfacing related/conflicting claims
- Typed graph edges (`affects`, `causes`, `references`, etc.) to link related facts
- Provenance hash chain for auditability
- Namespaced by team/product/feature scope
