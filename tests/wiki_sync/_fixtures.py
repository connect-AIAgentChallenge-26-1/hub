from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path
from typing import Any

from tools.wiki_sync.audit import canonical_json_bytes


FIXTURE = Path(__file__).parent / "fixtures/basic"


class FixtureWorkspace:
    def setUp(self) -> None:
        super().setUp()
        self._temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self._temporary_directory.cleanup)
        self.root = Path(self._temporary_directory.name)
        shutil.copytree(FIXTURE, self.root, dirs_exist_ok=True)
        self.repository_root = self.root / "repository"
        self.wiki_root = self.root / "wiki"
        self.mapping_path = self.root / "mapping.json"

    def load_mapping(self) -> dict[str, Any]:
        return json.loads(self.mapping_path.read_text(encoding="utf-8"))

    def write_mapping(self, mapping: dict[str, Any]) -> None:
        self.mapping_path.write_bytes(canonical_json_bytes(mapping))
