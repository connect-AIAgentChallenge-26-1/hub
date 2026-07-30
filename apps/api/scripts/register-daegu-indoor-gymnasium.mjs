import "dotenv/config";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isSupabaseConfigured, supabase } from "../src/supabase.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../../..");
const spotKey = "daegu-indoor-gymnasium";
const frameKey = `${spotKey}--solo-landmark-v`;
const framePath = `datasets/${spotKey}/solo-landmark-v`;
const sourceImagePath = join(projectRoot, "assets", "photo-guides", "dataset", spotKey, "images", "reference", "solo-landmark-v.png");
const backgroundGuidePath = join(projectRoot, "assets", "photo-guides", "background-guides", "daegu_indoor_gymnasium", "background_guide_daegu_indoor_gymnasium_01.json");
const poseGuidePath = join(projectRoot, "assets", "photo-guides", "dataset", spotKey, "guides", "reference", "solo-landmark-v.guide.json");
const overlayImagePath = join(projectRoot, "assets", "photo-guides", "dataset", spotKey, "reference-overlay.png");
const applyChanges = process.argv.includes("--apply");
const storageUri = (path) => `storage://photo-guides/${path}`;

const backgroundGuide = JSON.parse(await readFile(backgroundGuidePath, "utf8"));
const poseGuide = JSON.parse(await readFile(poseGuidePath, "utf8"));
const referenceImage = await readFile(sourceImagePath);
const overlayImage = await readFile(overlayImagePath);

const guideJson = {
  version: 5,
  horizonY: backgroundGuide.horizonY,
  personFrames: poseGuide.personFrames,
  personOutlines: poseGuide.personOutlines,
  personPoses: poseGuide.personPoses,
  poseSegments: poseGuide.poseSegments,
  backgroundLines: backgroundGuide.backgroundLines,
};

const spotRow = {
  external_key: spotKey,
  name: "대구 실내 체육관",
  area: "대구 북구 산격동",
  description: "돔 경기장 지붕선과 야경을 함께 담는 1인 셀카 프레임",
  place_category: "체육관 · 야경",
  address: "대구광역시 북구 대구체육관로 39",
  place_tip: "돔 지붕선을 오른쪽 배경선에 맞추고, 인물은 왼쪽 하단에 두세요.",
  latitude: 35.8941141299382,
  longitude: 128.605571138543,
  status: "official",
  image_tone: "stage",
  place_source: {
    name: "대구체육관",
    coordinate_source: "관리자 선택 좌표",
    coordinate_precision: "exact",
  },
};

if (!isSupabaseConfigured) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in apps/api/.env.");
}

console.log(`Prepared ${spotKey} with ${backgroundGuide.backgroundLines.length} background lines.`);
if (!applyChanges) {
  console.log("Dry run complete. No Storage object or DB row was written.");
  console.log("Run npm run db:register-daegu-indoor-gymnasium -- --apply to register it.");
  process.exit(0);
}

const uploads = [
  ["reference.png", referenceImage, "image/png"],
  ["reference-overlay.png", overlayImage, "image/png"],
  ["background-guide.json", Buffer.from(`${JSON.stringify(backgroundGuide, null, 2)}\n`), "application/json"],
  ["reference-pose-guide.json", Buffer.from(`${JSON.stringify(poseGuide, null, 2)}\n`), "application/json"],
];

for (const [fileName, body, contentType] of uploads) {
  const { error } = await supabase.storage.from("photo-guides").upload(`${framePath}/${fileName}`, body, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(`Storage upload failed for ${fileName}: ${error.message}`);
}

const { data: spot, error: spotError } = await supabase
  .from("photo_spots")
  .upsert(spotRow, { onConflict: "external_key" })
  .select("id, external_key")
  .single();

if (spotError) throw new Error(`Spot upsert failed: ${spotError.message}`);

const guideRow = {
  external_key: frameKey,
  spot_id: spot.id,
  title: "1인 야경 셀카",
  subtitle: "돔 경기장 배경 가이드",
  frame_type: "solo",
  reference_image_url: storageUri(`${framePath}/reference.png`),
  overlay_image_url: storageUri(`${framePath}/reference-overlay.png`),
  layout_json: guideJson,
  background_guide_json: {
    version: backgroundGuide.version,
    horizonY: backgroundGuide.horizonY,
    backgroundLines: backgroundGuide.backgroundLines,
  },
  pose_guide_json: poseGuide,
  analysis_metadata: { ...poseGuide.analysisMeta, background_guide_id: backgroundGuide.id },
  shooting_tip: spotRow.place_tip,
  status: "approved",
};

const { data: guide, error: guideError } = await supabase
  .from("photo_guides")
  .upsert(guideRow, { onConflict: "external_key" })
  .select("id, external_key, spot_id, status")
  .single();

if (guideError) throw new Error(`Photo guide upsert failed: ${guideError.message}`);

console.log(JSON.stringify({ spot, guide, uploads: uploads.map(([fileName]) => `${framePath}/${fileName}`) }, null, 2));
