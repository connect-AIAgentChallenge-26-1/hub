# YOLO Pose + SAM2 Local Overlay Test

This local tool detects up to two people with YOLO11s Pose, extracts their head, shoulders, arms, torso, and leg layout, then passes the person boxes to SAM2.1 Tiny for a supplementary silhouette outline.


It is for preparing reference-frame data, not real-time user coaching. A person reviews the downloaded result before a later registration module uploads it to Storage and the database.

## What it produces

- `people-mask.png`: combined grayscale person mask
- `person-1-mask.png`, `person-2-mask.png`: one mask per person
- `people-outline.png`: transparent PNG containing only the person contour
- `preview.jpg`: original image with masks and contours overlaid
- `result.json`: boxes normalized to `0..1`, model settings, and per-stage timings
- `result.json` also includes normalized pose keypoints and missing-keypoint warnings

## Composition comparison module

`src/composition_compare.py` is a reusable comparison module. The FastAPI `POST /api/compare` route uses `guide.json` as the approved reference layout.

- Fast mode: stored YOLO pose keypoints versus newly detected pose keypoints. It compares people count, normalized placement, torso scale, and shared pose shape without re-analyzing the reference image.
- Background-line mode: an optional reference image enables ORB feature matching only around administrator-approved background lines, RANSAC homography, and registered line endpoint and angle differences. The reference is not re-analyzed; its approved silhouettes come from `guide.json`.
- If the background match is weak, the API still returns the fast pose score and marks the background result as limited.

All uploaded images are normalized and processed inside a temporary directory, then removed before the response is returned.

## Setup on Windows

Use Python 3.11 or 3.12. The machine's current Python 3.14 environment is not recommended for this model stack.

```powershell
cd tools/yolo-sam2-overlay
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

The first run downloads `yolo11s-pose.pt` and `sam2.1_t.pt` into the ignored `models/` directory. Later runs reuse those files.


## Run

```powershell
.\run.ps1 -Image "C:\path\to\couple.jpg" -MaxPeople 2 -Device cpu
```

For a single-person photo, use `-MaxPeople 1`. On an NVIDIA CUDA environment, use `-Device 0` after installing the matching CUDA build of PyTorch.

You can also call the Python CLI directly:

```powershell
.\.venv\Scripts\python.exe .\src\pipeline.py `
  --image "C:\path\to\couple.jpg" `
  --output .\results `
  --max-people 2 `
  --device cpu
```

## Reading performance

Open `results/result.json` and check `timings_ms`. Model loading is included separately from inference so a one-off CLI run is not confused with a warmed-up API server. A later local API should load both models once at startup and reuse them for every request.

Measured on the current CPU-only development machine with the models already downloaded:

- YOLO inference: about 2.5 seconds
- SAM2.1 Tiny inference for two people: about 1.8 seconds
- Whole CLI run including model loading and rendering: about 4.9 seconds

This baseline used the existing 1717 x 916 prototype flow image. Test again with original camera photos before making a deployment decision.

## Overlay contents

The Studio renders and downloads a transparent Overlay PNG containing:

- SAM2 silhouette outline in green
- Horizon line and representative background structure lines

The JSON retains person frames and pose keypoints for later comparison features, but the visible Overlay deliberately hides person boxes, labels, and pose markers. The visual guide stays focused on the person silhouette and place composition.

Pose lines are an overall composition guide only. The tool does not analyse facial features or score a user's posture.

## Integration boundary

This tool is intentionally independent from the product React app. The local Studio lives in `prototype/vision-overlay-studio`, calls this FastAPI endpoint, and downloads approved `guide.json` and Overlay PNG files. A future registration module will upload those approved files to Supabase Storage and save their URLs and metadata in the database.

The first run needs internet access for model download. Input photos are processed locally and are not sent to an external Vision API.
