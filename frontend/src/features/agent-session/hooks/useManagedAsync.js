import { useCallback, useEffect, useRef } from "react";

export default function useManagedAsync() {
  const timerIdsRef = useRef([]);
  const controllersRef = useRef(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      timerIdsRef.current.forEach((timerId) =>
        window.clearTimeout(timerId)
      );
      timerIdsRef.current = [];
      controllersRef.current.forEach((controller) => controller.abort());
      controllersRef.current.clear();
    };
  }, []);

  const schedule = useCallback((callback, delay) => {
    const timerId = window.setTimeout(() => {
      timerIdsRef.current = timerIdsRef.current.filter(
        (id) => id !== timerId
      );
      callback();
    }, delay);
    timerIdsRef.current.push(timerId);
    return timerId;
  }, []);

  const createController = useCallback(() => {
    const controller = new AbortController();
    controllersRef.current.add(controller);
    return controller;
  }, []);

  const releaseController = useCallback((controller) => {
    controllersRef.current.delete(controller);
  }, []);

  const isMounted = useCallback(() => mountedRef.current, []);

  return {
    schedule,
    createController,
    releaseController,
    isMounted
  };
}
