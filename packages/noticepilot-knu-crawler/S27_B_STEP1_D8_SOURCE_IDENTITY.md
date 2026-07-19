# S27-B prerequisite 1 — D8 canonical source identity

Status: completed

Canonical source identity is:

```text
institutionId + canonicalBoardCategory + sourcePostId
```

Resolution order:

1. exact canonical source identity;
2. canonical source URL equality or authority;
3. `SourceBoard.canonical` and explicit `aliasBoardIds` relationship;
4. explicitly configured canonical-representative board precedence;
5. unresolved → `needs_review`.

The observed `sourceUrl` is provenance, not identity. Lexical URL ordering, candidate-ID ordering, notice-sequence ordering, and the crawler registry's generic `priority` field are not representative-selection fallbacks.

Approved partial precedence:

- `715 행사안내 > 504 일반공지`
- `721 장학공지 > 504 일반공지`

This is not a total ordering. All unconfigured board pairs remain `needs_review`.
