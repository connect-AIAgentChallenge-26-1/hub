import 'server-only';

import OpenAI from 'openai';
import { NextResponse } from 'next/server';

import {
  createRateLimitHeaders,
  rateLimit,
  type RateLimitResult,
} from '../../../../lib/rateLimiter';
import { checkSubscriptionForUser } from '../../../../lib/guards/subscriptionGuard';
import { createClient as createSupabaseClient } from '../../../../lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MODEL = 'gpt-4o-mini';
const FREE_DAILY_LIMIT = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  'application/pdf',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

interface ParsedTask {
  text: string;
  durationMinutes: number;
  urgency: number;
  details: string[];
  source: 'upload';
}

interface ParseResult {
  summary: string;
  tasks: ParsedTask[];
}

const getOpenAI = () => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY_MISSING');
  }
  return new OpenAI({ apiKey });
};

const getAuthenticatedRateLimit = async (): Promise<
  | { error: NextResponse }
  | { userId: string; rate: RateLimitResult | null }
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

  const subscription = await checkSubscriptionForUser(
    user.id,
    'unlimited-ai-parse',
  );
  if (subscription.reason === 'subscription-unavailable') {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: '구독 상태를 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
        },
        { status: 503 },
      ),
    };
  }
  if (subscription.allowed) {
    return { userId: user.id, rate: null };
  }

  const rate = await rateLimit(user.id, {
    limit: FREE_DAILY_LIMIT,
    namespace: 'planner-ai',
  });

  if (!rate.success) {
    return {
      error: NextResponse.json(
        {
          success: false,
          error: '무료 플랜의 AI 일일 5회 사용량을 모두 사용했습니다.',
          resetAt: new Date(rate.resetAt).toISOString(),
        },
        {
          status: 429,
          headers: createRateLimitHeaders(rate),
        },
      ),
    };
  }

  return { userId: user.id, rate };
};

const normalizeParseResult = (value: unknown): ParseResult => {
  if (!value || typeof value !== 'object') {
    throw new Error('INVALID_AI_JSON');
  }

  const object = value as Record<string, unknown>;
  if (!Array.isArray(object.tasks)) {
    throw new Error('INVALID_AI_JSON');
  }

  const tasks = object.tasks.slice(0, 30).map<ParsedTask>((item) => {
    if (!item || typeof item !== 'object') {
      throw new Error('INVALID_AI_TASK');
    }
    const task = item as Record<string, unknown>;
    const text = typeof task.text === 'string' ? task.text.trim() : '';
    if (!text) throw new Error('INVALID_AI_TASK');

    const rawDuration = Number(task.durationMinutes);
    const rawUrgency = Number(task.urgency);
    const details = Array.isArray(task.details)
      ? task.details
          .filter((detail): detail is string => typeof detail === 'string')
          .map((detail) => detail.trim())
          .filter(Boolean)
          .slice(0, 10)
      : [];

    return {
      text: text.slice(0, 200),
      durationMinutes: Math.max(
        5,
        Math.min(480, Math.round(rawDuration || 25)),
      ),
      urgency: Math.max(1, Math.min(5, Math.round(rawUrgency || 2))),
      details,
      source: 'upload',
    };
  });

  return {
    summary:
      typeof object.summary === 'string'
        ? object.summary.trim().slice(0, 1_000)
        : '',
    tasks,
  };
};

export async function POST(request: Request) {
  const auth = await getAuthenticatedRateLimit();
  if ('error' in auth) return auth.error;
  const headers = auth.rate
    ? createRateLimitHeaders(auth.rate)
    : { 'X-Subscription-Access': 'paid-unlimited' };

  try {
    const contentLength = Number(request.headers.get('content-length') ?? 0);
    if (
      Number.isFinite(contentLength) &&
      contentLength > MAX_FILE_BYTES + 1024 * 1024
    ) {
      return NextResponse.json(
        { success: false, error: '요청 본문이 허용 크기를 초과했습니다.' },
        { status: 413, headers },
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const context = String(formData.get('context') ?? '').trim().slice(0, 2_000);

    if (!(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: '분석할 파일을 첨부해 주세요.' },
        { status: 400, headers },
      );
    }
    if (!ACCEPTED_TYPES.has(file.type)) {
      return NextResponse.json(
        {
          success: false,
          error: 'PDF, PNG, JPEG, WEBP, GIF 파일만 분석할 수 있습니다.',
        },
        { status: 415, headers },
      );
    }
    if (file.size === 0 || file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        {
          success: false,
          error: '파일 크기는 1바이트 이상 10MB 이하여야 합니다.',
        },
        { status: 413, headers },
      );
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const dataUrl = `data:${file.type};base64,${bytes.toString('base64')}`;
    const userContent: Array<Record<string, unknown>> = [
      {
        type: 'text',
        text: [
          '첨부 파일에서 일정, 마감일, 공부 또는 업무 항목을 찾아 체크리스트 JSON으로 변환해라.',
          context ? `사용자 추가 설명: ${context}` : '',
          '반드시 JSON 객체 하나만 반환해라.',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];

    if (file.type.startsWith('image/')) {
      userContent.push({
        type: 'image_url',
        image_url: { url: dataUrl, detail: 'high' },
      });
    } else {
      userContent.push({
        type: 'file',
        file: {
          filename: file.name || 'planner-document.pdf',
          file_data: dataUrl,
        },
      });
    }

    const completion = await getOpenAI().chat.completions.create({
      model: MODEL,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            '너는 일정 관리 문서 파서다.',
            '다른 설명 없이 오직 유효한 JSON 객체만 반환해라.',
            'JSON 규격:',
            '{"summary":"string","tasks":[{"text":"string","durationMinutes":25,"urgency":1,"details":["string"]}]}',
            'durationMinutes는 5~480, urgency는 1~5 정수다.',
            '파일에 없는 개인정보나 일정을 추측하지 마라.',
          ].join('\n'),
        },
        {
          role: 'user',
          content:
            userContent as unknown as OpenAI.Chat.Completions.ChatCompletionUserMessageParam['content'],
        },
      ],
    });

    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error('EMPTY_AI_RESPONSE');
    const result = normalizeParseResult(JSON.parse(content));

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
          : 'AI가 파일을 분석하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      },
      { status: missingKey ? 503 : 502, headers },
    );
  }
}
