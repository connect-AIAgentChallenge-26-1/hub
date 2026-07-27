import 'server-only';

import OpenAI from 'openai';
import { NextResponse } from 'next/server';

import {
  createRateLimitHeaders,
  rateLimit,
  type RateLimitResult,
} from '../../../../lib/rateLimiter';
import { createClient as createSupabaseClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = 'gpt-4o-mini';
const FREE_DAILY_LIMIT = 5;
const PAID_DAILY_LIMIT = 100;

interface ReorderTaskInput {
  id: string;
  text: string;
  done: boolean;
  durationMinutes: number;
  urgency: number;
}

interface ReorderRequest {
  currentTime: string;
  plannedEnd: string;
  delayMinutes: number;
  energyLevel: 'high' | 'mid' | 'low';
  tasks: ReorderTaskInput[];
}

interface ReorderedTask {
  id: string;
  text: string;
  priority: 'High' | 'Medium' | 'Low';
  reason: string;
  recommendedDurationMinutes: number;
}

interface ReorderResult {
  message: string;
  reorderedTasks: ReorderedTask[];
  actions: Array<{
    type: 'keep' | 'move-tomorrow' | 'shorten' | 'start-focus';
    title: string;
    taskId?: string;
  }>;
}

const getOpenAI = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY_MISSING');
  return new OpenAI({ apiKey });
};

const getAuthenticatedRateLimit = async (): Promise<
  { error: NextResponse } | { rate: RateLimitResult }
> => {
  const supabase = createSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: NextResponse.json(
        { success: false, error: '로그인이 필요합니다.' },
        { status: 401 },
      ),
    };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('subscription_plan')
    .eq('id', user.id)
    .maybeSingle();
  const isPaid =
    profile?.subscription_plan === 'pro' ||
    profile?.subscription_plan === 'team';
  const limit = isPaid ? PAID_DAILY_LIMIT : FREE_DAILY_LIMIT;
  const rate = await rateLimit(user.id, {
    limit,
    namespace: 'planner-ai',
  });

  if (!rate.success) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error:
            limit === FREE_DAILY_LIMIT
              ? '무료 플랜의 AI 일일 5회 사용량을 모두 사용했습니다.'
              : '오늘의 AI 사용량을 모두 사용했습니다.',
          resetAt: new Date(rate.resetAt).toISOString(),
        },
        {
          status: 429,
          headers: createRateLimitHeaders(rate),
        },
      ),
    };
  }

  return { rate };
};

const isTime = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

const normalizeRequest = (value: unknown): ReorderRequest => {
  if (!value || typeof value !== 'object') throw new Error('INVALID_REQUEST');
  const object = value as Record<string, unknown>;

  if (
    !isTime(object.currentTime) ||
    !isTime(object.plannedEnd) ||
    !['high', 'mid', 'low'].includes(String(object.energyLevel)) ||
    !Array.isArray(object.tasks)
  ) {
    throw new Error('INVALID_REQUEST');
  }

  const delayMinutes = Number(object.delayMinutes);
  if (!Number.isFinite(delayMinutes) || Math.abs(delayMinutes) > 1_440) {
    throw new Error('INVALID_REQUEST');
  }

  const tasks = object.tasks.slice(0, 100).map<ReorderTaskInput>((item) => {
    if (!item || typeof item !== 'object') throw new Error('INVALID_TASK');
    const task = item as Record<string, unknown>;
    const id = String(task.id ?? '').trim();
    const text = String(task.text ?? '').trim();
    if (!id || !text) throw new Error('INVALID_TASK');

    return {
      id: id.slice(0, 100),
      text: text.slice(0, 200),
      done: Boolean(task.done),
      durationMinutes: Math.max(
        5,
        Math.min(480, Math.round(Number(task.durationMinutes) || 25)),
      ),
      urgency: Math.max(
        1,
        Math.min(5, Math.round(Number(task.urgency) || 2)),
      ),
    };
  });

  return {
    currentTime: object.currentTime,
    plannedEnd: object.plannedEnd,
    delayMinutes: Math.round(delayMinutes),
    energyLevel: object.energyLevel as ReorderRequest['energyLevel'],
    tasks,
  };
};

