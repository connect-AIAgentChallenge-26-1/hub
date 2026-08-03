import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { analyzeReviewSentiment, validateReviewContent } from "./server/sentimentService.mjs";
import { normalizeDisplayName } from "./server/profileService.mjs";
import { normalizeSavedPlaceInput, toPublicSavedPlace } from "./server/savedPlaceService.mjs";
import { uploadReceiptImage } from "./server/receiptUpload.mjs";
import { validateOcrReceipt, validateReceiptFile } from "./server/receiptVerificationService.mjs";
import { extractReceiptData, requestClovaReceiptOcr } from "./server/clovaOcrService.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const DATA_DIR = path.join(__dirname, ".local-data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const ALLOWED_ORIGINS = new Set(["http://localhost:3000", "http://127.0.0.1:3000"]);

function isAllowedOrigin(origin) {
  if (!origin || ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    const isPrivateIpv4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname);
    return url.protocol === "http:" && url.port === "3000" && isPrivateIpv4;
  } catch {
    return false;
  }
}

function parseEnvFile(contents) {
  contents.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && line.includes("=")).forEach((line) => {
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  });
}

async function loadLocalEnv() {
  for (const fileName of [".env", ".env.local"]) {
    const filePath = path.join(__dirname, fileName);
    if (existsSync(filePath)) parseEnvFile(await readFile(filePath, "utf8"));
  }
}

