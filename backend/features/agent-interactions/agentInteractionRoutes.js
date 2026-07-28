import { Router } from "express";
import { toAgentInteractionDto } from "./agentInteractionMapper.js";
import {
  validateCreateAgentInteraction
} from "./agentInteractionValidation.js";

export function createAgentInteractionRouter({ processInteraction } = {}) {
  if (typeof processInteraction !== "function") {
    throw new TypeError("processInteraction must be a function.");
  }

  const router = Router();

  router.post("/", async (request, response, next) => {
    try {
      const input = validateCreateAgentInteraction(request.body);
      const result = await processInteraction(input);

      response.status(result.replayed ? 200 : 201).json({
        success: true,
        data: {
          interaction: toAgentInteractionDto(result.interaction)
        },
        meta: {
          replayed: result.replayed
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
