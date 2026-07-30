# Photo Navigation Architecture

## Development Structure

```text
apps/web                    -> React user interface
apps/api                    -> Express API server
tools/yolo-sam2-overlay     -> reference guide and composition analysis service
prototype/vision-overlay-studio -> administrator registration and comparison prototype
Supabase                    -> spot, frame, guide metadata and image URLs
presentation                -> static project reports
```

## Next Vertical Slice

```text
React map
-> GET /photo-spots
-> Express validation
-> Supabase photo_spots + photo_guides
-> map marker and spot detail UI
```

The first data slice keeps camera analysis outside the request path. The registration prototype uses YOLO Pose + SAM2 once to prepare approved `guide_json` and Overlay PNG files. Later comparison uses stored pose data plus YOLO Pose on the captured photo; ORB/RANSAC is restricted to administrator-approved background-line corridors.
