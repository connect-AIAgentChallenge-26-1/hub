# Foundation.25.1 Standalone Release Record

This record documents the verified Foundation.25.1 standalone crawler release
without importing its package tree, full corpus, generated data, or release
artifact into upstream history.

## Release Semantics

| Semantic ID | Name | Recorded authority |
| --- | --- | --- |
| `F25R-01` | `release_identity` | Foundation.25.1 is a verified standalone crawler release. |
| `F25R-02` | `promotion_authority` | The historical promotion commit is `439a9d06532470f88a9a17d3bd4cd8083fe00d7e`. |
| `F25R-03` | `artifact_identity` | The sealed ZIP identity is SHA-256 `34c9a34d882203337eef6f356991ad0249b048d3b3e4aab46a5e50f85e52e7d5`, with `14654988` bytes and `5300` archive entries. |
| `F25R-04` | `standalone_implementation_scope` | The historical source-import commit is `10d7d0941026bc7486451fb3cfecaf5e6ef06833`; the standalone package contains `5221` files. |
| `F25R-05` | `root_runtime_boundary` | Root runtime wiring was not performed. Runtime deployment was not performed. |
| `F25R-06` | `upstream_distribution_boundary` | The full `2059`-document corpus, generated JSON/JSONL data, package ZIP, and release artifacts are not tracked or distributed by upstream. Only the sanitized crawler fixtures required by the existing root contract tests are present within this release-related boundary. |

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
