import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider, CssBaseline } from "@mui/material";
import App from "./App";
import { darkTheme } from "./theme";

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

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
