import cors from "cors";
import { randomUUID } from "node:crypto";
import "dotenv/config";
import express from "express";
import multer from "multer";
import { isSupabaseConfigured, supabase } from "./supabase.js";

const app = express();
const allowedOrigins = (process.env.WEB_ORIGINS ?? "http://127.0.0.1:5173,http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("허용되지 않은 출처입니다."));
  },
  methods: ["GET", "POST"],
}));
app.use(express.json({ limit: "64kb" }));

const proposalUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => callback(null, file.mimetype.startsWith("image/")),
});

app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    service: "photo-navigation-api",
    dependencies: { supabase: isSupabaseConfigured ? "configured" : "not_configured" },
  });
});

function requireSupabase(_request, response, next) {
  if (!supabase) {
    return response.status(503).json({
      message: "포토스팟 DB가 아직 설정되지 않았습니다.",
      code: "SUPABASE_NOT_CONFIGURED",
    });
  }
  return next();
}

const storageUriPrefix = "storage://photo-guides/";

async function toSignedGuideAssetUrl(assetUrl) {
  if (!assetUrl?.startsWith(storageUriPrefix)) return assetUrl;

  const storagePath = assetUrl.slice(storageUriPrefix.length);
  const { data, error } = await supabase.storage
    .from("photo-guides")
    .createSignedUrl(storagePath, 60 * 30);

  if (error) throw new Error(`Could not sign guide asset: ${error.message}`);
  return data.signedUrl;
}

async function withSignedGuideAssets(guide) {
  return {
    ...guide,
    reference_image_url: await toSignedGuideAssetUrl(guide.reference_image_url),
    overlay_image_url: await toSignedGuideAssetUrl(guide.overlay_image_url),
  };
}

app.get("/api/photo-spots", requireSupabase, async (request, response) => {
  const status = String(request.query.status ?? "official").trim();
  if (!["official", "candidate", "rejected"].includes(status)) {
    return response.status(400).json({ message: "지원하지 않는 포토스팟 상태입니다." });
  }

  const { data, error } = await supabase
    .from("photo_spots")
    .select("*")
    .eq("status", status)
    .not("external_key", "like", "legacy-%")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Failed to load photo spots", error.message);
    return response.status(502).json({ message: "포토스팟을 불러오지 못했어요." });
  }

  const spotIds = data.map((spot) => spot.id);
  const { data: guides, error: guideError } = await supabase
    .from("photo_guides")
    .select("spot_id, reference_image_url, created_at")
    .in("spot_id", spotIds)
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  if (guideError) {
    console.error("Failed to load photo spot thumbnails", guideError.message);
    return response.status(502).json({ message: "포토스팟 대표 사진을 불러오지 못했어요." });
  }

  const thumbnailBySpotId = new Map();
  for (const guide of guides) {
    if (!thumbnailBySpotId.has(guide.spot_id)) thumbnailBySpotId.set(guide.spot_id, guide.reference_image_url);
  }

  try {
    const items = await Promise.all(data.map(async (spot) => ({
      ...spot,
      thumbnail_image_url: await toSignedGuideAssetUrl(thumbnailBySpotId.get(spot.id)),
    })));
    return response.json({ items });
  } catch (assetError) {
    console.error("Failed to sign photo spot thumbnails", assetError.message);
    return response.status(502).json({ message: "포토스팟 대표 사진을 준비하지 못했어요." });
  }
});

app.get("/api/photo-spots/:spotId", requireSupabase, async (request, response) => {
  const spotId = String(request.params.spotId ?? "").trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(spotId);
  if (!isUuid) {
    return response.status(400).json({ message: "올바른 포토스팟 ID가 아닙니다." });
  }

  const { data, error } = await supabase
    .from("photo_spots")
    .select("*, photo_guides!inner(*)")
    .eq("id", spotId)
    .in("status", ["official", "candidate"])
    .in("photo_guides.status", ["approved", "candidate"])
    .maybeSingle();

  if (error) {
    console.error("Failed to load photo spot", error.message);
    return response.status(502).json({ message: "포토스팟 상세를 불러오지 못했어요." });
  }
  if (!data) {
    return response.status(404).json({ message: "포토스팟을 찾지 못했어요." });
  }

  try {
    const photoGuides = await Promise.all(data.photo_guides.map(withSignedGuideAssets));
    return response.json({ item: { ...data, photo_guides: photoGuides } });
  } catch (assetError) {
    console.error("Failed to sign photo guide assets", assetError.message);
    return response.status(502).json({ message: "포토 가이드 이미지를 준비하지 못했어요." });
  }
});

function parseProposalLayout(value, frameType) {
  let layout;
  try {
    layout = JSON.parse(String(value ?? ""));
  } catch {
    return null;
  }
  const expectedPeople = frameType === "couple" ? 2 : 1;
  if (!Array.isArray(layout.personFrames) || layout.personFrames.length !== expectedPeople) return null;
  const validFrames = layout.personFrames.every((frame) => ["x", "y", "width", "height"].every((key) => {
    const number = Number(frame?.[key]);
    return Number.isFinite(number) && number >= 0 && number <= 1;
  }));
  if (!validFrames) return null;
  return {
    personFrames: layout.personFrames,
    personPoses: Array.isArray(layout.personPoses) ? layout.personPoses : [],
    personOutlines: Array.isArray(layout.personOutlines) ? layout.personOutlines : [],
    imageSize: layout.imageSize,
    orientation: layout.orientation,
  };
}

function safeProposalText(value, maxLength) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function proposalImageExtension(mimeType) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

