// Audio Visualizer Component
// Displays a mirrored frequency wave visualization similar to music app visualizers

import { useRef, useEffect, useCallback, memo } from "react";
import { Box, useTheme } from "@mui/material";
import { useAudioAnalysis } from "../hooks/useAudioAnalysis";

interface AudioVisualizerProps {
  /**
   * Whether the visualizer is active
   */
  enabled?: boolean;
  /**
   * Height of the visualizer in pixels
   */
  height?: number;
  /**
   * Number of bars to display
   */
  barCount?: number;
  /**
   * Custom primary color (defaults to theme primary)
   */
  colorPrimary?: string;
  /**
   * Custom secondary color (defaults to theme secondary)
   */
  colorSecondary?: string;
  /**
   * Smoothing factor for bar decay (0-1, higher = smoother)
   */
  smoothing?: number;
  /**
   * Bar gap in pixels
   */
  barGap?: number;
  /**
   * Border radius for bars
   */
  barRadius?: number;
  /**
   * Show mirror (reflection) below center line
   */
  mirrored?: boolean;
}

/**
 * Canvas-based audio visualizer component
 * Renders frequency data as animated bars with gradient colors
 */
function AudioVisualizerComponent({
  enabled = true,
  height = 80,
  barCount = 48,
  colorPrimary,
  colorSecondary,
  smoothing = 0.7,
  barGap = 2,
  barRadius = 2,
  mirrored = true,
}: AudioVisualizerProps) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const smoothedBandsRef = useRef<number[]>(new Array(barCount).fill(0));

  // Get colors from theme if not provided
  const primaryColor = colorPrimary || theme.palette.primary.main;
  const secondaryColor = colorSecondary || theme.palette.secondary.main;

  // Get analysis data
  const { frequencyBands, isActive } = useAudioAnalysis({
    enabled,
    frameRate: 60,
  });

  // Interpolate frequency bands to match bar count
  const interpolateBands = useCallback(
    (source: number[], targetCount: number): number[] => {
      if (source.length === 0) return new Array(targetCount).fill(0);

      const result: number[] = [];
      const ratio = source.length / targetCount;

      for (let i = 0; i < targetCount; i++) {
        const srcIndex = i * ratio;
        const low = Math.floor(srcIndex);
        const high = Math.min(low + 1, source.length - 1);
        const t = srcIndex - low;
        result.push(source[low] * (1 - t) + source[high] * t);
      }

      return result;
    },
    []
  );

  // Render visualizer
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width } = canvas;
    const canvasHeight = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, canvasHeight);

    // Interpolate and smooth bands
    const interpolated = interpolateBands(frequencyBands, barCount);
    smoothedBandsRef.current = smoothedBandsRef.current.map((prev, i) => {
      const target = interpolated[i] || 0;
      // Fast attack, slow decay
      if (target > prev) {
        return prev + (target - prev) * (1 - smoothing * 0.5);
      } else {
        return prev + (target - prev) * (1 - smoothing);
      }
    });

    const bands = smoothedBandsRef.current;
    const barWidth = (width - barGap * (barCount - 1)) / barCount;
    const centerY = canvasHeight / 2;
    const maxBarHeight = mirrored
      ? centerY * 0.85
      : canvasHeight * 0.9;

    // Create gradient for bars
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, secondaryColor);
    gradient.addColorStop(0.25, primaryColor);
    gradient.addColorStop(0.5, primaryColor);
    gradient.addColorStop(0.75, primaryColor);
    gradient.addColorStop(1, secondaryColor);

    ctx.fillStyle = gradient;

    // Draw bars
    bands.forEach((value, i) => {
      const barHeight = Math.max(2, value * maxBarHeight);
      const x = i * (barWidth + barGap);

      // Adjust opacity based on value and overall level
      const opacity = 0.4 + value * 0.6;
      ctx.globalAlpha = opacity;

      if (mirrored) {
        // Draw upper bar (from center going up)
        roundRect(
          ctx,
          x,
          centerY - barHeight,
          barWidth,
          barHeight,
          barRadius
        );

        // Draw lower bar (from center going down) - slightly dimmer
        ctx.globalAlpha = opacity * 0.7;
        roundRect(ctx, x, centerY, barWidth, barHeight, barRadius);
      } else {
        // Single bar from bottom
        roundRect(
          ctx,
          x,
          canvasHeight - barHeight,
          barWidth,
          barHeight,
          barRadius
        );
      }
    });

    ctx.globalAlpha = 1;

    // Continue animation if active
    if (isActive && enabled) {
      animationRef.current = requestAnimationFrame(render);
    }
  }, [
    frequencyBands,
    barCount,
    smoothing,
    barGap,
    barRadius,
    mirrored,
    primaryColor,
    secondaryColor,
    isActive,
    enabled,
    interpolateBands,
  ]);

  // Start/stop animation
  useEffect(() => {
    if (enabled && isActive) {
      animationRef.current = requestAnimationFrame(render);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [enabled, isActive, render]);

  // Handle canvas resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        canvas.width = width * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        }
      }
    });

    resizeObserver.observe(canvas.parentElement!);

    return () => resizeObserver.disconnect();
  }, [height]);

  if (!enabled) {
    return null;
  }

  return (
    <Box
      sx={{
        width: "100%",
        height,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />
    </Box>
  );
}

// Helper function to draw rounded rectangles
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  if (radius === 0) {
    ctx.fillRect(x, y, width, height);
    return;
  }

  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  ctx.fill();
}

// Memoize the component to prevent unnecessary re-renders
export default memo(AudioVisualizerComponent);
