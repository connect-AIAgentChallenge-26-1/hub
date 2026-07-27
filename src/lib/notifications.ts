'use client';

import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

import { createClient } from './supabase/client';

const DEVICE_ID_STORAGE_KEY = 'godsaeng-push-device-id';
const ANDROID_CHANNEL_ID = 'planner-alerts';

export type PushPermissionState =
  | 'prompt'
  | 'prompt-with-rationale'
  | 'granted'
  | 'denied';

export interface PushRegistrationResult {
  supported: boolean;
  permission: PushPermissionState;
  token: string | null;
}

export interface PushNotificationHandlers {
  onNotificationReceived?: (notification: unknown) => void;
  onNotificationAction?: (notification: unknown) => void;
}

const createDeviceId = (): string => {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
};

const getDeviceId = (): string => {
  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;

  const deviceId = createDeviceId();
  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, deviceId);
  return deviceId;
};

const saveToken = async (token: string): Promise<void> => {
  const normalizedToken = token.trim();
  if (!normalizedToken) throw new Error('FCM 토큰이 비어 있습니다.');

  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('로그인이 필요합니다.');

  const platform = Capacitor.getPlatform();
  const normalizedPlatform =
    platform === 'ios' || platform === 'android' ? platform : 'web';
  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: user.id,
      device_id: getDeviceId(),
      token: normalizedToken,
      platform: normalizedPlatform,
      enabled: true,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,device_id' },
  );
  if (error) throw new Error(error.message);
};

const deleteCurrentDeviceToken = async (): Promise<void> => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('push_tokens')
    .delete()
    .eq('user_id', user.id)
    .eq('device_id', getDeviceId());
};

/**
 * 사용자 액션(설정 버튼 등)에서 호출해야 합니다.
 * 권한을 요청하고 FCM 토큰을 현재 Supabase 사용자에게 등록합니다.
 */
export async function registerPushNotifications(): Promise<PushRegistrationResult> {
  const support = await FirebaseMessaging.isSupported();
  if (!support.isSupported) {
    return { supported: false, permission: 'denied', token: null };
  }

  let permission = (await FirebaseMessaging.checkPermissions()).receive;
  if (permission === 'prompt' || permission === 'prompt-with-rationale') {
    permission = (await FirebaseMessaging.requestPermissions()).receive;
  }

  if (permission !== 'granted') {
    return { supported: true, permission, token: null };
  }

  if (Capacitor.getPlatform() === 'android') {
    await FirebaseMessaging.createChannel({
      id: ANDROID_CHANNEL_ID,
      name: '일정 지연 및 방전 케어',
      description: '일정 지연 감지와 에너지 방전 케어 알림',
      importance: 5,
      vibration: true,
      lights: true,
    });
  }

  const { token } = await FirebaseMessaging.getToken();
  await saveToken(token);
  return { supported: true, permission, token };
}

/**
 * 앱 시작 후 한 번 연결하면 토큰 갱신, 포그라운드 수신, 알림 클릭을 처리합니다.
 * 반환된 cleanup 함수는 React effect 정리 시 호출합니다.
 */
export async function listenForPushNotifications(
  handlers: PushNotificationHandlers = {},
): Promise<() => Promise<void>> {
  const support = await FirebaseMessaging.isSupported();
  if (!support.isSupported) return async () => undefined;

  const listeners: PluginListenerHandle[] = [];

  listeners.push(
    await FirebaseMessaging.addListener('tokenReceived', ({ token }) => {
      void saveToken(token).catch(() => {
        // 다음 앱 실행 또는 토큰 이벤트에서 다시 등록합니다.
      });
    }),
  );

  listeners.push(
    await FirebaseMessaging.addListener(
      'notificationReceived',
      ({ notification }) => {
        handlers.onNotificationReceived?.(notification);
      },
    ),
  );

  listeners.push(
    await FirebaseMessaging.addListener(
      'notificationActionPerformed',
      ({ notification }) => {
        handlers.onNotificationAction?.(notification);
      },
    ),
  );

  return async () => {
    await Promise.allSettled(
      listeners.map((listener) => listener.remove()),
    );
  };
}

/**
 * 로그아웃 또는 알림 비활성화 시 현재 기기 토큰을 서버에서 비활성화합니다.
 */
export async function unregisterPushNotifications(): Promise<void> {
  await deleteCurrentDeviceToken();
  try {
    await FirebaseMessaging.deleteToken();
  } catch {
    // 기기 토큰이 이미 삭제된 경우 서버 비활성화만 유지합니다.
  }
}
