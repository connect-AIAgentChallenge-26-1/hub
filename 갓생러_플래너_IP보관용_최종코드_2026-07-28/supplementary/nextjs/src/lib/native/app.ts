'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import {
  Haptics,
  ImpactStyle,
  NotificationType,
} from '@capacitor/haptics';
import {
  Keyboard,
  KeyboardResize,
  type KeyboardInfo,
} from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';

export type NativePlatform = 'ios' | 'android' | 'web';
export type HapticFeedback =
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error'
  | 'selection';

export interface NativeAppState {
  isNative: boolean;
  platform: NativePlatform;
  keyboardVisible: boolean;
  keyboardHeight: number;
}

const getPlatform = (): NativePlatform => {
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android' ? platform : 'web';
};

const removeListeners = async (listeners: PluginListenerHandle[]) => {
  await Promise.allSettled(listeners.map((listener) => listener.remove()));
};

/**
 * 앱 시작 시 한 번 호출할 수 있는 네이티브 UI 초기화 함수입니다.
 * 브라우저나 Next.js 서버 렌더링 환경에서는 아무 작업도 하지 않습니다.
 */
export async function initializeNativeApp(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;

  const platform = getPlatform();
  const tasks: Promise<unknown>[] = [
    StatusBar.setStyle({ style: Style.Dark }),
    StatusBar.setOverlaysWebView({ overlay: false }),
  ];

  if (platform === 'android') {
    tasks.push(StatusBar.setBackgroundColor({ color: '#ECFEFF' }));
  }

  if (platform === 'ios') {
    tasks.push(Keyboard.setResizeMode({ mode: KeyboardResize.Body }));
  }

  await Promise.allSettled(tasks);
  return true;
}

export async function triggerHaptic(
  feedback: HapticFeedback = 'light',
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  if (feedback === 'selection') {
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
    await Haptics.selectionEnd();
    return;
  }

  if (
    feedback === 'success' ||
    feedback === 'warning' ||
    feedback === 'error'
  ) {
    const notificationType: Record<
      'success' | 'warning' | 'error',
      NotificationType
    > = {
      success: NotificationType.Success,
      warning: NotificationType.Warning,
      error: NotificationType.Error,
    };
    await Haptics.notification({ type: notificationType[feedback] });
    return;
  }

  const impactStyle: Record<'light' | 'medium' | 'heavy', ImpactStyle> = {
    light: ImpactStyle.Light,
    medium: ImpactStyle.Medium,
    heavy: ImpactStyle.Heavy,
  };
  await Haptics.impact({ style: impactStyle[feedback] });
}

/**
 * 네이티브 플랫폼과 소프트 키보드 상태를 감지합니다.
 *
 * @example
 * const { isNative, keyboardVisible, haptic } = useNativeApp();
 * await haptic('success');
 */
export function useNativeApp() {
  const [state, setState] = useState<NativeAppState>({
    isNative: false,
    platform: 'web',
    keyboardVisible: false,
    keyboardHeight: 0,
  });

  useEffect(() => {
    let active = true;
    const listeners: PluginListenerHandle[] = [];

    const setup = async () => {
      const isNative = await initializeNativeApp();
      if (!active) return;

      setState((current) => ({
        ...current,
        isNative,
        platform: getPlatform(),
      }));
      if (!isNative) return;

      const showListener = await Keyboard.addListener(
        'keyboardWillShow',
        (info: KeyboardInfo) => {
          if (!active) return;
          setState((current) => ({
            ...current,
            keyboardVisible: true,
            keyboardHeight: Math.max(0, info.keyboardHeight),
          }));
        },
      );
      if (!active) {
        await showListener.remove();
        return;
      }
      listeners.push(showListener);

      const hideListener = await Keyboard.addListener(
        'keyboardWillHide',
        () => {
          if (!active) return;
          setState((current) => ({
            ...current,
            keyboardVisible: false,
            keyboardHeight: 0,
          }));
        },
      );
      if (!active) {
        await hideListener.remove();
        return;
      }
      listeners.push(hideListener);
    };

    void setup();

    return () => {
      active = false;
      void removeListeners(listeners);
    };
  }, []);

  const haptic = useCallback(
    async (feedback: HapticFeedback = 'light') => {
      try {
        await triggerHaptic(feedback);
      } catch {
        // 진동 권한 또는 기기 지원이 없어도 핵심 UI 동작은 유지합니다.
      }
    },
    [],
  );

  const dismissKeyboard = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await Keyboard.hide();
    } catch {
      // 키보드가 이미 닫혀 있거나 플러그인이 지원되지 않는 경우 무시합니다.
    }
  }, []);

  return useMemo(
    () => ({
      ...state,
      haptic,
      dismissKeyboard,
    }),
    [dismissKeyboard, haptic, state],
  );
}
