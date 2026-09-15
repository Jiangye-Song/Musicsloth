import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emitTo, listen } from "@tauri-apps/api/event";

const LABEL = "lyrics-overlay";
const BOUNDS_STORAGE_KEY = "musicsloth-floating-lyrics-bounds";
export type FloatingLyricsMode = "off" | "on" | "click-through";
export interface FloatingLyricsBounds {
  width: number;
  height: number;
  x: number;
  y: number;
}
let currentMode: FloatingLyricsMode = "off";
let initializationPromise: Promise<void> | null = null;
const MODE_CHANGE_EVENT = "floating-lyrics-mode-change";

void listen<FloatingLyricsMode>("floating-lyrics:mode-changed", event => {
  currentMode = event.payload;
  window.dispatchEvent(new Event(MODE_CHANGE_EVENT));
});

export function getFloatingLyricsMode(): FloatingLyricsMode {
  return currentMode;
}

export function subscribeFloatingLyricsMode(listener: (mode: FloatingLyricsMode) => void): () => void {
  const handler = () => listener(currentMode);
  window.addEventListener(MODE_CHANGE_EVENT, handler);
  return () => window.removeEventListener(MODE_CHANGE_EVENT, handler);
}

export function getFloatingLyricsBounds(): Partial<FloatingLyricsBounds> {
  try {
    const saved = JSON.parse(localStorage.getItem(BOUNDS_STORAGE_KEY) ?? "{}") as Partial<FloatingLyricsBounds>;
    return Object.fromEntries(
      Object.entries(saved).filter(([, value]) => typeof value === "number" && Number.isFinite(value)),
    ) as Partial<FloatingLyricsBounds>;
  } catch {
    return {};
  }
}

export function saveFloatingLyricsBounds(bounds: Partial<FloatingLyricsBounds>): void {
  const merged = { ...getFloatingLyricsBounds(), ...bounds };
  localStorage.setItem(BOUNDS_STORAGE_KEY, JSON.stringify(merged));
}

async function getOrCreateFloatingLyrics(initialMode: FloatingLyricsMode): Promise<WebviewWindow> {
  const existing = await WebviewWindow.getByLabel(LABEL);
  if (existing) return existing;

  const savedBounds = getFloatingLyricsBounds();
  return new WebviewWindow(LABEL, {
    url: `index.html?lyrics-overlay&lyrics-mode=${initialMode}`,
    title: "Musicsloth Lyrics",
    width: savedBounds.width ?? 560,
    height: savedBounds.height ?? 150,
    x: savedBounds.x,
    y: savedBounds.y,
    minWidth: 300,
    minHeight: 110,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    visible: false,
    resizable: true,
    skipTaskbar: true,
  });
}

/** Warm up the hidden overlay so its first visible frame is already synchronized. */
export async function initializeFloatingLyrics(): Promise<void> {
  if (!initializationPromise) {
    initializationPromise = getOrCreateFloatingLyrics("on")
      .then(() => undefined)
      .catch(error => {
        initializationPromise = null;
        throw error;
      });
  }
  await initializationPromise;
}

/** Set the floating lyrics window's visibility and mouse-interaction mode. */
export async function setFloatingLyricsMode(mode: FloatingLyricsMode): Promise<void> {
  const existing = await WebviewWindow.getByLabel(LABEL);
  if (mode === "off") {
    if (existing) await existing.hide();
    currentMode = mode;
    window.dispatchEvent(new Event(MODE_CHANGE_EVENT));
    return;
  }

  const overlay = existing ?? await getOrCreateFloatingLyrics(mode);
  await overlay.setIgnoreCursorEvents(mode === "click-through");
  await overlay.setShadow(mode !== "click-through");
  await overlay.show();
  if (mode === "on") await overlay.setFocus();
  await emitTo(LABEL, "floating-lyrics:mode", mode);
  currentMode = mode;
  window.dispatchEvent(new Event(MODE_CHANGE_EVENT));
}
