# Photo Navigation API

네이버 지역 검색의 Client Secret을 브라우저에 노출하지 않기 위한 Express 프록시입니다.

```bash
cp .env.example .env
npm install
npm run dev
```

- `GET /health`: 서버 상태 확인
- `GET /api/places/search?q=두류공원`: 네이버 지역 검색 결과를 서비스에 필요한 형태로 반환

`NAVER_SEARCH_CLIENT_SECRET`은 `.env`에만 저장하고 GitHub Pages나 Vite 환경변수에 넣지 않습니다.

## Photo guide Storage upload

The 30 dataset photos, their overlays, pose guides, manually approved background guides, and comparison reports can be uploaded to the `photo-guides` bucket with one script.

```powershell
cd apps/api
npm run storage:upload-guides
```

The command above is a dry run and validates every local file. It never uploads. After applying the Supabase migration and creating the local `apps/api/.env` values, upload with:

```powershell
npm run storage:upload-guides -- --upload
```

The script uses `SUPABASE_SERVICE_ROLE_KEY` only in Node. Never put that key in `apps/web`, `VITE_` variables, GitHub Pages, or Git.
