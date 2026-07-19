import os
import subprocess
import sys
import unittest
from pathlib import Path

from tests.wiki_sync._fixtures import FixtureWorkspace


ROOT = Path(__file__).resolve().parents[2]


class CliTests(FixtureWorkspace, unittest.TestCase):
    def run_cli(self, *extra: str) -> subprocess.CompletedProcess[bytes]:
        env = os.environ.copy()
        env.update({"PYTHONDONTWRITEBYTECODE": "1", "PYTHONPATH": str(ROOT)})
        return subprocess.run(
            [sys.executable, "-B", "-m", "tools.wiki_sync.dry_run", *extra],
            cwd=ROOT,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )

    def fixture_args(self) -> tuple[str, ...]:
        return (
            "--repository-root",
            str(self.repository_root),
            "--wiki-root",
            str(self.wiki_root),
            "--mapping",
            str(self.mapping_path),
        )

    def test_output_is_deterministic_and_newline_terminated(self):
        first = self.run_cli(*self.fixture_args())
        second = self.run_cli(*self.fixture_args())

        self.assertEqual(first.returncode, 0)
        self.assertEqual(second.returncode, 0)
        self.assertEqual(first.stdout, second.stdout)
        self.assertTrue(first.stdout.endswith(b"\n"))
        self.assertEqual(first.stderr, b"")

    def test_blocked_audit_exits_two(self):
        (self.wiki_root / "Page.md").write_text("changed\n", encoding="utf-8")

        result = self.run_cli(*self.fixture_args())

        self.assertEqual(result.returncode, 2)
        self.assertIn(b'"status":"blocked"', result.stdout)
        self.assertEqual(result.stderr, b"")

    def test_invalid_cli_is_tooling_failure_exit_one(self):
        result = self.run_cli()

        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b"")
        self.assertIn(b"invalid CLI", result.stderr)

    def test_unavailable_explicit_root_is_tooling_failure_exit_one(self):
        args = list(self.fixture_args())
        args[1] = str(self.root / "missing-repository")

        result = self.run_cli(*args)

        self.assertEqual(result.returncode, 1)
        self.assertEqual(result.stdout, b"")
        self.assertIn(b"repository root is unavailable", result.stderr)


if __name__ == "__main__":
    unittest.main()
