import { TextField, InputAdornment, Paper } from "@mui/material";
import { Search } from "@mui/icons-material";

interface SearchBarProps {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  variant?: "primary" | "secondary";
}

export default function SearchBar({ placeholder, value, onChange, variant = "primary" }: SearchBarProps) {
  const isSecondary = variant === "secondary";
  
  return (
    <Paper
      elevation={0}
      sx={{
        p: isSecondary ? 0.5 : 1,
        borderBottom: 1,
        borderColor: "divider",
        bgcolor: isSecondary ? "transparent" : "background.paper",
      }}
    >
      <TextField
        fullWidth
        size={isSecondary ? "small" : "small"}
        variant="outlined"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search fontSize="small" sx={{ color: "text.secondary" }} />
            </InputAdornment>
          ),
        }}
        sx={isSecondary ? {
          "& .MuiOutlinedInput-root": {
            fontSize: "0.875rem",
            bgcolor: "transparent",
            "& fieldset": {
              borderColor: "divider",
            },
          },
        } : {}}
      />
    </Paper>
  );
}
