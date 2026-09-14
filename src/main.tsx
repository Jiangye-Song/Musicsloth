import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { createAppTheme, darkTheme } from "./theme";

// Prevent browser's default context menu
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

// Prevent browser refresh shortcuts (F5, Ctrl+R, Ctrl+Shift+R)
document.addEventListener("keydown", (e) => {
  if (
    e.key === "F5" ||
    (e.ctrlKey && e.key === "r") ||
    (e.ctrlKey && e.shiftKey && e.key === "R")
  ) {
    e.preventDefault();
  }
});

async function renderApplication() {
  const isLyricsOverlay = new URLSearchParams(window.location.search).has("lyrics-overlay");
  const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

  // Keep the overlay's module graph free of App, PlayerControls, and SettingsContext.
  // Both of the latter import audioPlayer, which must have exactly one owner.
  if (isLyricsOverlay) {
    const FloatingLyricsView = (await import("./views/FloatingLyricsView")).default;
    root.render(
      <React.StrictMode>
        <ThemeProvider theme={darkTheme}>
          <CssBaseline />
          <FloatingLyricsView />
        </ThemeProvider>
      </React.StrictMode>,
    );
    return;
  }

  const [{ default: App }, { SettingsProvider, useSettings }] = await Promise.all([
    import("./App"),
    import("./contexts/SettingsContext"),
  ]);

  function MainThemeProvider({ children }: { children: React.ReactNode }) {
    const { settings, isLoading } = useSettings();
    const theme = useMemo(() => {
      if (isLoading) return darkTheme;
      return createAppTheme(settings.interface.theme.mode, settings.interface.theme.accent_color);
    }, [settings.interface.theme.mode, settings.interface.theme.accent_color, isLoading]);

    return <ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider>;
  }

  root.render(
    <React.StrictMode>
      <SettingsProvider>
        <MainThemeProvider><App /></MainThemeProvider>
      </SettingsProvider>
    </React.StrictMode>,
  );
}

void renderApplication();
