import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);

function parseEnvFile(contents) {
  contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .forEach((line) => {
      const index = line.indexOf("=");
      const key = line.slice(0, index).trim();
      const value = line
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");

      if (!process.env[key]) {
        process.env[key] = value;
      }
    });
}

async function loadLocalEnv() {
  for (const fileName of [".env", ".env.local"]) {
    const filePath = path.join(__dirname, fileName);
    if (existsSync(filePath)) {
      parseEnvFile(await readFile(filePath, "utf8"));
    }
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(JSON.stringify(payload));
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value || fallback);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeKakaoPlace(item) {
  const categoryParts = stripHtml(item.category_name).split(">").filter(Boolean);

  return {
    id: item.id,
    title: item.place_name || "이름 없는 업체",
    link: item.place_url || "",
    category: categoryParts.at(-1)?.trim() || "업체",
    fullCategory: categoryParts.join(" > ") || "분류 정보 없음",
    description: "",
    telephone: item.phone || "",
    address: item.address_name || "",
    roadAddress: item.road_address_name || "",
    x: item.x,
    y: item.y,
  };
}

async function handleKakaoLocalSearch(response, url) {
  const restApiKey = process.env.KAKAO_REST_API_KEY;

  if (!restApiKey) {
    sendJson(response, 501, {
      message:
        "카카오 로컬 API 키가 설정되지 않았습니다. .env.local에 KAKAO_REST_API_KEY를 추가해 주세요.",
      missingKeys: ["KAKAO_REST_API_KEY"],
    });
    return;
  }

  const query = (url.searchParams.get("query") || "문래동 맛집").trim();
  const size = clampNumber(url.searchParams.get("size"), 5, 1, 15);
  const page = clampNumber(url.searchParams.get("page"), 1, 1, 45);
  const sort = url.searchParams.get("sort") === "distance" ? "distance" : "accuracy";

  if (!query) {
    sendJson(response, 400, { message: "검색어 query가 필요합니다." });
    return;
  }

  const kakaoUrl = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  kakaoUrl.searchParams.set("query", query);
  kakaoUrl.searchParams.set("size", String(size));
  kakaoUrl.searchParams.set("page", String(page));
  kakaoUrl.searchParams.set("sort", sort);

  try {
    const kakaoResponse = await fetch(kakaoUrl, {
      headers: {
        Authorization: `KakaoAK ${restApiKey}`,
        KA: "sdk/1.0.0 os/javascript lang/ko-KR origin/http%3A%2F%2Flocalhost%3A3000",
      },
    });

    const payload = await kakaoResponse.json();

    if (!kakaoResponse.ok) {
      sendJson(response, kakaoResponse.status, {
        message: "카카오 로컬 API 요청에 실패했습니다.",
        detail: payload,
      });
      return;
    }

    sendJson(response, 200, {
      query,
      total: payload.meta?.total_count || 0,
      page,
      size,
      isEnd: Boolean(payload.meta?.is_end),
      items: (payload.documents || []).map(normalizeKakaoPlace),
    });
  } catch (error) {
    sendJson(response, 502, {
      message: "카카오 로컬 API 호출 중 문제가 발생했습니다.",
      detail: error.message,
    });
  }
}

async function handleStatic(response, url) {
  const buildDir = path.join(__dirname, "build");
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path
    .normalize(requestedPath)
    .replace(/^(\.\.[/\\])+/, "")
    .replace(/^[/\\]/, "");
  const filePath = path.join(buildDir, safePath);

  try {
    const bytes = await readFile(filePath);
    const ext = path.extname(filePath);
    const contentType =
      {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".ico": "image/x-icon",
        ".svg": "image/svg+xml",
      }[ext] || "application/octet-stream";

    response.writeHead(200, { "Content-Type": contentType });
    response.end(bytes);
  } catch {
    const indexPath = path.join(buildDir, "index.html");
    if (existsSync(indexPath)) {
      const bytes = await readFile(indexPath);
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(bytes);
      return;
    }

    sendJson(response, 404, {
      message: "build 폴더를 찾을 수 없습니다. npm run build를 먼저 실행해 주세요.",
    });
  }
}

await loadLocalEnv();

createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
    });
    response.end();
    return;
  }

  if (url.pathname === "/api/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (url.pathname === "/api/kakao/local") {
    await handleKakaoLocalSearch(response, url);
    return;
  }

  await handleStatic(response, url);
}).listen(PORT, () => {
  console.log(`Hub API server listening on http://localhost:${PORT}`);
});
