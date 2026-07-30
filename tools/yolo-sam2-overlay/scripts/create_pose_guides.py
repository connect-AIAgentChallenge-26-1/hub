"""Create approved pose-guide JSON files from the local YOLO/SAM2 API."""

from __future__ import annotations

import json
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[3]
API_URL = "http://127.0.0.1:8000/api/analyze"
OUTPUT_DIR = ROOT / "assets" / "photo-guides" / "layouts"
SOURCES = [
    ("daegu_modern_history_museum", "couple", "daegu-modern-history-museum_couple_1_photo.png"),
    ("daegu_sparkland_wheel", "solo", "daegu-sparkland-wheel_solo_0_photo.png"),
    ("naver_1784_stairs", "couple", "naver-1784-stairs_couple_0_photo.png"),
]


def main() -> None:
    source_dir = ROOT / "presentation" / "assets" / "layout-agent"
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for scene_id, mode, filename in SOURCES:
        image_path = source_dir / filename
        with image_path.open("rb") as image:
            response = requests.post(
                API_URL,
                files={"file": (image_path.name, image, "image/png")},
                data={"mode": mode},
                timeout=180,
            )
        response.raise_for_status()
        result = response.json()
        guide_id = f"pose_guide_{scene_id}_01"
        guide = {
            "kind": "pose_guide",
            "version": 5,
            "id": guide_id,
            "backgroundGuideId": f"background_guide_{scene_id}_01",
            "sourceImage": filename,
            "personFrames": result["personFrames"],
            "personOutlines": result["personOutlines"],
            "personPoses": result["personPoses"],
            "poseSegments": [
                ["left_shoulder", "right_shoulder"],
                ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
                ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
                ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
                ["left_hip", "right_hip"], ["left_hip", "left_knee"],
                ["left_knee", "left_ankle"], ["right_hip", "right_knee"],
                ["right_knee", "right_ankle"],
            ],
            "analysisMeta": {"engine": "YOLO Pose + SAM2", **result.get("models", {})},
        }
        (OUTPUT_DIR / f"{guide_id}.json").write_text(
            json.dumps(guide, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(f"Created {guide_id}.json")


if __name__ == "__main__":
    main()
