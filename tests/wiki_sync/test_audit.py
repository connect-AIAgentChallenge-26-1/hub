import json
import unittest

from tools.wiki_sync.audit import (
    AuditError,
    DuplicateKeyError,
    audit_mapping,
    load_json_no_duplicates,
)

from tests.wiki_sync._fixtures import FixtureWorkspace


class AuditTests(FixtureWorkspace, unittest.TestCase):
    def audit(self):
        return audit_mapping(self.repository_root, self.wiki_root, self.mapping_path)

    def test_hermetic_fixture_is_a_deterministic_no_op(self):
        first = self.audit()
        second = self.audit()

        self.assertEqual(first, second)
        self.assertEqual(first["status"], "no_op")
        self.assertEqual(first["mappedPageCount"], 2)
        self.assertEqual(first["preservedWikiOnlyPageCount"], 1)
        self.assertEqual(first["sourceRelativeLinkCount"], 1)
        self.assertEqual(first["unmappedWikiPathCount"], 0)
        self.assertFalse(first["wikiMutation"])

    def test_repository_drift_is_a_safe_change(self):
        page = self.repository_root / "docs/page.md"
        page.write_text(page.read_text(encoding="utf-8") + "\nChanged.\n", encoding="utf-8")

        result = self.audit()

        self.assertEqual(result["status"], "safe_change")
        self.assertEqual(result["repositoryDriftPaths"], ["docs/page.md"])
        self.assertEqual(result["reasons"], [])

    def test_wiki_drift_blocks_overwrite(self):
        (self.wiki_root / "Page.md").write_text("changed\n", encoding="utf-8")

        result = self.audit()

        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["primaryReason"], "wiki_content_drift")
        self.assertEqual(result["wikiDriftPaths"], ["Page.md"])

    def test_both_sides_changed_is_reported_separately(self):
        (self.repository_root / "docs/page.md").write_text(
            "# Changed\n\n[Guide](guide.md)\n", encoding="utf-8"
        )
        (self.wiki_root / "Page.md").write_text("changed\n", encoding="utf-8")

        result = self.audit()

        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["reasons"], ["both_sides_changed"])

    def test_preserved_wiki_only_drift_blocks(self):
        (self.wiki_root / "Home.md").write_text("changed\n", encoding="utf-8")

        result = self.audit()

        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["primaryReason"], "preserved_wiki_page_drift")

    def test_missing_source_relative_link_blocks_with_finding(self):
        (self.repository_root / "docs/guide.md").unlink()

        result = self.audit()

        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["primaryReason"], "source_relative_link_missing")
        self.assertEqual(
            result["sourceRelativeLinkFindings"],
            [
                {
                    "normalizedTarget": "docs/guide.md",
                    "rawTarget": "guide.md",
                    "sourceLine": 3,
                    "sourcePath": "docs/page.md",
                }
            ],
        )

    def test_link_titles_and_external_schemes_do_not_create_false_findings(self):
        (self.repository_root / "docs/page.md").write_text(
            "# Page\n\n[Guide](guide.md \"title\")\n[Call](tel:+123)\n",
            encoding="utf-8",
        )

        result = self.audit()

        self.assertEqual(result["status"], "safe_change")
        self.assertEqual(result["sourceRelativeLinkCount"], 1)
        self.assertEqual(result["sourceRelativeLinkFindings"], [])

    def test_complete_wiki_check_detects_unmapped_path(self):
        (self.wiki_root / "Extra.md").write_text("extra\n", encoding="utf-8")

        result = self.audit()

        self.assertEqual(result["status"], "blocked")
        self.assertEqual(result["primaryReason"], "unmapped_wiki_path")
        self.assertEqual(result["unmappedWikiPaths"], ["Extra.md"])

    def test_complete_wiki_check_can_be_disabled_explicitly(self):
        (self.wiki_root / "Extra.md").write_text("extra\n", encoding="utf-8")
        mapping = self.load_mapping()
        mapping["requireCompleteWiki"] = False
        self.write_mapping(mapping)

        result = self.audit()

        self.assertEqual(result["status"], "no_op")
        self.assertFalse(result["wikiCompletenessRequired"])

    def test_duplicate_json_key_is_rejected(self):
        self.mapping_path.write_bytes(
            b'{"schemaVersion":"wiki-sync.v1","pages":[],"pages":[]}\n'
        )

        with self.assertRaises(DuplicateKeyError):
            load_json_no_duplicates(self.mapping_path)

    def test_noncanonical_mapping_is_rejected(self):
        mapping = self.load_mapping()
        self.mapping_path.write_text(json.dumps(mapping, indent=2), encoding="utf-8")

        with self.assertRaisesRegex(AuditError, "not canonical"):
            self.audit()

    def test_case_colliding_wiki_paths_are_rejected(self):
        mapping = self.load_mapping()
        mapping["pages"].append(
            {
                "expectedWikiSha256": "0" * 64,
                "syncMode": "preserve-wiki-only",
                "wikiPath": "page.md",
            }
        )
        self.write_mapping(mapping)

        with self.assertRaisesRegex(AuditError, "case-insensitive Wiki collision"):
            self.audit()

    def test_repository_path_escape_is_rejected(self):
        mapping = self.load_mapping()
        mapping["pages"][0]["repositoryPath"] = "../outside.md"
        self.write_mapping(mapping)

        with self.assertRaisesRegex(AuditError, "invalid path segment"):
            self.audit()

    def test_preserved_page_cannot_claim_repository_source(self):
        mapping = self.load_mapping()
        mapping["pages"][1]["repositoryPath"] = "docs/page.md"
        self.write_mapping(mapping)

        with self.assertRaisesRegex(AuditError, "must not declare a repository source"):
            self.audit()


if __name__ == "__main__":
    unittest.main()
