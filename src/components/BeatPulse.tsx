// Beat Pulse Component
// Wraps content with a pulsing glow effect that responds to beat detection

import { memo, useRef, useEffect } from "react";
import { Box, useTheme, alpha, SxProps, Theme } from "@mui/material";
import { useAudioAnalysis } from "../hooks/useAudioAnalysis";

interface BeatPulseProps {
  /**
   * Child content to wrap
   */
  children: React.ReactNode;
  /**
   * Whether the pulse effect is enabled
   */
  enabled?: boolean;
  /**
   * Custom glow color (defaults to theme primary)
   */
  glowColor?: string;
  /**
   * Maximum glow opacity (0-1)
   */
  maxOpacity?: number;
  /**
   * Glow direction: 'top' | 'bottom' | 'both'
   */
  direction?: "top" | "bottom" | "both";
  /**
   * Glow spread in pixels
   */
  spread?: number;
  /**
   * Additional sx styles for the wrapper
   */
  sx?: SxProps<Theme>;
}

/**
 * Component that wraps children with a beat-reactive glow effect
 * Uses CSS variables for smooth, GPU-accelerated animations
 */
function BeatPulseComponent({
  children,
  enabled = true,
  glowColor,
  maxOpacity = 0.4,
  direction = "top",
  spread = 40,
  sx: sxProp,
}: BeatPulseProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);

  // Get beat data - keepAlive ensures analysis stays running globally
  const { beatIntensity, rmsLevel } = useAudioAnalysis({
    enabled,
    frameRate: 60,
    keepAlive: true, // BeatPulse is a global component, don't disable on unmount
  });

  const color = glowColor || theme.palette.primary.main;

  // Update CSS variable for smooth animation
  useEffect(() => {
    if (!containerRef.current || !enabled) return;

    // Combine beat intensity with RMS for smoother visuals
    // Beat gives sharp peaks, RMS gives overall energy feel
    const combinedIntensity = Math.min(1, Math.max(
      beatIntensity * 1.2,
      rmsLevel * 0.8
    ));

    const opacity = combinedIntensity * maxOpacity;
    containerRef.current.style.setProperty("--beat-opacity", String(opacity));
  }, [beatIntensity, rmsLevel, enabled, maxOpacity]);

  // Reset when disabled
  useEffect(() => {
    if (!enabled && containerRef.current) {
      containerRef.current.style.setProperty("--beat-opacity", "0");
    }
  }, [enabled]);

  if (!enabled) {
    return <>{children}</>;
  }

  // Generate gradient based on direction
  const getGradient = () => {
    const colorWithOpacity = alpha(color, 1); // Full opacity color, we control with --beat-opacity

    switch (direction) {
      case "top":
        return `linear-gradient(180deg, ${colorWithOpacity} 0%, transparent 100%)`;
      case "bottom":
        return `linear-gradient(0deg, ${colorWithOpacity} 0%, transparent 100%)`;
      case "both":
        return `linear-gradient(180deg, ${colorWithOpacity} 0%, transparent 50%, transparent 50%, ${colorWithOpacity} 100%)`;
      default:
        return `linear-gradient(180deg, ${colorWithOpacity} 0%, transparent 100%)`;
    }
  };

  return (
    <Box
      ref={containerRef}
      sx={[
        {
        position: "relative",
        "--beat-opacity": 0,
        "&::before": {
          content: '""',
          position: "absolute",
          top: direction === "bottom" ? "auto" : 0,
          bottom: direction === "top" ? "auto" : 0,
          left: 0,
          right: 0,
          height: direction === "both" ? "100%" : spread,
          background: getGradient(),
          opacity: "var(--beat-opacity)",
          pointerEvents: "none",
          zIndex: 1,
          transition: "opacity 0.05s ease-out",
        },
      },
      ...(Array.isArray(sxProp) ? sxProp : sxProp ? [sxProp] : []),
      ]}
    >
      {children}
    </Box>
  );
}

export default memo(BeatPulseComponent);
