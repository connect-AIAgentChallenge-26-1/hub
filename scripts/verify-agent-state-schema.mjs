import dotenv from "dotenv";

dotenv.config({ quiet: true });

const REQUIRED_TABLES = [
  "agent_instances",
  "agent_interactions",
  "agent_state_snapshots",
  "experience_memories"
];

const REQUIRED_RPC = "commit_agent_interaction";

function readConfiguration() {
  const url = process.env.SUPABASE_URL?.trim();
  const secretKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !secretKey) {
    throw new Error(
      "SUPABASE_URL and a server-only Supabase key are required."
    );
  }

  return { url, secretKey };
}

async function readPostgrestSchema({ url, secretKey }) {
  const response = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      Accept: "application/openapi+json"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Supabase schema request failed with status ${response.status}.`
    );
  }

  return response.json();
}

function verifyRequiredPaths(schema) {
  const paths = schema?.paths || {};
  const missingResources = REQUIRED_TABLES.filter(
    (tableName) => !paths[`/${tableName}`]
  );

  if (!paths[`/rpc/${REQUIRED_RPC}`]) {
    missingResources.push(`rpc/${REQUIRED_RPC}`);
  }

  if (missingResources.length > 0) {
    throw new Error(
      `Agent state schema is not applied. Missing: ${missingResources.join(", ")}.`
    );
  }
}

try {
  const schema = await readPostgrestSchema(readConfiguration());
  verifyRequiredPaths(schema);
  console.log(
    "Agent state schema check passed: four tables and commit RPC are exposed."
  );
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "An unknown error occurred."
  );
  process.exitCode = 1;
}