app.post("/api/candidate-spots", requireSupabase, proposalUpload.single("image"), async (request, response) => {
  const name = safeProposalText(request.body.spotName, 80);
  const address = safeProposalText(request.body.address, 240);
  const frameType = String(request.body.frameType ?? "");
  const latitude = Number(request.body.latitude);
  const longitude = Number(request.body.longitude);
  const poseGuide = parseProposalLayout(request.body.poseGuide, frameType);

  if (!name || !address || !["solo", "couple"].includes(frameType) || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !poseGuide || !request.file) {
    return response.status(400).json({ message: "후보 장소명, 위치, 프레임, 분석된 인물 가이드와 사진을 확인해 주세요." });
  }

  const externalKey = `candidate-${randomUUID()}`;
  const frameKey = `${externalKey}--${frameType}-guide`;
  const storagePath = `candidate-submissions/${externalKey}/reference.${proposalImageExtension(request.file.mimetype)}`;
  const storageUrl = `${storageUriPrefix}${storagePath}`;
  const backgroundGuide = { horizonY: null, backgroundLines: [] };
  const guideJson = {
    version: "1.0",
    ...poseGuide,
    backgroundLines: [],
  };
  const spotRow = {
    external_key: externalKey,
    name,
    area: address.split(" ").slice(0, 2).join(" ") || "사용자 제안 장소",
    description: `${frameType === "couple" ? "커플" : "1인"} 촬영 구도로 제안된 포토스팟입니다.`,
    place_category: "사용자 제안 · 포토스팟",
    address,
    place_tip: "등록한 예시 사진의 인물 배치를 기준으로 구도를 맞춰보세요.",
    latitude,
    longitude,
    status: "candidate",
    image_tone: "plaza",
    place_source: { source: "candidate_proposal", coordinate_source: "user_selected" },
  };

  const { error: uploadError } = await supabase.storage.from("photo-guides").upload(storagePath, request.file.buffer, {
    contentType: request.file.mimetype,
    upsert: false,
  });
  if (uploadError) {
    console.error("Failed to upload candidate image", uploadError.message);
    return response.status(502).json({ message: "후보 사진을 저장하지 못했어요." });
  }

  const { data: spot, error: spotError } = await supabase
    .from("photo_spots")
    .insert(spotRow)
    .select("*")
    .single();
  if (spotError) {
    await supabase.storage.from("photo-guides").remove([storagePath]);
    console.error("Failed to create candidate spot", spotError.message);
    return response.status(502).json({ message: "후보 포토스팟을 저장하지 못했어요." });
  }

  const guideRow = {
    external_key: frameKey,
    spot_id: spot.id,
    title: frameType === "couple" ? "커플 후보 구도" : "1인 후보 구도",
    subtitle: "후보 제안 · 분석 완료",
    frame_type: frameType,
    reference_image_url: storageUrl,
    overlay_image_url: null,
    layout_json: guideJson,
    background_guide_json: backgroundGuide,
    pose_guide_json: poseGuide,
    analysis_metadata: { source: "candidate_proposal", generated_by: "yolo_pose_sam2" },
    shooting_tip: spotRow.place_tip,
    // The spot remains a candidate. Its generated guide is publishable so the
    // candidate can immediately reuse the same frame and camera flow.
    status: "approved",
  };
  const { data: guide, error: guideError } = await supabase
    .from("photo_guides")
    .insert(guideRow)
    .select("*")
    .single();
  if (guideError) {
    await supabase.from("photo_spots").delete().eq("id", spot.id);
    await supabase.storage.from("photo-guides").remove([storagePath]);
    console.error("Failed to create candidate guide", guideError.message);
    return response.status(502).json({ message: "후보 촬영 가이드를 저장하지 못했어요." });
  }

  try {
    return response.status(201).json({
      item: { ...spot, thumbnail_image_url: await toSignedGuideAssetUrl(storageUrl) },
      photo_guides: [await withSignedGuideAssets(guide)],
    });
  } catch (assetError) {
    console.error("Failed to sign candidate assets", assetError.message);
    return response.status(502).json({ message: "후보 포토스팟은 저장됐지만 사진 URL을 준비하지 못했어요." });
  }
});

app.get("/api/places/search", async (request, response) => {
  const query = String(request.query.q ?? "").trim();
  if (query.length < 2 || query.length > 100) {
    return response.status(400).json({ message: "검색어는 2~100자로 입력해 주세요." });
  }

  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return response.status(503).json({
      message: "장소 검색 API가 아직 설정되지 않았습니다.",
      code: "NAVER_SEARCH_NOT_CONFIGURED",
    });
  }

  try {
    const naverResponse = await fetch(
      `https://openapi.naver.com/v1/search/local.json?query=${encodeURIComponent(query)}&display=5`,
      {
        headers: {
          "X-Naver-Client-Id": clientId,
          "X-Naver-Client-Secret": clientSecret,
        },
      },
    );

    if (!naverResponse.ok) {
      return response.status(502).json({ message: "네이버 장소 정보를 불러오지 못했어요." });
    }

    const data = await naverResponse.json();
    const removeHtml = (value = "") => value.replace(/<[^>]*>/g, "");
    return response.json({
      items: data.items.map((item) => ({
        name: removeHtml(item.title),
        category: item.category,
        description: removeHtml(item.description),
        address: item.roadAddress || item.address,
        link: item.link,
      })),
    });
  } catch {
    return response.status(502).json({ message: "장소 검색 서비스에 연결하지 못했어요." });
  }
});

export default app;
