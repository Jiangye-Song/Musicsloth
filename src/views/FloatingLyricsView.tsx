import { useEffect, useRef, useState } from "react";
import { Box, IconButton, Typography } from "@mui/material";
import { Close, DragIndicator } from "@mui/icons-material";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Track } from "../services/api";
import { activeLyricIndex, LyricLine, parseLrcLyrics } from "../utils/lyrics";
import { saveFloatingLyricsBounds, type FloatingLyricsBounds, type FloatingLyricsMode } from "../services/floatingLyrics";

interface BackendPlayerState {
  position_ms: number;
}

export default function FloatingLyricsView() {
  const [track, setTrack] = useState<Track | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [position, setPosition] = useState(0);
  const boundsUpdateRef = useRef<Partial<FloatingLyricsBounds>>({});
  const [mode, setMode] = useState<FloatingLyricsMode>(() =>
    new URLSearchParams(window.location.search).get("lyrics-mode") === "click-through" ? "click-through" : "on",
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<FloatingLyricsMode>("floating-lyrics:mode", event => setMode(event.payload)).then(fn => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (mode !== "click-through") return;

    const elements = [document.documentElement, document.body, document.getElementById("root")].filter(Boolean) as HTMLElement[];
    const previousBackgrounds = elements.map(element => element.style.backgroundColor);
    elements.forEach(element => { element.style.backgroundColor = "transparent"; });
    return () => elements.forEach((element, index) => { element.style.backgroundColor = previousBackgrounds[index]; });
  }, [mode]);

  useEffect(() => {
    const floatingWindow = getCurrentWindow();
    let unlistenFunctions: Array<() => void> = [];
    let disposed = false;

    const recordBounds = (bounds: Partial<FloatingLyricsBounds>) => {
      boundsUpdateRef.current = { ...boundsUpdateRef.current, ...bounds };
    };
    const saveBoundsOnExit = () => {
      if (Object.keys(boundsUpdateRef.current).length > 0) {
        saveFloatingLyricsBounds(boundsUpdateRef.current);
      }
    };
    window.addEventListener("beforeunload", saveBoundsOnExit);

    void Promise.all([
      floatingWindow.onResized(event => recordBounds({ width: event.payload.width, height: event.payload.height })),
      floatingWindow.onMoved(event => recordBounds({ x: event.payload.x, y: event.payload.y })),
    ]).then(unlisteners => {
      if (disposed) unlisteners.forEach(unlisten => unlisten());
      else unlistenFunctions = unlisteners;
    });

    return () => {
      disposed = true;
      window.removeEventListener("beforeunload", saveBoundsOnExit);
      unlistenFunctions.forEach(unlisten => unlisten());
    };
  }, []);

  useEffect(() => {
    const refresh = async () => {
      try {
        // Use direct IPC rather than audioPlayer: constructing a second AudioPlayer would
        // consume one-shot playback events intended for the main application window.
        const [currentTrack, playerState] = await Promise.all([
          invoke<Track | null>("get_current_track"),
          invoke<BackendPlayerState>("player_get_state"),
        ]);
        setPosition(playerState.position_ms);
        setTrack(previous => previous?.file_path === currentTrack?.file_path ? previous : currentTrack);
      } catch (error) {
        console.error("Failed to refresh floating lyrics:", error);
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 250);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadLyrics = async () => {
      if (!track) return setLyrics([]);
      try {
        setLyrics(parseLrcLyrics((await invoke<string | null>("get_lyrics", { filePath: track.file_path })) ?? ""));
      } catch (error) {
        console.error("Failed to load floating lyrics:", error);
        setLyrics([]);
      }
    };
    void loadLyrics();
  }, [track?.file_path]);

  const activeIndex = activeLyricIndex(lyrics, position);
  const activeTime = activeIndex >= 0 ? lyrics[activeIndex]?.time : undefined;
  const activeLines = activeTime === undefined
    ? []
    : lyrics.filter(line => line.time === activeTime).map(line => line.text).filter(Boolean);
  const nextLine = activeLines.length === 1
    ? lyrics.slice(activeIndex + 1).find(line => line.time !== activeTime)?.text ?? ""
    : "";
  const showTrackMetadata = Boolean(track) && lyrics.length === 0;
  const fallback = showTrackMetadata ? track?.title : "Nothing playing";

  return (
    <Box sx={{ height: "100vh", boxSizing: "border-box", display: "flex", alignItems: "center", gap: 1, px: mode === "click-through" ? 1 : 1.5, color: "common.white", backgroundColor: mode === "click-through" ? "transparent" : "rgba(15, 15, 18, 0.78)", border: mode === "click-through" ? "none" : "1px solid rgba(255,255,255,0.18)", borderRadius: mode === "click-through" ? 0 : 2, boxShadow: "none", overflow: "hidden", userSelect: "none" }}>
      {mode !== "click-through" && (
        <IconButton aria-label="Drag floating lyrics" onMouseDown={() => void getCurrentWindow().startDragging()} size="small" sx={{ color: "rgba(255,255,255,0.62)", cursor: "move" }}>
          <DragIndicator fontSize="small" />
        </IconButton>
      )}
      <Box sx={{ minWidth: 0, flex: 1, textAlign: "center" }}>
        {activeLines.length > 0 ? activeLines.map((line, index) => (
          <Typography key={`${activeTime}-${index}`} noWrap sx={{ fontSize: "1.15rem", fontWeight: 700, textShadow: "0 1px 3px #000" }}>{line}</Typography>
        )) : (
          <Typography noWrap sx={{ fontSize: "1.15rem", fontWeight: 700, textShadow: "0 1px 3px #000" }}>{fallback}</Typography>
        )}
        {(nextLine || (showTrackMetadata && track?.artist)) && (
          <Typography noWrap sx={{ mt: 0.4, fontSize: "0.85rem", color: "rgba(255,255,255,0.64)" }}>
            {nextLine || track?.artist}
          </Typography>
        )}
      </Box>
      {mode !== "click-through" && (
        <IconButton aria-label="Hide floating lyrics" onClick={() => void (async () => {
          await emitTo("main", "floating-lyrics:mode-changed", "off");
          await getCurrentWindow().hide();
        })()} size="small" sx={{ color: "rgba(255,255,255,0.75)" }}>
          <Close fontSize="small" />
        </IconButton>
      )}
    </Box>
  );
}
