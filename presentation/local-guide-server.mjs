import { createServer } from "node:http";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL(".", import.meta.url)));
const projectRoot = resolve(root, "..");
const port = Number(process.env.PORT || 5187);
const guideName = /^background_guide_(?:(daegu_modern_history_museum|daegu_sparkland_wheel|naver_1784_stairs)_(0[1-9]|10)|(daegu_indoor_gymnasium)_(01))\.json$/;
const mimeTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".css": "text/css; charset=utf-8" };

function send(res, status, body, contentType = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function validPoint(point) {
  return Array.isArray(point) && point.length === 2 && point.every(value => Number.isFinite(value) && value >= 0 && value <= 1);
}

function validGuide(fileName, guide) {
  const match = guideName.exec(fileName);
  if (!match || !guide || guide.kind !== "background_guide" || guide.id !== fileName.slice(0, -5) || !Array.isArray(guide.backgroundLines)) return false;
  return guide.backgroundLines.every(line => validPoint(line.start) && validPoint(line.end));
}

async function saveGuide(fileName, guide) {
  const match = guideName.exec(fileName);
  const scene = match[1] ?? match[3];
  const relative = join("assets", "photo-guides", "background-guides", scene, fileName);
  const targets = [join(root, relative), join(projectRoot, relative)];
  const content = `${JSON.stringify(guide, null, 2)}\n`;
  await Promise.all(targets.map(async target => {
    await mkdir(resolve(target, ".."), { recursive: true });
    const temporary = `${target}.tmp`;
    await writeFile(temporary, content, "utf8");
    await rename(temporary, target);
  }));
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host}`);
    if (req.method === "PUT" && url.pathname === "/api/background-guides") {
      let raw = "";
      for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) return send(res, 413, { error: "payload too large" }); }
      const { fileName, guide } = JSON.parse(raw);
      if (typeof fileName !== "string" || !validGuide(fileName, guide)) return send(res, 400, { error: "invalid background guide" });
      await saveGuide(fileName, guide);
      return send(res, 200, { ok: true, fileName });
    }

    const relativePath = decodeURIComponent(url.pathname === "/" ? "/background_guides_editor.html" : url.pathname);
    const filePath = normalize(resolve(root, `.${relativePath}`));
    if (!filePath.startsWith(`${root}\\`) && filePath !== root) return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
    const info = await stat(filePath);
    if (!info.isFile()) return send(res, 404, "Not found", "text/plain; charset=utf-8");
    res.writeHead(200, { "Content-Type": mimeTypes[extname(filePath).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(await readFile(filePath));
  } catch (error) {
    send(res, 500, { error: error instanceof Error ? error.message : "server error" });
  }
});

server.listen(port, "127.0.0.1", () => console.log(`Photo guide server: http://127.0.0.1:${port}`));
