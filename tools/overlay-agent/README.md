# Overlay Agent CLI

This tool creates a transparent photo-composition overlay from a reference image and a coordinate guide JSON file.

## Install

```bash
npm install
```

## Run

```bash
npm run generate -- \
  --image ../../assets/photo-guides/reference/my-photo.jpg \
  --guide ./guides/example-guide.json \
  --output ../../assets/photo-guides/overlays/my-photo-overlay.png
```

The output PNG has the same dimensions as the source image and contains a building outline, a horizon guide, and one or more subject-position frames.

## Guide Schema

- `buildingOutline`: at least two `[x, y]` points, each from `0` to `1`
- `backgroundLines`: optional `{ start: [x, y], end: [x, y] }` line segments from the local Vision web app
- `horizonY`: horizontal guide position from `0` to `1`
- `personFrames`: one or more `{ x, y, width, height, label? }` objects, all coordinates from `0` to `1`
- `personFrame`: a legacy single-person form. New guides should use `personFrames`.

For a couple composition, add two frames: one for each person. Each frame is drawn with its own center line and label.

`buildingOutline` and `backgroundLines` are both supported. The interactive registration and comparison prototype is located at `prototype/vision-overlay-studio`; this folder remains a CLI-only PNG generator.

Run `npm test` to validate image dimensions, alpha output, and invalid-coordinate handling.
