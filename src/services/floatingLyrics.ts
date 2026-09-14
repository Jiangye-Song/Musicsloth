import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emitTo } from "@tauri-apps/api/event";

const LABEL = "lyrics-overlay";
export type FloatingLyricsMode = "off" | "on" | "click-through";

async function getOrCreateFloatingLyrics(initialMode: FloatingLyricsMode): Promise<WebviewWindow> {
  const existing = await WebviewWindow.getByLabel(LABEL);
  if (existing) return existing;

  return new WebviewWindow(LABEL, {
    url: `index.html?lyrics-overlay&lyrics-mode=${initialMode}`,
    title: "Musicsloth Lyrics",
    width: 560,
    height: 150,
    minWidth: 300,
    minHeight: 110,
    decorations: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
  });
}

/** Set the floating lyrics window's visibility and mouse-interaction mode. */
export async function setFloatingLyricsMode(mode: FloatingLyricsMode): Promise<void> {
  const existing = await WebviewWindow.getByLabel(LABEL);
  if (mode === "off") {
    if (existing) await existing.hide();
    return;
  }

  const overlay = existing ?? await getOrCreateFloatingLyrics(mode);
  await overlay.setIgnoreCursorEvents(mode === "click-through");
  await overlay.show();
  if (mode === "on") await overlay.setFocus();
  await emitTo(LABEL, "floating-lyrics:mode", mode);
}
