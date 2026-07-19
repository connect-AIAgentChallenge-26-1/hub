from __future__ import annotations

from contextlib import redirect_stderr, redirect_stdout
import hashlib
import io
import json
import os
from pathlib import Path
import stat
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import warnings
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"
if str(TOOLS) not in sys.path:
    sys.path.insert(0, str(TOOLS))

import reproducible_package as package  # noqa: E402


VERSION = "0.4.4-observation.3-policy.15-foundation.25"
NAME = "noticepilot-knu-crawler"
EPOCH = 315532801


def make_source(base: Path, *, unicode_path: bool = False) -> Path:
    source = base / "source"
    (source / "bin").mkdir(parents=True)
    (source / "empty").mkdir()
    manifest = {"packageName": NAME, "packageVersion": VERSION, "createdAt": "fixed"}
    (source / "VERSION_MANIFEST.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (source / "README.md").write_text("fixture\n", encoding="utf-8")
    executable = source / "bin" / "run.sh"
    executable.write_text("#!/bin/sh\nexit 0\n", encoding="utf-8")
    executable.chmod(0o755)
    if unicode_path:
        (source / "한글.txt").write_text("내용", encoding="utf-8")
    return source


def archive_path(base: Path, directory: str = "out") -> Path:
    parent = base / directory
    parent.mkdir()
    return parent / f"{NAME}-v{VERSION}.zip"


def build(source: Path, output: Path, epoch: int = EPOCH) -> package.PublicationState:
    return package.build_archive(source, output, VERSION, epoch)


def hash_file(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def central_offsets(data: bytes) -> list[tuple[int, int]]:
    eocd = data.rfind(b"PK\x05\x06")
    values = struct.unpack_from("<4s4H2IH", data, eocd)
    count = values[4]
    offset = values[6]
    result = []
    for _ in range(count):
        fields = struct.unpack_from("<4s6H3I5H2I", data, offset)
        result.append((offset, fields[16]))
        offset += 46 + fields[10] + fields[11] + fields[12]
    return result


class ReproduciblePackageTests(unittest.TestCase):
    def test_help_no_arguments_and_dry_run_are_non_mutating(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            source = make_source(base)
            output = archive_path(base)
            before = package.scan_source(source).snapshot
            stdout = io.StringIO()
            stderr = io.StringIO()
            with redirect_stdout(stdout), redirect_stderr(stderr):
                with self.assertRaises(SystemExit) as help_exit:
                    package.main(["--help"])
                self.assertEqual(help_exit.exception.code, 0)
                with self.assertRaises(SystemExit):
                    package.main([])
                self.assertEqual(package.main([
                    "build", "--source-root", str(source), "--output", str(output),
                    "--package-version", VERSION, "--source-date-epoch", str(EPOCH), "--dry-run",
                ]), 0)
            after = package.scan_source(source).snapshot
        self.assertEqual(before, after)
        self.assertFalse(output.exists())

    def test_epoch_contract_uses_utc_even_second_and_range(self) -> None:
        normalized, date_time, timestamp = package.normalize_epoch(EPOCH)
        self.assertEqual(normalized, 315532800)
        self.assertEqual(date_time, (1980, 1, 1, 0, 0, 0))
        self.assertEqual(timestamp, "1980-01-01T00:00:00Z")
        self.assertEqual(package.resolve_epoch(EPOCH, {"SOURCE_DATE_EPOCH": str(EPOCH)}), normalized)
        with self.assertRaises(package.PackageError):
            package.resolve_epoch(EPOCH, {"SOURCE_DATE_EPOCH": str(EPOCH + 2)})
        with self.assertRaises(package.PackageError):
            package.normalize_epoch(package.MIN_EPOCH - 1)
        with self.assertRaises(package.PackageError):
            package.normalize_epoch(package.MAX_EPOCH + 1)

    def test_identifier_and_source_path_rules(self) -> None:
        self.assertEqual(package.package_root_name(NAME, VERSION), f"{NAME}-v{VERSION}")
        for value in ("", " x", "x ", ".", "..", "a/b", "a\\b", "a\x00b", "a\nb"):
            with self.subTest(value=value), self.assertRaises(package.PackageError):
                package.validate_identifier(value, "value")
        with self.assertRaises(package.PackageError):
            package.validate_identifier("e\u0301", "value")
        for path in ("a\\b", "a/../b", "./a", "a//b", "e\u0301.txt"):
            with self.subTest(path=path), self.assertRaises(package.PackageError):
                package.validate_relative_path(path)

    def test_exact_exclusion_contract(self) -> None:
        excluded = [
            (".venv/x", False), ("__MACOSX/x", False), ("evidence/x", False),
            ("staging/x", False), ("probe_out42/x", False), ("calendar/x", False),
            ("calendar_test/x", False), ("attachments/x", False), ("raw_downloads/x", False),
            ("local-observation-data/x", False), ("observation-output/x", False),
            ("a/__pycache__/x", False), ("a/.DS_Store", False), ("a/._x", False),
            ("a/x.pyc", False), ("a/x.pyo", False),
        ]
        for path, is_directory in excluded:
            with self.subTest(path=path):
                self.assertTrue(package.is_excluded(path, is_directory=is_directory))
        for path in ("a/evidence/x", "a/staging/x", "a/calendar/x", "probe_output.txt"):
            with self.subTest(path=path):
                self.assertFalse(package.is_excluded(path, is_directory=False))

    def test_fixture_builds_are_byte_identical_and_verify_in_both_modes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            source = make_source(base)
            first = archive_path(base, "a")
            second = archive_path(base, "b")
            build(source, first)
            build(source, second)
            archive_only = package.verify_archive(first)
            source_aware = package.verify_archive(first, source)
            first_bytes = first.read_bytes()
            second_bytes = second.read_bytes()
            first_hash = hash_file(first)
            second_hash = hash_file(second)
        self.assertEqual(first_bytes, second_bytes)
        self.assertEqual(first_hash, second_hash)
        self.assertTrue(archive_only["archiveOnlyVerified"])
        self.assertFalse(archive_only["sourceAwareVerified"])
        self.assertTrue(source_aware["sourceAwareVerified"])

    def test_root_first_unified_lexical_ordering(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            output = archive_path(base)
            build(make_source(base), output)
            with zipfile.ZipFile(output) as archive:
                names = archive.namelist()
        root = f"{NAME}-v{VERSION}/"
        self.assertEqual(names[0], root)
        self.assertEqual(names[1:], sorted(names[1:]))
        self.assertIn(f"{root}{package.INTEGRITY_NAME}", names)

    def test_ascii_and_utf8_filename_flags_match_raw_names(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            output = archive_path(base)
            build(make_source(base, unicode_path=True), output)
            entries = package._parse_central_directory(output.read_bytes())
        ascii_entry = next(row for row in entries if row.name.endswith("README.md"))
        unicode_entry = next(row for row in entries if row.name.endswith("한글.txt"))
        self.assertFalse(ascii_entry.flags & package.ZIP_UTF8_FLAG)
        self.assertEqual(ascii_entry.raw_name, ascii_entry.name.encode("ascii"))
        self.assertTrue(unicode_entry.flags & package.ZIP_UTF8_FLAG)
        self.assertEqual(unicode_entry.raw_name, unicode_entry.name.encode("utf-8"))

    def test_compression_timestamp_mode_and_metadata_contract(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            output = archive_path(base)
            build(make_source(base), output)
            entries = package._parse_central_directory(output.read_bytes())
            package.verify_archive(output)
        for row in entries:
            self.assertEqual(row.extra, b"")
            self.assertEqual(row.comment, b"")
            unix_mode = row.external_attr >> 16
            if row.name.endswith("/"):
                self.assertEqual(row.compression, zipfile.ZIP_STORED)
                self.assertEqual(stat.S_IMODE(unix_mode), 0o755)
            else:
                self.assertEqual(row.compression, zipfile.ZIP_DEFLATED)
                expected = 0o755 if row.name.endswith("bin/run.sh") else 0o644
                self.assertEqual(stat.S_IMODE(unix_mode), expected)

    def test_zip64_structures_and_extra_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            output = archive_path(base)
            build(make_source(base), output)
            data = bytearray(output.read_bytes())
            central, _ = central_offsets(data)[0]
            struct.pack_into("<H", data, central + 30, 4)
            name_length = struct.unpack_from("<H", data, central + 28)[0]
            extra_offset = central + 46 + name_length
            data[extra_offset:extra_offset] = b"\x01\x00\x00\x00"
            eocd = data.rfind(b"PK\x05\x06")
            central_size = struct.unpack_from("<I", data, eocd + 12)[0]
            struct.pack_into("<I", data, eocd + 12, central_size + 4)
            bad = base / "bad.zip"
            bad.write_bytes(data)
            with self.assertRaises(package.PackageError):
                package.verify_archive(bad, enforce_filename=False)

    def test_symlink_and_special_source_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            source = make_source(base)
            (source / "link").symlink_to("README.md")
            with self.assertRaises(package.PackageError):
                package.scan_source(source)

        if hasattr(os, "mkfifo"):
            with tempfile.TemporaryDirectory() as tmp:
                source = make_source(Path(tmp))
                os.mkfifo(source / "pipe")
                with self.assertRaises(package.PackageError):
                    package.scan_source(source)

    def test_duplicate_traversal_and_encrypted_entries_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            duplicate = base / "duplicate.zip"
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                with zipfile.ZipFile(duplicate, "w") as archive:
                    archive.writestr("same", b"one")
                    archive.writestr("same", b"two")
            with self.assertRaises(package.PackageError):
                package.verify_archive(duplicate, enforce_filename=False)

            traversal = base / "traversal.zip"
            with zipfile.ZipFile(traversal, "w") as archive:
                archive.writestr("../escape", b"no")
            with self.assertRaises(package.PackageError):
                package.verify_archive(traversal, enforce_filename=False)

            non_nfc = base / "non-nfc.zip"
            with zipfile.ZipFile(non_nfc, "w") as archive:
                archive.writestr("e\u0301.txt", b"no")
            with self.assertRaises(package.PackageError):
                package.verify_archive(non_nfc, enforce_filename=False)

            output = archive_path(base)
            build(make_source(base), output)
            original = output.read_bytes()
            for label, mutator in (
                ("encrypted", lambda data, central, local: struct.pack_into("<H", data, central + 8, 1)),
                ("local-mismatch", lambda data, central, local: struct.pack_into("<H", data, local + 6, 1)),
            ):
                data = bytearray(original)
                central, local = central_offsets(data)[0]
                mutator(data, central, local)
                bad = base / f"{label}.zip"
                bad.write_bytes(data)
                with self.subTest(label=label), self.assertRaises(package.PackageError):
                    package.verify_archive(bad, enforce_filename=False)

    def test_integrity_self_inventory_version_and_file_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            output = archive_path(base)
            build(make_source(base), output)
            with zipfile.ZipFile(output) as archive:
                root = f"{NAME}-v{VERSION}"
                raw = archive.read(f"{root}/{package.INTEGRITY_NAME}")
                value = json.loads(raw)
        self.assertNotIn(package.INTEGRITY_NAME, [row["path"] for row in value["files"]])
        without_hash = dict(value)
        claimed = without_hash.pop("manifestHash")
        self.assertEqual(claimed, package.sha256_bytes(package.canonical_json(without_hash)))
        inventory = {"directories": value["directories"], "files": value["files"]}
        self.assertEqual(value["sourceInventoryHash"], package.sha256_bytes(package.canonical_json(inventory)))

    def test_local_central_header_mismatch_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            output = archive_path(base)
            build(make_source(base), output)
            data = bytearray(output.read_bytes())
            _, local = central_offsets(data)[1]
            data[local + 10] ^= 1
            bad = base / "bad-local.zip"
            bad.write_bytes(data)
            with self.assertRaises(package.PackageError):
                package.verify_archive(bad, enforce_filename=False)

    def test_source_mutation_is_detected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            source = make_source(base)
            output = archive_path(base)
            real_scan = package.scan_source
            calls = 0

            def mutate_after_first(root: Path | str) -> package.SourceScan:
                nonlocal calls
                calls += 1
                result = real_scan(root)
                if calls == 1:
                    (source / "README.md").write_text("changed\n", encoding="utf-8")
                return result

            with mock.patch.object(package, "scan_source", side_effect=mutate_after_first):
                with self.assertRaises(package.PublicationError) as caught:
                    build(source, output)
        self.assertFalse(caught.exception.state.outputPublished)

    def test_archive_only_and_source_aware_have_distinct_claims(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            source = make_source(base)
            output = archive_path(base)
            build(source, output)
            self.assertFalse(package.verify_archive(output)["sourceAwareVerified"])
            (source / "README.md").write_text("different\n", encoding="utf-8")
            with self.assertRaises(package.PackageError):
                package.verify_archive(output, source)

    def test_existing_output_and_hard_link_race_preserve_existing_bytes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            source = make_source(base)
            output = archive_path(base)
            output.write_bytes(b"existing")
            with self.assertRaises(package.PackageError):
                build(source, output)
            self.assertEqual(output.read_bytes(), b"existing")

    def test_post_commit_failure_reports_published_without_rollback(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            source = make_source(base)
            output = archive_path(base)
            with mock.patch.object(package, "_fsync_directory", side_effect=OSError("injected")):
                with self.assertRaises(package.PublicationError) as caught:
                    build(source, output)
            state = caught.exception.state
            self.assertTrue(state.archiveBuilt)
            self.assertTrue(state.archiveVerified)
            self.assertTrue(state.outputPublished)
            self.assertFalse(state.publicationDurable)
            self.assertFalse(state.packagingEligible)
            self.assertTrue(output.exists())
            self.assertTrue(Path(state.temporaryArchivePath or "").exists())

    def test_hard_link_race_and_temporary_unlink_failure_retain_truthful_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            source = make_source(base)
            output = archive_path(base)
            real_link = package.os.link

            def competing_link(source_path: object, destination_path: object) -> None:
                Path(destination_path).write_bytes(b"competitor")
                raise FileExistsError("injected race")

            with mock.patch.object(package.os, "link", side_effect=competing_link):
                with self.assertRaises(package.PublicationError) as caught:
                    build(source, output)
            self.assertFalse(caught.exception.state.outputPublished)
            self.assertEqual(output.read_bytes(), b"competitor")

        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            source = make_source(base)
            output = archive_path(base)
            real_unlink = package.os.unlink

            def fail_temporary_unlink(path: object) -> None:
                if str(path).endswith(".tmp"):
                    raise OSError("injected unlink failure")
                real_unlink(path)

            with mock.patch.object(package.os, "unlink", side_effect=fail_temporary_unlink):
                with self.assertRaises(package.PublicationError) as caught:
                    build(source, output)
            state = caught.exception.state
            self.assertTrue(state.outputPublished)
            self.assertTrue(state.publicationDurable)
            self.assertFalse(state.temporaryRemoved)
            self.assertFalse(state.packagingEligible)
            self.assertTrue(output.exists())
            self.assertTrue(Path(state.temporaryArchivePath or "").exists())

    def test_safe_unpack_is_deterministic_and_preserves_normalized_modes(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            source = make_source(base)
            first = archive_path(base, "a")
            second = archive_path(base, "b")
            build(source, first)
            build(source, second)
            unpack_a = base / "unpack-a"
            unpack_b = base / "unpack-b"
            unpack_a.mkdir()
            unpack_b.mkdir()
            inventory_a = package.safe_unpack(first, unpack_a)
            inventory_b = package.safe_unpack(second, unpack_b)
        self.assertEqual(inventory_a, inventory_b)

    def test_cli_help_and_wrapper_contract_entrypoint(self) -> None:
        command = [sys.executable, str(TOOLS / "reproducible_package.py"), "--help"]
        result = subprocess.run(command, cwd="/", capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("build", result.stdout)
        self.assertIn("verify", result.stdout)
        wrapper_help = subprocess.run(
            [str(ROOT / "package.sh"), "--help"],
            cwd="/",
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(wrapper_help.returncode, 0, wrapper_help.stderr)
        self.assertIn("build", wrapper_help.stdout)
        wrapper_no_args = subprocess.run(
            [str(ROOT / "package.sh")],
            cwd="/",
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertNotEqual(wrapper_no_args.returncode, 0)
        self.assertIn("usage:", wrapper_no_args.stderr)


if __name__ == "__main__":
    unittest.main()
