import { createTheme, Theme } from "@mui/material/styles";

export function createAppTheme(mode: "dark" | "light", accentColor: string): Theme {
  return createTheme({
    palette: {
      mode,
      primary: {
        main: accentColor,
      },
      secondary: {
        main: "#2196F3",
      },
      background: mode === "dark"
        ? { default: "#1a1a1a", paper: "#2a2a2a" }
        : { default: "#fafafa", paper: "#ffffff" },
      success: {
        main: accentColor,
      },
      error: {
        main: "#f44336",
      },
    },
    components: {
      MuiDrawer: {
        styleOverrides: {
          paper: {
            backgroundColor: mode === "dark" ? "#252525" : "#f5f5f5",
          },
        },
      },
    },
  });
}

// Default theme for initial render before settings load
export const darkTheme = createAppTheme("dark", "#4CAF50");
