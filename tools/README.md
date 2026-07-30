# Tool Modules

`tools` contains development tools that prepare reusable assets for the product. They are not bundled into `apps/web`.

## `overlay-agent`

- Admin-facing Before/After UI
- Produces an approved `guide.json` and transparent Overlay PNG
- Owns the shared JavaScript guide helpers and the registration UI

## `yolo-sam2-overlay`

- FastAPI Vision service for reference analysis and capture comparison
- YOLO Pose is the default scoring path
- SAM2 and background-line matching are an optional accurate path

## Shared boundary

The stable boundary is `guide.json`, not a model-specific binary file. Store one JSON object per frame in `photo_guides.guide_json`:

```text
guide_json
├─ personFrames      # visible camera guide
├─ personPoses       # fast YOLO keypoint comparison
├─ personOutlines    # optional SAM2 visual overlay
└─ backgroundLines   # optional accurate background comparison
```

The product app only needs the approved guide data and Overlay PNG URL. It does not import or run YOLO/SAM2 directly.