function sendJson(request, response, statusCode, payload, extraHeaders = {}) {
  Object.entries(extraHeaders).forEach(([name, value]) => response.setHeader(name, value));
  return response.status(statusCode).json(payload);
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeJsonFile(filePath, value) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readRequestJson(request) {
  return request.body || {};
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function validateSignup({ email, password, name }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "올바른 이메일 주소를 입력해 주세요.";
  if (password.length < 8) return "비밀번호는 8자 이상이어야 합니다.";
  if (name.length < 2 || name.length > 30) return "이름은 2자 이상 30자 이하로 입력해 주세요.";
  return "";
}

function createPasswordRecord(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}

function verifyPassword(password, user) {
  const actual = Buffer.from(scryptSync(password, user.passwordSalt, 64));
  const expected = Buffer.from(user.passwordHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}

function parseCookies(request) {
  return Object.fromEntries(String(request.headers.cookie || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const index = part.indexOf("=");
    return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
  }));
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

async function createSession(userId) {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  const sessions = (await readJsonFile(SESSIONS_FILE)).filter((session) => session.expiresAt > now);
  sessions.push({ id: randomUUID(), userId, tokenHash: hashToken(token), createdAt: now, expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000 });
  await writeJsonFile(SESSIONS_FILE, sessions);
  return token;
}

async function getAuthenticatedUser(request) {
  const authorization = String(request.headers.authorization || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;
  if (!supabase) return null;
  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData.user) return null;
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", authData.user.id).maybeSingle();
  return {
    id: authData.user.id,
    email: authData.user.email || "",
    name: profile?.display_name || authData.user.user_metadata?.display_name || "지금리뷰 사용자",
  };
}

function sessionCookie(token) {
  return `jr_session=${encodeURIComponent(token)}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

async function handleSignup(request, response) {
  const body = await readRequestJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const name = String(body.name || "").trim();
  const validationError = validateSignup({ email, password, name });
  if (validationError) return sendJson(request, response, 400, { message: validationError });

  const users = await readJsonFile(USERS_FILE);
  if (users.some((user) => user.email === email)) return sendJson(request, response, 409, { message: "이미 가입된 이메일입니다." });
  const passwordRecord = createPasswordRecord(password);
  const now = new Date().toISOString();
  const user = { id: randomUUID(), email, name, passwordSalt: passwordRecord.salt, passwordHash: passwordRecord.hash, createdAt: now, updatedAt: now };
  users.push(user);
  await writeJsonFile(USERS_FILE, users);
  const token = await createSession(user.id);
  return sendJson(request, response, 201, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(token) });
}

async function handleLogin(request, response) {
  const body = await readRequestJson(request);
  const email = normalizeEmail(body.email);
  const password = String(body.password || "");
  const users = await readJsonFile(USERS_FILE);
  const user = users.find((item) => item.email === email);
  if (!user || !verifyPassword(password, user)) return sendJson(request, response, 401, { message: "이메일 또는 비밀번호가 올바르지 않습니다." });
  const token = await createSession(user.id);
  return sendJson(request, response, 200, { user: publicUser(user) }, { "Set-Cookie": sessionCookie(token) });
}

async function handleLogout(request, response) {
  const token = parseCookies(request).jr_session;
  if (token) {
    const tokenHash = hashToken(token);
    const sessions = (await readJsonFile(SESSIONS_FILE)).filter((session) => session.tokenHash !== tokenHash);
    await writeJsonFile(SESSIONS_FILE, sessions);
  }
  return sendJson(request, response, 200, { ok: true }, { "Set-Cookie": "jr_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0" });
}

async function handleMe(request, response) {
  const user = await getAuthenticatedUser(request);
  if (!user) return sendJson(request, response, 401, { message: "로그인이 필요합니다." });
  return sendJson(request, response, 200, { user: publicUser(user) });
}

async function handleProfileUpdate(request, response) {
  const authenticatedUser = await getAuthenticatedUser(request);
  if (!authenticatedUser) return sendJson(request, response, 401, { message: "로그인이 필요합니다." });
  const body = await readRequestJson(request);
  let name;
  try {
    name = normalizeDisplayName(body.name);
  } catch (error) {
    return sendJson(request, response, 400, { message: error.message });
  }
  const { error: profileError } = await supabase.from("profiles").update({ display_name: name }).eq("id", authenticatedUser.id);
  if (profileError) return sendJson(request, response, 502, { message: "프로필을 수정하지 못했습니다." });
  await supabase.auth.admin.updateUserById(authenticatedUser.id, { user_metadata: { display_name: name } });
  return sendJson(request, response, 200, { user: { ...publicUser(authenticatedUser), name } });
}

async function handleSavedPlaces(request, response) {
  const user = await getAuthenticatedUser(request);
  if (!user) return sendJson(request, response, 401, { message: "로그인이 필요합니다." });
  const { data, error } = await supabase
    .from("saved_places")
    .select("created_at, places!inner(kakao_place_id,name,category,address,road_address,latitude,longitude,phone,kakao_place_url)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return sendJson(request, response, 502, { message: "관심 장소를 불러오지 못했습니다.", code: error.code });
  return sendJson(request, response, 200, { items: data.map(toPublicSavedPlace) });
}

async function handleSavePlace(request, response) {
  const user = await getAuthenticatedUser(request);
  if (!user) return sendJson(request, response, 401, { message: "로그인이 필요합니다." });
  let placeInput;
  try {
    placeInput = normalizeSavedPlaceInput((await readRequestJson(request)).place);
  } catch (error) {
    return sendJson(request, response, 400, { message: error.message });
  }
  const { data: place, error: placeError } = await supabase
    .from("places")
    .upsert(placeInput, { onConflict: "kakao_place_id" })
    .select("id")
    .single();
  if (placeError) return sendJson(request, response, 502, { message: "업체 정보를 저장하지 못했습니다.", code: placeError.code });
  const { error } = await supabase.from("saved_places").upsert({ user_id: user.id, place_id: place.id });
  if (error) return sendJson(request, response, 502, { message: "관심 장소를 저장하지 못했습니다.", code: error.code });
  return sendJson(request, response, 201, { saved: true, kakaoPlaceId: placeInput.kakao_place_id });
}

async function handleDeleteSavedPlace(request, response) {
  const user = await getAuthenticatedUser(request);
  if (!user) return sendJson(request, response, 401, { message: "로그인이 필요합니다." });
  const kakaoPlaceId = String(request.params.kakaoPlaceId || "").trim();
  const { data: place } = await supabase.from("places").select("id").eq("kakao_place_id", kakaoPlaceId).maybeSingle();
  if (!place) return sendJson(request, response, 200, { saved: false, kakaoPlaceId });
  const { error } = await supabase.from("saved_places").delete().eq("user_id", user.id).eq("place_id", place.id);
  if (error) return sendJson(request, response, 502, { message: "관심 장소 저장을 해제하지 못했습니다.", code: error.code });
  return sendJson(request, response, 200, { saved: false, kakaoPlaceId });
}

async function handleReviewAnalysis(request, response) {
  const user = await getAuthenticatedUser(request);
  if (!user) return sendJson(request, response, 401, { message: "로그인이 필요합니다." });

  try {
    const content = validateReviewContent((await readRequestJson(request)).content);
    const result = await analyzeReviewSentiment(content);
    return sendJson(request, response, 200, { analysis: result });
  } catch (error) {
    const isValidationError = /10자 이상 1000자 이하/.test(error.message);
    const isQuotaError = error?.status === 429 || error?.code === "insufficient_quota";
    console.error("Review sentiment analysis failed:", error.message);
    return sendJson(request, response, isValidationError ? 400 : isQuotaError ? 503 : 502, {
      message: isValidationError
        ? error.message
        : isQuotaError
          ? "리뷰 분석 API 사용 한도가 없습니다. OpenAI 결제 및 사용 한도를 확인해 주세요."
          : "리뷰 분석에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }
}

function publicReceipt(receipt, extracted) {
  return {
    id: receipt.id,
    status: receipt.status,
    merchantName: receipt.merchant_name,
    paidAt: receipt.paid_at,
    totalAmount: extracted.totalAmount,
    approvalNumber: extracted.approvalNumber
      ? `${"*".repeat(Math.max(0, extracted.approvalNumber.length - 4))}${extracted.approvalNumber.slice(-4)}`
      : "확인되지 않음",
  };
}

async function findPlaceFromReceipt(merchantName) {
  const restApiKey = process.env.KAKAO_REST_API_KEY;
  if (!restApiKey) throw new Error("장소 검색 API 키가 설정되지 않았습니다.");
  const url = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  url.searchParams.set("query", merchantName);
  url.searchParams.set("size", "5");
  url.searchParams.set("sort", "accuracy");
  const response = await fetch(url, { headers: { Authorization: `KakaoAK ${restApiKey}` } });
  const payload = await response.json();
  if (!response.ok || !payload.documents?.length) throw new Error("영수증 상호명과 일치하는 업체를 찾지 못했습니다.");
  const normalizedMerchant = String(merchantName).normalize("NFKC").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
  const matched = payload.documents.find((item) => {
    const name = String(item.place_name || "").normalize("NFKC").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
    return name.includes(normalizedMerchant) || normalizedMerchant.includes(name);
  }) || payload.documents[0];
  return normalizeKakaoPlace(matched);
}

async function handleReceiptVerification(request, response) {
  const user = await getAuthenticatedUser(request);
  if (!user) return sendJson(request, response, 401, { message: "로그인이 필요합니다." });
  if (!request.file) return sendJson(request, response, 400, { message: "영수증 이미지를 선택해 주세요." });

  let placeInput;
  try {
    validateReceiptFile({ type: request.file.mimetype, size: request.file.size });
    if (request.body.place) placeInput = normalizeSavedPlaceInput(JSON.parse(String(request.body.place)));
  } catch (error) {
    return sendJson(request, response, 400, { message: error.message });
  }

  const imageHash = createHash("sha256").update(request.file.buffer).digest("hex");
  const { data: duplicateImage } = await supabase.from("receipts").select("id").eq("image_hash", imageHash).maybeSingle();
  if (duplicateImage) return sendJson(request, response, 409, { message: "이미 인증에 사용된 영수증입니다." });

  let ocr;
  let extracted;
  let verified;
  try {
    ocr = await requestClovaReceiptOcr({
      buffer: request.file.buffer,
      mimeType: request.file.mimetype,
      fileName: request.file.originalname,
    });
    extracted = extractReceiptData(ocr.payload, { expectedMerchantName: placeInput?.name });
    if (!placeInput) placeInput = normalizeSavedPlaceInput(await findPlaceFromReceipt(extracted.merchantName));
    verified = validateOcrReceipt(extracted, { placeName: placeInput.name });
  } catch (error) {
    console.error("Receipt OCR verification failed:", error.message);
    return sendJson(request, response, error.status === 401 || error.status === 403 ? 502 : 422, { message: error.message });
  }

  const approvalNumberHash = verified.approvalNumber
    ? createHash("sha256").update(verified.approvalNumber).digest("hex")
    : null;
  const { data: place, error: placeError } = await supabase
    .from("places")
    .upsert(placeInput, { onConflict: "kakao_place_id" })
    .select("id")
    .single();
  if (placeError) return sendJson(request, response, 502, { message: "업체 정보를 저장하지 못했습니다.", code: placeError.code });

  if (approvalNumberHash) {
    const { data: duplicateApproval } = await supabase
      .from("receipts")
      .select("id")
      .eq("place_id", place.id)
      .eq("approval_number_hash", approvalNumberHash)
      .eq("paid_at", verified.paidAt)
      .maybeSingle();
    if (duplicateApproval) return sendJson(request, response, 409, { message: "이미 인증에 사용된 영수증입니다." });
  }

  const extension = request.file.mimetype === "image/png" ? "png" : "jpg";
  const storagePath = `${user.id}/${randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from("receipt-images").upload(storagePath, request.file.buffer, {
    contentType: request.file.mimetype,
    upsert: false,
  });
  if (uploadError) return sendJson(request, response, 502, {
    message: "영수증 이미지를 저장하지 못했습니다. OCR 준비 SQL이 실행되었는지 확인해 주세요.",
    code: uploadError.message,
  });

  const receiptRecord = {
    user_id: user.id,
    place_id: place.id,
    storage_path: storagePath,
    image_hash: imageHash,
    approval_number_hash: approvalNumberHash,
    merchant_name: verified.merchantName,
    paid_at: verified.paidAt,
    status: "verified",
    ocr_result: { requestId: ocr.requestId, totalAmount: extracted.totalAmount },
    verified_at: new Date().toISOString(),
    file_mime_type: request.file.mimetype,
    file_size: request.file.size,
    ocr_provider: "clova",
    ocr_request_id: ocr.requestId,
    ocr_requested_at: new Date().toISOString(),
  };
  const { data: receipt, error: receiptError } = await supabase.from("receipts").insert(receiptRecord).select("*").single();
  if (receiptError) {
    await supabase.storage.from("receipt-images").remove([storagePath]);
    return sendJson(request, response, receiptError.code === "23505" ? 409 : 502, {
      message: receiptError.code === "23505" ? "이미 인증에 사용된 영수증입니다." : "영수증 인증 결과를 저장하지 못했습니다.",
      code: receiptError.code,
    });
  }
  return sendJson(request, response, 201, {
    receipt: publicReceipt(receipt, extracted),
    place: {
      id: placeInput.kakao_place_id,
      title: placeInput.name,
      category: placeInput.category,
      fullCategory: placeInput.category,
      address: placeInput.road_address || placeInput.address,
      oldAddress: placeInput.address,
      roadAddress: placeInput.road_address,
      x: placeInput.longitude,
      y: placeInput.latitude,
      telephone: placeInput.phone,
      link: placeInput.kakao_place_url,
    },
  });
}

async function handleReviewCreate(request, response) {
  const user = await getAuthenticatedUser(request);
  if (!user) return sendJson(request, response, 401, { message: "로그인이 필요합니다." });
  try {
    const body = await readRequestJson(request);
    const content = validateReviewContent(body.content);
    const { data: receipt, error: receiptError } = await supabase
      .from("receipts")
      .select("id,place_id,status,user_id")
      .eq("id", String(body.receiptId || ""))
      .eq("user_id", user.id)
      .single();
    if (receiptError || receipt.status !== "verified") return sendJson(request, response, 422, { message: "인증 완료된 영수증이 필요합니다." });
    const analysis = await analyzeReviewSentiment(content);
    const { data: review, error } = await supabase.from("reviews").insert({
      user_id: user.id,
      place_id: receipt.place_id,
      receipt_id: receipt.id,
      content,
      sentiment_score: analysis.score,
      sentiment_bucket: analysis.bucket,
      sentiment_keywords: analysis.keywords,
      analysis_status: "completed",
      analysis_confidence: analysis.confidence,
      analysis_model: analysis.model,
      analyzed_at: new Date().toISOString(),
    }).select("id,content,sentiment_score,sentiment_bucket,sentiment_keywords,analysis_confidence,created_at").single();
    if (error) return sendJson(request, response, error.code === "23505" ? 409 : 502, { message: error.code === "23505" ? "이 영수증으로 이미 리뷰를 작성했습니다." : "리뷰를 저장하지 못했습니다.", code: error.code });
    return sendJson(request, response, 201, { review: {
      id: review.id,
      content: review.content,
      bucket: review.sentiment_bucket,
      score: Number(review.sentiment_score),
      confidence: Number(review.analysis_confidence),
      keywords: review.sentiment_keywords,
      createdAt: review.created_at,
    } });
  } catch (error) {
    console.error("Review creation failed:", error.message);
    return sendJson(request, response, error?.status === 429 ? 503 : 400, { message: error.message });
  }
}

async function handleReviewDelete(request, response) {
  const user = await getAuthenticatedUser(request);
  if (!user) return sendJson(request, response, 401, { message: "로그인이 필요합니다." });
  const { data, error } = await supabase
    .from("reviews")
    .delete()
    .eq("id", String(request.params.reviewId || ""))
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return sendJson(request, response, 502, { message: "리뷰를 삭제하지 못했습니다.", code: error.code });
  if (!data) return sendJson(request, response, 404, { message: "본인이 작성한 리뷰를 찾지 못했습니다." });
  return sendJson(request, response, 200, { deleted: true, id: data.id });
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value || fallback);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeKakaoPlace(item) {
  const categoryParts = String(item.category_name || "").split(">").map((part) => part.trim()).filter(Boolean);
  return { id: item.id, title: item.place_name || "이름 없는 업체", link: item.place_url || "", category: categoryParts.at(-1) || "업체", fullCategory: categoryParts.join(" > ") || "분류 정보 없음", description: "", telephone: item.phone || "", address: item.address_name || "", roadAddress: item.road_address_name || "", x: item.x, y: item.y };
}

async function handleKakaoLocalSearch(request, response, url) {
  const restApiKey = process.env.KAKAO_REST_API_KEY;
  if (!restApiKey) return sendJson(request, response, 501, { message: "카카오 Local REST API 키가 설정되지 않았습니다." });
  const query = String(url.searchParams.get("query") || "").trim();
  if (!query) return sendJson(request, response, 400, { message: "검색어를 입력해 주세요." });
  const size = clampNumber(url.searchParams.get("size"), 15, 1, 15);
  const hasCoordinates = url.searchParams.has("x") && url.searchParams.has("y");
  const x = hasCoordinates ? Number(url.searchParams.get("x")) : NaN;
  const y = hasCoordinates ? Number(url.searchParams.get("y")) : NaN;
  const radius = clampNumber(url.searchParams.get("radius"), 5000, 500, 20000);
  const kakaoUrl = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
  kakaoUrl.searchParams.set("query", query);
  kakaoUrl.searchParams.set("size", String(size));
  kakaoUrl.searchParams.set("page", String(clampNumber(url.searchParams.get("page"), 1, 1, 45)));
  if (hasCoordinates && Number.isFinite(x) && Number.isFinite(y)) {
    kakaoUrl.searchParams.set("x", String(x));
    kakaoUrl.searchParams.set("y", String(y));
    kakaoUrl.searchParams.set("radius", String(radius));
    kakaoUrl.searchParams.set("sort", "distance");
  } else {
    kakaoUrl.searchParams.set("sort", "accuracy");
  }
  try {
    const kakaoResponse = await fetch(kakaoUrl, { headers: { Authorization: `KakaoAK ${restApiKey}`, KA: "sdk/1.0.0 os/javascript lang/ko-KR origin/http%3A%2F%2Flocalhost%3A3000" } });
    const payload = await kakaoResponse.json();
    if (!kakaoResponse.ok) return sendJson(request, response, kakaoResponse.status, { message: "카카오 장소 검색에 실패했습니다.", detail: payload });
    return sendJson(request, response, 200, { query, total: payload.meta?.total_count || 0, isEnd: Boolean(payload.meta?.is_end), items: (payload.documents || []).map(normalizeKakaoPlace) });
  } catch (error) {
    return sendJson(request, response, 502, { message: "카카오 장소 검색 서버에 연결하지 못했습니다.", detail: error.message });
  }
}

await loadLocalEnv();
await mkdir(DATA_DIR, { recursive: true });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
const supabase = supabaseUrl && supabaseSecretKey
  ? createClient(supabaseUrl, supabaseSecretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  : null;

const app = express();
app.disable("x-powered-by");
app.use(cors({
  credentials: true,
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  origin(origin, callback) {
    callback(null, isAllowedOrigin(origin));
  },
}));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", async (request, response) => {
  if (!supabase) {
    return sendJson(request, response, 503, {
      ok: false,
      database: "disconnected",
      message: "Supabase 환경변수가 설정되지 않았습니다.",
    });
  }

  const { error } = await supabase
    .from("places")
    .select("id", { count: "exact", head: true });

  if (error) {
    return sendJson(request, response, 503, {
      ok: false,
      database: "disconnected",
      message: "Supabase 데이터베이스에 연결하지 못했습니다.",
      code: error.code,
    });
  }

  return sendJson(request, response, 200, { ok: true, database: "connected" });
});

app.get("/api/auth/me", handleMe);
app.patch("/api/users/me", handleProfileUpdate);
app.get("/api/saved-places", handleSavedPlaces);
app.post("/api/saved-places", handleSavePlace);
app.delete("/api/saved-places/:kakaoPlaceId", handleDeleteSavedPlace);
app.post("/api/reviews/analyze", handleReviewAnalysis);
app.post("/api/receipts/verify", uploadReceiptImage, handleReceiptVerification);
app.post("/api/receipts/scan", uploadReceiptImage, handleReceiptVerification);
app.post("/api/reviews", handleReviewCreate);
app.delete("/api/reviews/:reviewId", handleReviewDelete);
app.get("/api/kakao/local", (request, response) => {
  const url = new URL(request.originalUrl, `${request.protocol}://${request.get("host")}`);
  return handleKakaoLocalSearch(request, response, url);
});

const buildDir = path.join(__dirname, "build");
app.use(express.static(buildDir));
app.use((request, response, next) => {
  if (request.path.startsWith("/api/")) return sendJson(request, response, 404, { message: "API 경로를 찾을 수 없습니다." });
  const indexPath = path.join(buildDir, "index.html");
  if (!existsSync(indexPath)) return response.status(404).send("Build not found");
  return response.sendFile(indexPath);
});

app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  const statusCode = error.type === "entity.too.large" || error.code === "LIMIT_FILE_SIZE"
    ? 413
    : error.code?.startsWith("LIMIT_") || /영수증은 JPG/.test(error.message)
      ? 400
      : 500;
  return sendJson(request, response, statusCode, {
    message: statusCode === 413 ? "영수증 이미지는 10MB 이하만 사용할 수 있습니다." : statusCode === 400 ? error.message : "요청을 처리하지 못했습니다.",
    detail: error.message,
  });
});

app.listen(PORT, "0.0.0.0", () => console.log(`지금리뷰 Express API server listening on http://0.0.0.0:${PORT}`));
