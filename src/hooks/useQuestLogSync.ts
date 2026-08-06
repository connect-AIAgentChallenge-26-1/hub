import { useEffect, useState } from "react";
import type { QuestLog } from "../data/questLogs";
import { fetchManagerContextViaApi, fetchQuestEventsViaApi, type ManagerContext } from "../layers/storage/questLogApi";

export type QuestLogSyncStatus = "idle" | "loading" | "saving" | "success" | "error";

export interface QuestLogSyncState {
  status: QuestLogSyncStatus;
  message: string;
}

interface UseQuestLogSyncInput {
  enabled: boolean;
  ignoreLogsBefore?: string | null;
  onLogsLoaded: (logs: QuestLog[]) => void;
  onManagerContextLoaded: (context: ManagerContext) => void;
}

export const questLogSyncMessages = {
  loading: "서버 기록을 불러오는 중이야.",
  loadSuccess: "서버 기록을 불러왔어.",
  loadError: "서버 기록을 불러오지 못했어. 로컬 화면 흐름은 계속 사용할 수 있어.",
  saving: "퀘스트 이벤트를 서버에 저장하는 중이야.",
  saveSuccess: "퀘스트 이벤트를 서버에 저장했어.",
  saveError: "기록 저장에 실패했어. 화면 흐름은 유지되고, 기록 노트에서 다시 확인할 수 있어.",
} as const;

export function useQuestLogSync({ enabled, ignoreLogsBefore = null, onLogsLoaded, onManagerContextLoaded }: UseQuestLogSyncInput) {
  const [logSync, setLogSync] = useState<QuestLogSyncState>({ status: "idle", message: "" });

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;
    setLogSync({ status: "loading", message: questLogSyncMessages.loading });
    Promise.all([fetchQuestEventsViaApi(100), fetchManagerContextViaApi()])
      .then(([serverLogs, managerContext]) => {
        if (cancelled) return;
        onLogsLoaded(filterQuestLogsAtOrAfter(serverLogs, ignoreLogsBefore));
        if (!ignoreLogsBefore) onManagerContextLoaded(managerContext);
        setLogSync({ status: "success", message: questLogSyncMessages.loadSuccess });
      })
      .catch(() => {
        if (cancelled) return;
        setLogSync({ status: "error", message: questLogSyncMessages.loadError });
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, ignoreLogsBefore, onLogsLoaded, onManagerContextLoaded]);

  return { logSync, setLogSync };
}

export function filterQuestLogsAtOrAfter(logs: QuestLog[], boundaryIso: string | null) {
  if (!boundaryIso) return logs;

  const boundaryTime = Date.parse(boundaryIso);
  if (!Number.isFinite(boundaryTime)) return logs;

  return logs.filter((log) => {
    const createdTime = Date.parse(log.createdAt);
    return Number.isFinite(createdTime) && createdTime >= boundaryTime;
  });
}
