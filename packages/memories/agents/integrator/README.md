# @cfd/memories-integrator

Thin **memory integrator** agent: `memory_search` + structured **MemoryIntegratorPlan** output:

- **nodeLabels**: one object, optional fields keyed by ontology node kind (value = that kind’s payload). No discriminated-union array.
- **edges**: array of rows `{ memory, direction, properties?, … }` with **exactly one** optional field per ontology **edge** kind (same keyed pattern as node labels). Merge maps that field to `{ kind, props }`.

Map the wire to `MemoriesClient.mergeMemory` via `integratorWireToMergeSlice`.

## Wire contract

This package’s JSON shape is **library-internal** until promoted to a stable interchange contract. If it becomes cross-service, add matching Smithy types under `@cfd/memories-spec` and keep them in sync with this implementation.

## Usage

- `declareMemoryIntegratorAgent` / `registerMemoryIntegratorAgent` — same registry pattern as `@cfd/memories-adapter`.
- `MemoryIntegratorClient.integrate()` — one-shot session: `content` → `{ plan, generation }`.
- `integratorWireToMergeSlice(ontology, plan)` — produce `labels` / `edges` / `properties` for `mergeMemory`.
