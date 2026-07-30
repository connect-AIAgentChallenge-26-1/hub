"""Convert one YOLO Pose + SAM2 result into a reusable Photo Navigation pose guide."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
from PIL import Image, ImageDraw


POSE_SEGMENTS = [
    ["left_shoulder", "right_shoulder"],
    ["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"],
    ["right_shoulder", "right_elbow"], ["right_elbow", "right_wrist"],
    ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"],
    ["left_hip", "right_hip"], ["left_hip", "left_knee"],
    ["left_knee", "left_ankle"], ["right_hip", "right_knee"],
    ["right_knee", "right_ankle"],
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--result-dir", required=True, type=Path)
    parser.add_argument("--background-guide", required=True, type=Path)
    parser.add_argument("--output-guide", required=True, type=Path)
    parser.add_argument("--output-overlay", required=True, type=Path)
    parser.add_argument("--guide-id", required=True)
    parser.add_argument("--source-image", required=True)
    return parser.parse_args()


def normalized_contours(mask_path: Path) -> list[list[list[float]]]:
    mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
    if mask is None:
        raise FileNotFoundError(mask_path)
    height, width = mask.shape
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    normalized = []
    for contour in contours:
        if cv2.contourArea(contour) < 200:
            continue
        epsilon = 0.003 * cv2.arcLength(contour, True)
        simplified = cv2.approxPolyDP(contour, epsilon, True)
        normalized.append([
            [round(float(point[0][0]) / width, 6), round(float(point[0][1]) / height, 6)]
            for point in simplified
        ])
    return normalized


def main() -> None:
    args = parse_args()
    report = json.loads((args.result_dir / "result.json").read_text(encoding="utf-8"))
    background = json.loads(args.background_guide.read_text(encoding="utf-8"))
    width = report["image_size"]["width"]
    height = report["image_size"]["height"]

    outlines = normalized_contours(args.result_dir / "people-mask.png")
    people = []
    for index, person in enumerate(report["people"], start=1):
        x1, y1, x2, y2 = person["box_normalized"]
        label = f"Person {index}"
        people.append({
            "frame": {
                "x": x1,
                "y": y1,
                "width": round(x2 - x1, 6),
                "height": round(y2 - y1, 6),
                "label": label,
                "confidence": person["confidence"],
            },
            "pose": {
                "label": label,
                "keypoints": person["keypoints"],
                "missingKeypoints": person["missing_keypoints"],
            },
        })

    guide = {
        "kind": "pose_guide",
        "version": 5,
        "id": args.guide_id,
        "backgroundGuideId": background["id"],
        "sourceImage": args.source_image,
        "imageSize": {"width": width, "height": height},
        "orientation": "landscape" if width > height else "portrait",
        "personFrames": [person["frame"] for person in people],
        "personOutlines": [{"label": "Person 1", "contours": outlines}] if outlines else [],
        "personPoses": [person["pose"] for person in people],
        "poseSegments": POSE_SEGMENTS,
        "analysisMeta": {
            "engine": "YOLO11s Pose + SAM2.1 Tiny",
            "models": report["models"],
            "timingsMs": report["timings_ms"],
            "warnings": [
                "Low-light image: only confidence-qualified pose keypoints are stored."
            ] if any(person["missing_keypoints"] for person in report["people"]) else [],
        },
    }

    args.output_guide.parent.mkdir(parents=True, exist_ok=True)
    args.output_guide.write_text(json.dumps(guide, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    overlay = Image.open(args.result_dir / "people-outline.png").convert("RGBA")
    drawing = ImageDraw.Draw(overlay)
    line_width = max(3, round(min(width, height) * 0.006))
    for line in background.get("backgroundLines", []):
        drawing.line(
            [(line["start"][0] * width, line["start"][1] * height), (line["end"][0] * width, line["end"][1] * height)],
            fill="#ffe94a",
            width=line_width,
        )
    args.output_overlay.parent.mkdir(parents=True, exist_ok=True)
    overlay.save(args.output_overlay)
    print(json.dumps({"guide": str(args.output_guide), "overlay": str(args.output_overlay), "people": len(people), "outlines": len(outlines)}))


if __name__ == "__main__":
    main()
