# Photo Navigation Deployment

## Deployment boundary

GitHub Pages deploys only React/Vite static files. It cannot run Express, Supabase service-role operations, or YOLO Pose + SAM2 inference.

```text
GitHub Pages (apps/web)
  ├─ Naver Maps JavaScript API
  ├─ VITE_API_BASE_URL -> Express API
  └─ VITE_VISION_API_BASE_URL -> YOLO Pose + SAM2 Vision API

Express API
  ├─ Naver Local Search (server-only Client Secret)
  └─ Supabase PostgreSQL / Storage (service-role key)

Vision API
  └─ YOLO11 Pose + SAM2
```

## Before GitHub Pages deployment

1. Deploy `apps/api` to a Node-compatible service and set `WEB_ORIGINS=https://yf560.github.io`.
2. Deploy `tools/yolo-sam2-overlay` to a Python service with persistent model storage. Set `VISION_ALLOWED_ORIGINS=https://yf560.github.io`.
3. In Naver Cloud Platform, add `https://yf560.github.io` to the Maps JavaScript API allowed Web service URLs.
4. Add these GitHub Actions secrets. Values beginning with `VITE_` are public browser configuration, never secret credentials.

| Secret | Value |
| --- | --- |
| `VITE_NAVER_MAPS_CLIENT_ID` | Naver Maps JavaScript Client ID |
| `VITE_API_BASE_URL` | Public Express API URL, for example `https://photo-nav-api.example.com` |
| `VITE_VISION_API_BASE_URL` | Public Vision API URL, for example `https://photo-nav-vision.example.com` |

5. Keep `NAVER_SEARCH_CLIENT_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` only in the Express service environment. Never put them in GitHub Pages or a Vite variable.
6. Run both checks before push:

```powershell
npm --prefix apps/web run security:check
npm --prefix apps/web run build
```

## Runtime checks

- `GET {Express API}/health` returns `ok: true`.
- `GET {Vision API}/api/health` returns `status: ok`.
- Browser requests for API and Vision endpoints use the configured public URLs.
- The browser bundle must never contain `NAVER_SEARCH_CLIENT_SECRET` or `SUPABASE_SERVICE_ROLE_KEY`.

## Rollback

If the external API or Vision URL is not ready, do not run the Pages deployment workflow. The map can still render, but search, candidate registration, and composition analysis will be unavailable.
