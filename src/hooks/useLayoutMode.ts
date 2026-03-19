import { useMediaQuery } from "@mui/material";

export type LayoutMode = "narrow" | "medium" | "wide";

const NARROW_MAX = 660;
const WIDE_MIN = 900;

export function useLayoutMode() {
  const isNarrow = useMediaQuery(`(max-width:${NARROW_MAX - 1}px)`);
  const isWide = useMediaQuery(`(min-width:${WIDE_MIN}px)`);

  const mode: LayoutMode = isNarrow ? "narrow" : isWide ? "wide" : "medium";

  return { mode, isNarrow, isMedium: mode === "medium", isWide };
}