const normalizeResult = (
  value: unknown,
  validTaskIds: Set<string>,
): ReorderResult => {
  if (!value || typeof value !== 'object') throw new Error('INVALID_AI_JSON');
  const object = value as Record<string, unknown>;
  if (!Array.isArray(object.reorderedTasks) || !Array.isArray(object.actions)) {
    throw new Error('INVALID_AI_JSON');
  }

  const reorderedTasks = object.reorderedTasks.map<ReorderedTask>((item) => {
    if (!item || typeof item !== 'object') throw new Error('INVALID_AI_TASK');
    const task = item as Record<string, unknown>;
    const id = String(task.id ?? '');
    const text = String(task.text ?? '').trim();
    const priority = String(task.priority);
    if (
      !validTaskIds.has(id) ||
      !text ||
      !['High', 'Medium', 'Low'].includes(priority)
    ) {
      throw new Error('INVALID_AI_TASK');
    }

    return {
      id,
      text: text.slice(0, 200),
      priority: priority as ReorderedTask['priority'],
      reason: String(task.reason ?? '').trim().slice(0, 500),
      recommendedDurationMinutes: Math.max(
        5,
        Math.min(
          480,
          Math.round(Number(task.recommendedDurationMinutes) || 25),
        ),
      ),
    };
  });

  const allowedActions = new Set([
    'keep',
    'move-tomorrow',
    'shorten',
    'start-focus',
  ]);
  const actions = object.actions.slice(0, 6).map((item) => {
    if (!item || typeof item !== 'object') throw new Error('INVALID_ACTION');
    const action = item as Record<string, unknown>;
    const type = String(action.type);
    const title = String(action.title ?? '').trim();
    const taskId =
      typeof action.taskId === 'string' ? action.taskId : undefined;
    if (
      !allowedActions.has(type) ||
      !title ||
      (taskId !== undefined && !validTaskIds.has(taskId))
    ) {
      throw new Error('INVALID_ACTION');
    }

    return {
      type: type as ReorderResult['actions'][number]['type'],
      title: title.slice(0, 200),
      taskId,
    };
  });

  return {
    message: String(object.message ?? '').trim().slice(0, 1_000),
    reorderedTasks,
    actions,
  };
};

export async function POST(request: Request) {
  const auth = await getAuthenticatedRateLimit();
  if ('error' in auth) return auth.error;
  const headers = createRateLimitHeaders(auth.rate);

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 128 * 1024) {
    return NextResponse.json(
      { success: false, error: '요청 본문이 허용 크기를 초과했습니다.' },
      { status: 413, headers },
    );
  }

  let input: ReorderRequest;
  try {
    input = normalizeRequest(await request.json());
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          'currentTime, plannedEnd, delayMinutes, energyLevel, tasks 형식을 확인해 주세요.',
      },
      { status: 400, headers },
    );
  }

  try {
    const pendingTasks = input.tasks.filter((task) => !task.done);
    const completion = await getOpenAI().chat.completions.create({
      model: MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            '너는 일정 지연 수습 전문 코치다.',
            '오직 유효한 JSON 객체만 반환하고 줄글이나 마크다운을 추가하지 마라.',
            'JSON 규격:',
            '{"message":"string","reorderedTasks":[{"id":"string","text":"string","priority":"High|Medium|Low","reason":"string","recommendedDurationMinutes":25}],"actions":[{"type":"keep|move-tomorrow|shorten|start-focus","title":"string","taskId":"string(optional)"}]}',
            '입력에 존재하는 미완료 task id만 사용하고 새로운 작업을 지어내지 마라.',
            '에너지가 low면 짧고 가벼운 작업을 우선하고, high면 긴급하고 어려운 작업을 우선한다.',
            '지연이 클수록 저우선순위 작업의 내일 이월 또는 축소를 제안한다.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            currentTime: input.currentTime,
            plannedEnd: input.plannedEnd,
            delayMinutes: input.delayMinutes,
            energyLevel: input.energyLevel,
            pendingTasks,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error('EMPTY_AI_RESPONSE');
    const result = normalizeResult(
      JSON.parse(content),
      new Set(pendingTasks.map((task) => task.id)),
    );

    return NextResponse.json(
      {
        success: true,
        ...result,
        usage: completion.usage
          ? {
              inputTokens: completion.usage.prompt_tokens,
              outputTokens: completion.usage.completion_tokens,
            }
          : undefined,
      },
      { headers },
    );
  } catch (error) {
    const missingKey =
      error instanceof Error && error.message === 'OPENAI_API_KEY_MISSING';
    return NextResponse.json(
      {
        success: false,
        error: missingKey
          ? '서버에 OpenAI API 키가 설정되지 않았습니다.'
          : 'AI가 지연 일정을 재정렬하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      },
      { status: missingKey ? 503 : 502, headers },
    );
  }
}
