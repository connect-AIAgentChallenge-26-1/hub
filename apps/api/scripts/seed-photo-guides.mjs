import "dotenv/config";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { supabase, isSupabaseConfigured } from "../src/supabase.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../../..");
const datasetRoot = join(projectRoot, "assets", "photo-guides", "dataset");
const backgroundRoot = join(projectRoot, "assets", "photo-guides", "background-guides");
const bucket = "photo-guides";
const applyChanges = process.argv.includes("--apply");

const locations = [
  "naver-1784-stairs",
  "daegu-sparkland-wheel",
  "daegu-modern-history-museum",
];

const koreanTitles = {
  "couple-wide-v": "커플 전신 브이",
  "couple-selfie-v": "커플 셀카 브이",
  "couple-landmark-v": "커플 랜드마크 브이",
  "solo-wide-v": "1인 전신 브이",
  "solo-selfie-v": "1인 셀카 브이",
};

const storageUri = (path) => `storage://${bucket}/${path}`;

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

// Older background-guide files use line-1 style IDs. The DB accepts stable UUID-style
// IDs so a line can keep its identity when an administrator later edits the layout.
const stableLineId = (frameKey, index) => {
  const hex = createHash("sha256").update(`${frameKey}:${index}`).digest("hex");
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return `line_${uuid}`;
};

const normalizeBackgroundLines = (lines, frameKey) => {
  if (lines.length > 5) {
    console.warn(`${frameKey}: background lines were trimmed from ${lines.length} to 5 for the app contract.`);
  }

  return lines.slice(0, 5).map((line, index) => ({
    id: stableLineId(frameKey, index),
    start: line.start,
    end: line.end,
  }));
};

const buildGuideRow = async ({ locationSlug, manifest, entry, index, spotId }) => {
  const locationDirectory = join(datasetRoot, locationSlug);
  const poseGuide = await readJson(join(locationDirectory, entry.analysis.referenceGuide));
  const guideDirectory = manifest.location.spotKey.replaceAll("-", "_");
  const backgroundSlot = String(index + 1).padStart(2, "0");
  const backgroundGuide = await readJson(
    join(backgroundRoot, guideDirectory, `background_guide_${guideDirectory}_${backgroundSlot}.json`),
  );
  const framePath = `datasets/${manifest.location.spotKey}/${entry.id}`;

  return {
    external_key: entry.frameKey,
    spot_id: spotId,
    title: koreanTitles[entry.id] ?? entry.title,
    subtitle: entry.mode === "couple" ? "2인 촬영 가이드" : "1인 촬영 가이드",
    frame_type: entry.mode,
    reference_image_url: storageUri(`${framePath}/reference.png`),
    overlay_image_url: storageUri(`${framePath}/reference-overlay.png`),
    layout_json: poseGuide,
    background_guide_json: {
      version: backgroundGuide.version,
      horizonY: backgroundGuide.horizonY,
      backgroundLines: normalizeBackgroundLines(backgroundGuide.backgroundLines, entry.frameKey),
    },
    pose_guide_json: {
      version: poseGuide.version,
      personFrames: poseGuide.personFrames,
      personOutlines: poseGuide.personOutlines,
      personPoses: poseGuide.personPoses,
      poseSegments: poseGuide.poseSegments,
    },
    analysis_metadata: poseGuide.analysisMeta,
    shooting_tip: entry.prompt,
    status: "approved",
  };
};

if (!isSupabaseConfigured) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in apps/api/.env.");
}

const spotKeys = [];
const manifests = [];
for (const locationSlug of locations) {
  const manifest = await readJson(join(datasetRoot, locationSlug, "manifest.json"));
  spotKeys.push(manifest.location.spotKey);
  manifests.push({ locationSlug, manifest });
}

const { data: spots, error: spotError } = await supabase
  .from("photo_spots")
  .select("id, external_key")
  .in("external_key", spotKeys);

if (spotError) throw new Error(`Could not load photo spots: ${spotError.message}`);

const spotIdByKey = new Map(spots.map((spot) => [spot.external_key, spot.id]));
const missingSpotKeys = spotKeys.filter((spotKey) => !spotIdByKey.has(spotKey));
if (missingSpotKeys.length > 0) {
  throw new Error(`Missing photo_spots rows for: ${missingSpotKeys.join(", ")}`);
}

const rows = [];
for (const { locationSlug, manifest } of manifests) {
  for (const [index, entry] of manifest.entries.entries()) {
    rows.push(await buildGuideRow({
      locationSlug,
      manifest,
      entry,
      index,
      spotId: spotIdByKey.get(manifest.location.spotKey),
    }));
  }
}

console.log(`Prepared ${rows.length} approved photo guide rows for ${spotKeys.length} spots.`);
for (const row of rows) console.log(`- ${row.external_key}`);

if (!applyChanges) {
  console.log("Dry run complete. No database rows were written.");
  console.log("Run npm run db:seed-photo-guides -- --apply to upsert the 15 rows.");
  process.exit(0);
}

const { data, error } = await supabase
  .from("photo_guides")
  .upsert(rows, { onConflict: "external_key" })
  .select("id, external_key, spot_id, status");

if (error) throw new Error(`Could not upsert photo guides: ${error.message}`);

console.log(`Upserted ${data.length} photo guide rows.`);
