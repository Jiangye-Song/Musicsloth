// Circular Audio Visualizer Component
// Displays a radial frequency visualization around a center point

import { useRef, useEffect, useCallback, memo, useState } from "react";
import { Box, useTheme } from "@mui/material";
import { useAudioAnalysis } from "../hooks/useAudioAnalysis";

interface CircularVisualizerProps {
  /**
   * Whether the visualizer is active
   */
  enabled?: boolean;
  /**
   * Size of the visualizer (width and height)
   */
  size?: number;
  /**
   * Number of bars to display around the circle
   */
  barCount?: number;
  /**
   * Inner radius as percentage of size (0-1)
   */
  innerRadius?: number;
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
   * Gap between bars in degrees
   */
  barGap?: number;
  /**
   * Children to render in the center of the visualizer
   */
  children?: React.ReactNode;
}

/**
 * Canvas-based circular audio visualizer component
 * Renders frequency data as bars radiating outward from a circle
 */
function CircularVisualizerComponent({
  enabled = true,
  size = 120,
  barCount = 64,
  innerRadius = 0.4,
  colorPrimary,
  colorSecondary,
  smoothing = 0.7,
  barGap = 1,
  children,
}: CircularVisualizerProps) {
  const theme = useTheme();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const smoothedBandsRef = useRef<number[]>(new Array(barCount).fill(0));
  const frequencyBandsRef = useRef<number[]>([]);
  const [canvasReady, setCanvasReady] = useState(false);

  // Get colors from theme if not provided
  const primaryColor = colorPrimary || theme.palette.primary.main;
  const secondaryColor = colorSecondary || theme.palette.secondary.main;

  // Get analysis data - always enabled when component is enabled
  const { frequencyBands } = useAudioAnalysis({
    enabled,
    frameRate: 60,
  });
  
  // Keep ref updated with latest frequency bands
  frequencyBandsRef.current = frequencyBands;

  // Setup canvas dimensions
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    setCanvasReady(true);
  }, [size]);

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

    const dpr = window.devicePixelRatio || 1;
    const canvasSize = size * dpr;
    const centerX = canvasSize / 2;
    const centerY = canvasSize / 2;

    // Clear canvas
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    
    const innerR = (canvasSize / 2) * innerRadius;
    const maxBarLength = (canvasSize / 2) * (1 - innerRadius) * 0.85;
    const angleStep = (360 / barCount) * (Math.PI / 180);
    const gapAngle = barGap * (Math.PI / 180);

    // Always draw a base ring
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 2 * dpr;
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, innerR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Interpolate and smooth bands using ref
    const currentBands = frequencyBandsRef.current;
    const interpolated = interpolateBands(currentBands, barCount);
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

    // Create gradient
    const gradient = ctx.createRadialGradient(
      centerX,
      centerY,
      innerR,
      centerX,
      centerY,
      canvasSize / 2
    );
    gradient.addColorStop(0, secondaryColor);
    gradient.addColorStop(0.5, primaryColor);
    gradient.addColorStop(1, primaryColor);

    ctx.fillStyle = gradient;

    // Draw bars
    bands.forEach((value, i) => {
      const barLength = Math.max(2, value * maxBarLength);
      const angle = i * angleStep - Math.PI / 2; // Start from top

      // Calculate bar width based on angle
      const barWidth = angleStep - gapAngle;

      // Adjust opacity based on value
      ctx.globalAlpha = 0.5 + value * 0.5;

      // Draw bar as a wedge/arc segment
      ctx.beginPath();
      ctx.arc(centerX, centerY, innerR, angle - barWidth / 2, angle + barWidth / 2);
      ctx.arc(
        centerX,
        centerY,
        innerR + barLength,
        angle + barWidth / 2,
        angle - barWidth / 2,
        true
      );
      ctx.closePath();
      ctx.fill();
    });

    ctx.globalAlpha = 1;
  }, [
    barCount,
    smoothing,
    barGap,
    innerRadius,
    primaryColor,
    secondaryColor,
    size,
    interpolateBands,
  ]);
  
  // Keep render function in a ref so animation loop always uses latest
  const renderRef = useRef(render);
  renderRef.current = render;

  // Animation loop - runs independently, uses ref to always call latest render
  useEffect(() => {
    if (!enabled || !canvasReady) return;

    let running = true;
    const animate = () => {
      if (!running) return;
      renderRef.current();
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [enabled, canvasReady]);

  // Handle canvas setup on mount and size changes
  useEffect(() => {
    setupCanvas();
  }, [setupCanvas]);

  if (!enabled) {
    return (
      <Box
        ref={containerRef}
        sx={{
          width: size,
          height: size,
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </Box>
    );
  }

  return (
    <Box
      ref={containerRef}
      sx={{
        width: size,
        height: size,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: size,
          height: size,
          pointerEvents: "none",
        }}
      />
      {/* Center content */}
      <Box
        sx={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
      </Box>
    </Box>
  );
}

// Memoize the component to prevent unnecessary re-renders
export default memo(CircularVisualizerComponent);
