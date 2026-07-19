# Foundation.25.1 Standalone Release Record

This record documents the verified Foundation.25.1 standalone crawler release.
The original documentation-only delivery did not import its package tree, full
corpus, generated data, or release artifact into upstream history. On
2026-07-19, the exact promoted package subtree was restored into the current
working branch at `packages/noticepilot-knu-crawler`. On the same date, an
opt-in local/reference feed vertical slice was wired to the root application.
Production ingestion, persistent user feeds, and deployment remain separate
follow-up work.

## Restoration Record

```yaml
restoredAt: 2026-07-19
sourcePromotionCommit: 439a9d06532470f88a9a17d3bd4cd8083fe00d7e
sourcePath: packages/noticepilot-knu-crawler
restoredPath: packages/noticepilot-knu-crawler
sourceAndRestoredSubtreeGitSha1: fb28c36a9ca03b17cf51eef42aa6cf2e96c482d6
restoredFileCount: 5221
restorationIdentity: exact
referenceFeedVerticalSliceWired: true
productionRuntimeWired: false
runtimeDeployed: false
releaseZipRestoredIntoRepository: false
```

Local restoration verification on Python 3.14.3 discovered and passed 462
tests. The sealed release evidence below retains its historical 30-module,
428-test regression authority; the larger discovery count is a local
whole-tree verification result and does not rewrite that sealed evidence.

Run the restored package regression suite from the repository root with:

```bash
npm run test:foundation25
```

## Release Semantics

| Semantic ID | Name | Recorded authority |
| --- | --- | --- |
| `F25R-01` | `release_identity` | Foundation.25.1 is a verified standalone crawler release. |
| `F25R-02` | `promotion_authority` | The historical promotion commit is `439a9d06532470f88a9a17d3bd4cd8083fe00d7e`. |
| `F25R-03` | `artifact_identity` | The sealed ZIP identity is SHA-256 `34c9a34d882203337eef6f356991ad0249b048d3b3e4aab46a5e50f85e52e7d5`, with `14654988` bytes and `5300` archive entries. |
| `F25R-04` | `standalone_implementation_scope` | The historical source-import commit is `10d7d0941026bc7486451fb3cfecaf5e6ef06833`; the standalone package contains `5221` files. |
| `F25R-05` | `root_runtime_boundary` | An opt-in local/reference feed bridge is wired to the root runtime. It uses one fixed all-campus student profile and expires capabilities on server restart. Production ingestion, persistent user feeds, and runtime deployment were not performed. |
| `F25R-06` | `original_upstream_distribution_boundary` | The original documentation-only delivery did not track or distribute the full `2059`-document corpus, generated JSON/JSONL data, package ZIP, or release artifacts. The 2026-07-19 restoration adds the exact promoted package subtree to the current working branch, but does not restore the ZIP or offline bundle into the repository. |

## Historical Lineage Boundary

The source-import and promotion commits above identify the preserved standalone
release lineage. They are not ancestors of this documentation-only upstream
commit and are not reachable from upstream history.

## Authority Preservation and Availability

```yaml
authorityPreservation:
  method: verified_offline_git_bundle
  archiveId: s24a-repair-s9d
  manifestSchema: noticepilot.gitArchiveManifest.v1
  bundleVerified: true
  freshRestoreVerified: true

authorityAvailability:
  reachableFromUpstreamHistory: false
  artifactTrackedInUpstream: false
  artifactDistributedByUpstream: false
  fullCorpusTrackedInUpstream: false
  restorationRequiresOfflineArchive: true
```

Offline preservation does not imply public availability or upstream
distribution. The artifact hash records the sealed standalone release identity;
the ZIP itself is not distributed or tracked by this repository.

## Local Reference Integration Boundary

The root Express app starts the Python bridge only when
`NOTICEPILOT_ENABLE_REFERENCE_FEED=true`. Provisioning accepts only an exact
empty JSON object and returns a capability-bearing subscription path for the
fixed Foundation reference snapshot. The public feed route supports `GET`,
`HEAD`, and conditional `304` delivery. This boundary is for local contract and
product-flow validation; it is not an account-authenticated or deployed feed
service.
