import { createTheme } from "@mui/material/styles";

export const darkTheme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#4CAF50",
    },
    secondary: {
      main: "#2196F3",
    },
    background: {
      default: "#1a1a1a",
      paper: "#2a2a2a",
    },
    success: {
      main: "#4CAF50",
    },
    error: {
      main: "#f44336",
    },
  },
  components: {
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundColor: "#252525",
        },
      },
    },
  },
});
