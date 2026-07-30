import "dotenv/config";
import { isSupabaseConfigured, supabase } from "../src/supabase.js";

const externalKey = "daegu-rooftop-pending";
const name = "대구 옥상 포토스팟 (사진 등록 예정)";

if (!isSupabaseConfigured) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in apps/api/.env.");
}

const { data, error } = await supabase
  .from("photo_spots")
  .delete()
  .or(`external_key.eq.${externalKey},name.eq.${name}`)
  .select("id, external_key, name");

if (error) throw new Error(`Failed to remove pending rooftop spot: ${error.message}`);

console.log(JSON.stringify({ removed: data ?? [] }, null, 2));
