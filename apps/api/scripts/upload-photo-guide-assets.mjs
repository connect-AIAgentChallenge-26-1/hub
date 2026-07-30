import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDirectory, "../../..");
const datasetRoot = join(projectRoot, "assets", "photo-guides", "dataset");
const backgroundRoot = join(projectRoot, "assets", "photo-guides", "background-guides");
const bucket = process.argv.find((argument) => argument.startsWith("--bucket="))?.split("=")[1] ?? "photo-guides";
const shouldUpload = process.argv.includes("--upload");

const contentTypeFor = (filePath) => {
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".json")) return "application/json";
  return "application/octet-stream";
};

const requireFile = async (filePath) => {
  try {
    await stat(filePath);
    return filePath;
  } catch {
    throw new Error(`Required dataset file is missing: ${relative(projectRoot, filePath)}`);
  }
};

const storageKey = (spotKey, frameKey, fileName) =>
  `datasets/${spotKey}/${frameKey}/${fileName}`;

const buildAssets = async () => {
  const locations = [
    "daegu-modern-history-museum",
    "daegu-sparkland-wheel",
    "naver-1784-stairs",
  ];
  const assets = [];
  let imageCount = 0;

  for (const locationSlug of locations) {
    const locationDirectory = join(datasetRoot, locationSlug);
    const manifestPath = join(locationDirectory, "manifest.json");
    const manifest = JSON.parse(await readFile(await requireFile(manifestPath), "utf8"));
    const spotKey = manifest.location.spotKey;
    const guideDirectory = spotKey.replaceAll("-", "_");

    assets.push({
      localPath: manifestPath,
      storagePath: `datasets/${spotKey}/manifest.json`,
    });

    for (const [index, entry] of manifest.entries.entries()) {
      const referenceSlot = String(index + 1).padStart(2, "0");
      const comparisonSlot = String(index + 6).padStart(2, "0");
      const files = [
        [entry.reference, "reference.png", true],
        [entry.comparison, "comparison.png", true],
        [entry.referenceOverlay, "reference-overlay.png", false],
        [entry.comparisonOverlay, "comparison-overlay.png", false],
        [entry.analysis.referenceGuide, "reference-pose-guide.json", false],
        [entry.analysis.comparisonGuide, "comparison-pose-guide.json", false],
        [entry.analysis.report, "comparison-report.json", false],
      ];

      for (const [sourcePath, destinationName, isPhoto] of files) {
        const localPath = await requireFile(join(locationDirectory, sourcePath));
        assets.push({
          localPath,
          storagePath: storageKey(spotKey, entry.id, destinationName),
        });
        if (isPhoto) imageCount += 1;
      }

      for (const [slot, destinationName] of [
        [referenceSlot, "reference-background-guide.json"],
        [comparisonSlot, "comparison-background-guide.json"],
      ]) {
        const fileName = `background_guide_${guideDirectory}_${slot}.json`;
        const localPath = await requireFile(join(backgroundRoot, guideDirectory, fileName));
        assets.push({
          localPath,
          storagePath: storageKey(spotKey, entry.id, destinationName),
        });
      }
    }
  }

  if (imageCount !== 30) {
    throw new Error(`Expected 30 source photos but mapped ${imageCount}.`);
  }
  return { assets, imageCount };
};

const { assets, imageCount } = await buildAssets();
console.log(`Validated ${imageCount} photos and ${assets.length} total Storage objects.`);

if (!shouldUpload) {
  console.log("Dry run complete. No file was uploaded.");
  console.log("Run `npm run storage:upload-guides -- --upload` to upload after reviewing the paths.");
  process.exit(0);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in apps/api/.env.");
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

for (const [index, asset] of assets.entries()) {
  const body = await readFile(asset.localPath);
  const { error } = await supabase.storage.from(bucket).upload(asset.storagePath, body, {
    contentType: contentTypeFor(asset.localPath),
    upsert: true,
  });
  if (error) throw new Error(`Upload failed for ${asset.storagePath}: ${error.message}`);
  console.log(`[${index + 1}/${assets.length}] ${asset.storagePath}`);
}

console.log(`Uploaded ${assets.length} objects to the ${bucket} bucket.`);
