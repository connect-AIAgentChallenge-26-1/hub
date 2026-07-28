import dotenv from "dotenv";
import {
  getSupabaseClient,
  SupabaseConfigurationError
} from "../backend/config/supabaseClient.js";

dotenv.config({ quiet: true });

async function verifyConnection() {
  const { error } = await getSupabaseClient()
    .from("agent_instances")
    .select("id")
    .limit(1);

  if (error) {
    throw new Error(`Supabase query failed: ${error.message}`);
  }

  console.log("Supabase connection and agent_instances read check passed.");
}

try {
  await verifyConnection();
} catch (error) {
  if (error instanceof SupabaseConfigurationError) {
    console.error(`Supabase connection check could not start. ${error.message}`);
  } else {
    console.error(error instanceof Error ? error.message : "An unknown error occurred.");
  }

  process.exitCode = 1;
}
