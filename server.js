import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import {
  isSupabaseConfigured,
  SupabaseConfigurationError
} from "./backend/config/supabaseClient.js";
import { createServerConfig } from "./backend/config/serverConfig.js";
import {
  createAgentInteractionRouter
} from "./backend/features/agent-interactions/agentInteractionRoutes.js";
import {
  AgentInteractionValidationError
} from "./backend/features/agent-interactions/agentInteractionValidation.js";
import {
  createProcessAgentInteraction
} from "./backend/features/agent-interactions/services/processAgentInteraction.js";
import {
  AgentInteractionRepositoryError,
  AgentStateVersionConflictError,
  createSupabaseAgentInteractionRepository
} from "./backend/repositories/agentInteractionRepository.js";

dotenv.config({ quiet: true });

const serverConfig = createServerConfig(process.env);
const allowedOrigins = new Set(serverConfig.allowedOrigins);

export function createApp({
  processAgentInteraction,
  rateLimitOptions = {}
} = {}) {
  const app = express();
  const apiRateLimiter = rateLimit({
    windowMs: serverConfig.rateLimitWindowMs,
    limit: serverConfig.rateLimitMaximum,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler(request, response) {
      response.status(429).json({
        success: false,
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many API requests. Please try again later."
        }
      });
    },
    ...rateLimitOptions
  });

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: serverConfig.jsonBodyLimit }));
  app.get("/healthz", (request, response) => {
    response.status(200).json({ status: "ok" });
  });
  app.use(
  "/api",
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      const error = new Error("Origin is not allowed by the CORS policy.");
      error.code = "CORS_ORIGIN_DENIED";
      error.status = 403;
      callback(error);
    },
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"]
  }),
  apiRateLimiter
);

  if (typeof processAgentInteraction === "function") {
    app.use(
      "/api/agent-interactions",
      createAgentInteractionRouter({
        processInteraction: processAgentInteraction
      })
    );
  }

  app.use((request, response) => {
  response.status(404).json({
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "The requested route was not found."
    }
  });
  });

  app.use((error, request, response, next) => {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    response.status(400).json({
      success: false,
      error: {
        code: "INVALID_JSON",
        message: "The request body must contain valid JSON."
      }
    });
    return;
  }

  if (error.status === 413 || error.type === "entity.too.large") {
    response.status(413).json({
      success: false,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "The request body exceeds the allowed size."
      }
    });
    return;
  }

  if (error instanceof AgentInteractionValidationError) {
    response.status(400).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      }
    });
    return;
  }

  if (error instanceof AgentStateVersionConflictError) {
    response.status(409).json({
      success: false,
      error: {
        code: error.code,
        message:
          "The agent state changed during processing. Please retry the request."
      }
    });
    return;
  }

  if (error instanceof AgentInteractionRepositoryError) {
    console.error(error.cause ?? error);
    response.status(502).json({
      success: false,
      error: {
        code: error.code,
        message: "The agent data operation failed."
      }
    });
    return;
  }

  if (error instanceof SupabaseConfigurationError) {
    console.error(error.message);
    response.status(503).json({
      success: false,
      error: {
        code: error.code,
        message: "The database service is not configured."
      }
    });
    return;
  }

  if (error.status === 403 && error.code === "CORS_ORIGIN_DENIED") {
    response.status(403).json({
      success: false,
      error: {
        code: error.code,
        message: error.message
      }
    });
    return;
  }

  console.error(error);
  response.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An internal server error occurred."
    }
  });
  });

  return app;
}

const configuredAgentInteractionProcessor =
  serverConfig.agentInteractionsEnabled
    ? createProcessAgentInteraction({
        repository: createSupabaseAgentInteractionRepository()
      })
    : undefined;
const app = createApp({
  processAgentInteraction: configuredAgentInteractionProcessor
});

if (process.env.NODE_ENV !== "test") {
  app.listen(serverConfig.port, "0.0.0.0", () => {
    console.log(`Express server listening on http://localhost:${serverConfig.port}`);
    console.log(
      `Supabase configuration: ${isSupabaseConfigured() ? "ready" : "not configured"}`
    );
    console.log(
      `Agent interaction API: ${
        serverConfig.agentInteractionsEnabled ? "enabled" : "disabled"
      }`
    );
  });
}

export default app;
