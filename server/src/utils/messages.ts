import { readJson, writeJson } from "./jsonStore";
import { getUserDataPath } from "./paths";

export interface ChatMessage {
  id: string;
  from: "user" | "agent";
  text: string;
  created_at: string;
}

function messagesFile(userId: number, stepId: number | string): string {
  return getUserDataPath(userId, "messages", `${stepId}.json`);
}

export async function getMessages(userId: number, stepId: number | string): Promise<ChatMessage[]> {
  try {
    return await readJson<ChatMessage[]>(messagesFile(userId, stepId));
  } catch {
    return [];
  }
}

export async function appendMessages(
  userId: number,
  stepId: number | string,
  newMessages: ChatMessage[]
): Promise<ChatMessage[]> {
  const existing = await getMessages(userId, stepId);
  const updated = [...existing, ...newMessages];
  await writeJson(messagesFile(userId, stepId), updated);
  return updated;
}
