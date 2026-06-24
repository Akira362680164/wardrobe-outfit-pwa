"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getLocalDateKey } from "@/lib/wear-records";

/** 计算距离下一个本地午夜的毫秒数 */
export function msUntilNextLocalMidnight(now = new Date()): number {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const midnight = new Date(y, m, d + 1, 0, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

/**
 * 返回当前本地日期 key (YYYY-MM-DD)，并在跨天后自动更新。
 * 同时监听 visibilitychange / focus，App 从后台回来时立即校验。
 */
export function useLocalDateKey(): string {
  const [todayKey, setTodayKey] = useState(getLocalDateKey);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleUpdate = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const ms = msUntilNextLocalMidnight() + 1500; // 午夜后延迟 1.5s 避免边界误差
    timerRef.current = setTimeout(() => {
      setTodayKey(getLocalDateKey());
      scheduleUpdate();
    }, ms);
  }, []);

  const checkAndUpdate = useCallback(() => {
    const current = getLocalDateKey();
    setTodayKey((prev) => (prev !== current ? current : prev));
  }, []);

  useEffect(() => {
    scheduleUpdate();

    const onVisibility = () => {
      if (document.visibilityState === "visible") checkAndUpdate();
    };
    const onFocus = () => checkAndUpdate();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [scheduleUpdate, checkAndUpdate]);

  return todayKey;
}
