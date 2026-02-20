import React, { useMemo } from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider, CssBaseline } from "@mui/material";
import App from "./App";
import { createAppTheme, darkTheme } from "./theme";
import { SettingsProvider, useSettings } from "./contexts/SettingsContext";

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

function DynamicThemeProvider({ children }: { children: React.ReactNode }) {
  const { settings, isLoading } = useSettings();

  const theme = useMemo(() => {
    if (isLoading) return darkTheme;
    return createAppTheme(
      settings.interface.theme.mode,
      settings.interface.theme.accent_color,
    );
  }, [settings.interface.theme.mode, settings.interface.theme.accent_color, isLoading]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </ThemeProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <SettingsProvider>
      <DynamicThemeProvider>
        <App />
      </DynamicThemeProvider>
    </SettingsProvider>
  </React.StrictMode>,
);
