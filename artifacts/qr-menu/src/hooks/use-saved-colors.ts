import { useState, useCallback } from "react";

const STORAGE_KEY = "restaurant-saved-colors";
const MAX_COLORS = 16;

function loadColors(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function saveColors(colors: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
}

export function useSavedColors() {
  const [saved, setSaved] = useState<string[]>(() => loadColors());

  const addColor = useCallback((hex: string) => {
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    setSaved((prev) => {
      if (prev.includes(hex)) return prev;
      const next = [hex, ...prev].slice(0, MAX_COLORS);
      saveColors(next);
      return next;
    });
  }, []);

  const removeColor = useCallback((hex: string) => {
    setSaved((prev) => {
      const next = prev.filter((c) => c !== hex);
      saveColors(next);
      return next;
    });
  }, []);

  return { saved, addColor, removeColor };
}
