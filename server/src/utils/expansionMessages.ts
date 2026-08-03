import { readJson, writeJson } from "./jsonStore";
import { getUserDataPath } from "./paths";
import type { ChatMessage } from "./messages";

// Generic version of messages.ts's getMessages/appendMessages for the Feature
// Expansion Workflow — same ChatMessage shape (reused via type import, not
// modifying messages.ts), parameterized by filename since an expansion's
// chat-based steps each get their own message log (design-messages.json now,
// more as later Days add chat-based steps) under
// data/users/{userId}/expansions/{expansionId}/.
function expansionMessagesFile(userId: number, expansionId: string, filename: string): string {
  return getUserDataPath(userId, "expansions", expansionId, filename);
}

export async function getExpansionMessages(
  userId: number,
  expansionId: string,
  filename: string
): Promise<ChatMessage[]> {
  try {
    return await readJson<ChatMessage[]>(expansionMessagesFile(userId, expansionId, filename));
  } catch {
    return [];
  }
}

export async function appendExpansionMessages(
  userId: number,
  expansionId: string,
  filename: string,
  newMessages: ChatMessage[]
): Promise<ChatMessage[]> {
  const existing = await getExpansionMessages(userId, expansionId, filename);
  const updated = [...existing, ...newMessages];
  await writeJson(expansionMessagesFile(userId, expansionId, filename), updated);
  return updated;
}
