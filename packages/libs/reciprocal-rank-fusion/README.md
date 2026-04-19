# `@very-coffee/rrf`

Generic, runtime-agnostic **Reciprocal Rank Fusion (RRF)** helpers.

## API

- `fuseRrf(arms, options)` -> ranked results with score contributions.
- `rankIds(arms, options)` -> ranked ids only.

## Example

```ts
import { fuseRrf } from "@very-coffee/rrf";

const results = fuseRrf(
  [
    { armId: "lexical", ranked: ["a", "b", "c"], weight: 1 },
    { armId: "vector", ranked: ["b", "c", "d"], weight: 1.2 },
    {
      armId: "graph",
      ranked: [
        { id: "d", boost: 1.3 },
        { id: "a", boost: 1.1 },
      ],
      weight: 0.5,
    },
  ],
  { k: 60, itemBoosts: { b: 1.1 } },
);
```

`results` includes per-arm contribution breakdown for debugging/ranking analysis.
