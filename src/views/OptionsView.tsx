import { useState } from "react";
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Switch,
  Slider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Divider,
  Paper,
  Chip,
  useTheme,
  alpha,
} from "@mui/material";
import {
  ExpandMore,
  Language as LanguageIcon,
  Palette as PaletteIcon,
  PlayArrow as PlaybackIcon,
  Info as InfoIcon,
  DragIndicator,
  Visibility,
  VisibilityOff,
} from "@mui/icons-material";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useSettings } from "../contexts/SettingsContext";
import { TabConfig, BehaviourSettings } from "../services/api";
import { MuiColorInput } from "mui-color-input";

// Preset accent colors
const PRESET_COLORS = [
  { name: "Green", value: "#4CAF50" },
  { name: "Blue", value: "#2196F3" },
  { name: "Purple", value: "#9C27B0" },
  { name: "Orange", value: "#FF9800" },
  { name: "Red", value: "#F44336" },
  { name: "Teal", value: "#009688" },
  { name: "Pink", value: "#E91E63" },
  { name: "Indigo", value: "#3F51B5" },
];

// Font options
const FONT_OPTIONS = [
  { name: "System Default", value: "system-ui" },
  { name: "Inter", value: "'Inter', sans-serif" },
  { name: "Roboto", value: "'Roboto', sans-serif" },
  { name: "Open Sans", value: "'Open Sans', sans-serif" },
  { name: "Segoe UI", value: "'Segoe UI', sans-serif" },
];

function SortableTabItem({ tab, onToggleVisibility }: { key?: React.Key; tab: TabConfig; onToggleVisibility: (id: string) => void }) {
  const theme = useTheme();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: tab.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1 : 0,
    position: "relative" as const,
  };

  return (
    <ListItem
      ref={setNodeRef}
      style={style}
      sx={{
        opacity: isDragging ? 0.8 : tab.visible ? 1 : 0.5,
        bgcolor: isDragging
          ? alpha(theme.palette.primary.main, 0.08)
          : tab.visible
          ? "transparent"
          : alpha(theme.palette.action.disabled, 0.1),
        boxShadow: isDragging ? 4 : 0,
        borderRadius: isDragging ? 1 : 0,
      }}
    >
      <Box
        {...attributes}
        {...listeners}
        sx={{
          display: "flex",
          alignItems: "center",
          mr: 1,
          cursor: isDragging ? "grabbing" : "grab",
          touchAction: "none",
        }}
      >
        <DragIndicator sx={{ fontSize: 20, color: "text.secondary" }} />
      </Box>
      <ListItemText primary={tab.label} />
      <ListItemSecondaryAction>
        <IconButton
          edge="end"
          onClick={() => onToggleVisibility(tab.id)}
        >
          {tab.visible ? <Visibility /> : <VisibilityOff />}
        </IconButton>
      </ListItemSecondaryAction>
    </ListItem>
  );
}

export default function OptionsView() {
  const {
    settings,
    isLoading,
    updateTheme,
    updateTabs,
    updatePlaybackSettings,
    updateFadeSettings,
    updateReplayGainSettings,
    updateBehaviourSettings,
  } = useSettings();

  const [expandedPanel, setExpandedPanel] = useState<string | false>("language");

  const handlePanelChange = (panel: string) => (_event: React.SyntheticEvent, isExpanded: boolean) => {
    setExpandedPanel(isExpanded ? panel : false);
  };

  // Tab visibility toggle
  const handleTabVisibilityToggle = async (tabId: string) => {
    const newTabs = settings.interface.tabs.map((tab) =>
      tab.id === tabId ? { ...tab, visible: !tab.visible } : tab
    );
    await updateTabs(newTabs);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sortedTabs = [...settings.interface.tabs].sort((a, b) => a.order - b.order);
    const oldIndex = sortedTabs.findIndex((t) => t.id === active.id);
    const newIndex = sortedTabs.findIndex((t) => t.id === over.id);
    const reordered = arrayMove(sortedTabs, oldIndex, newIndex);
    const reorderedTabs: TabConfig[] = reordered.map((tab, idx) => ({ ...tab, order: idx }));
    await updateTabs(reorderedTabs);
  };

  if (isLoading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading settings...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ 
      maxWidth: 800, 
      mx: "auto", 
      pb: 4,
    }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 600 }}>
        Options
      </Typography>

      {/* Language Section */}
      <Accordion
        expanded={expandedPanel === "language"}
        onChange={handlePanelChange("language")}
        sx={{ mb: 1 }}
      >
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <LanguageIcon color="primary" />
            <Typography variant="h6">Language</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <FormControl fullWidth size="small">
            <InputLabel>Language</InputLabel>
            <Select
              value={settings.language.language}
              label="Language"
              disabled // Only English for now
            >
              <MenuItem value="en">English</MenuItem>
            </Select>
          </FormControl>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
            More languages will be available in future versions.
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* Interface Section */}
      <Accordion
        expanded={expandedPanel === "interface"}
        onChange={handlePanelChange("interface")}
        sx={{ mb: 1 }}
      >
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <PaletteIcon color="primary" />
            <Typography variant="h6">Interface</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          {/* Theme Subsection */}
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Theme
          </Typography>

          {/* Dark/Light Mode */}
          <Box sx={{ mb: 3 }}>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>Theme Mode</InputLabel>
              <Select
                value={settings.interface.theme.mode}
                label="Theme Mode"
                onChange={(e) => updateTheme({ mode: e.target.value as "dark" | "light" })}
              >
                <MenuItem value="dark">Dark</MenuItem>
                <MenuItem value="light">Light</MenuItem>
              </Select>
            </FormControl>
          </Box>

          {/* Accent Color */}
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Accent Color
            </Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 2 }}>
              {PRESET_COLORS.map((color) => (
                <Chip
                  key={color.value}
                  label={color.name}
                  onClick={() => updateTheme({ accent_color: color.value })}
                  sx={{
                    bgcolor: color.value,
                    color: "#fff",
                    border: settings.interface.theme.accent_color === color.value 
                      ? "2px solid white" 
                      : "2px solid transparent",
                    "&:hover": { bgcolor: alpha(color.value, 0.8) },
                  }}
                />
              ))}
            </Box>
            <MuiColorInput
              value={settings.interface.theme.accent_color}
              onChange={(value) => updateTheme({ accent_color: value })}
              format="hex"
              size="small"
              sx={{ width: 200 }}
            />
          </Box>

          {/* Font Family */}
          <Box sx={{ mb: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Font Family</InputLabel>
              <Select
                value={settings.interface.theme.font_family}
                label="Font Family"
                onChange={(e) => updateTheme({ font_family: e.target.value })}
              >
                {FONT_OPTIONS.map((font) => (
                  <MenuItem key={font.value} value={font.value} sx={{ fontFamily: font.value }}>
                    {font.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Tab Arrangements */}
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Tab Arrangements
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: "block" }}>
            Show, hide, or reorder tabs in the navigation.
          </Typography>
          <Paper variant="outlined" sx={{ mb: 3 }}>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={[...settings.interface.tabs].sort((a, b) => a.order - b.order).map((t) => t.id)}
                strategy={verticalListSortingStrategy}
              >
                <List dense>
                  {[...settings.interface.tabs]
                    .sort((a, b) => a.order - b.order)
                    .map((tab) => (
                      <SortableTabItem
                        key={tab.id}
                        tab={tab}
                        onToggleVisibility={handleTabVisibilityToggle}
                      />
                    ))}
                </List>
              </SortableContext>
            </DndContext>
          </Paper>

          <Divider sx={{ my: 3 }} />

          {/* Quick Actions */}
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Quick Actions
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Quick action customization will be available in a future update.
          </Typography>

          <Divider sx={{ my: 3 }} />

          {/* Behaviour */}
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Behaviour
          </Typography>

          <Box sx={{ mb: 3 }}>
            <FormControl fullWidth size="small" sx={{ mb: 2 }}>
              <InputLabel>When minimize button clicked</InputLabel>
              <Select
                value={settings.interface.behaviour.on_minimize}
                label="When minimize button clicked"
                onChange={(e) => updateBehaviourSettings({ on_minimize: e.target.value as BehaviourSettings["on_minimize"] })}
              >
                <MenuItem value="taskbar">Minimize to taskbar</MenuItem>
                <MenuItem value="tray">Minimize to tray</MenuItem>
              </Select>
            </FormControl>
          </Box>

          <Box sx={{ mb: 3 }}>
            <FormControl fullWidth size="small">
              <InputLabel>When close button clicked</InputLabel>
              <Select
                value={settings.interface.behaviour.on_close}
                label="When close button clicked"
                onChange={(e) => updateBehaviourSettings({ on_close: e.target.value as BehaviourSettings["on_close"] })}
              >
                <MenuItem value="tray">Minimize to tray</MenuItem>
                <MenuItem value="quit">Close app</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* Playback Section */}
      <Accordion
        expanded={expandedPanel === "playback"}
        onChange={handlePanelChange("playback")}
        sx={{ mb: 1 }}
      >
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <PlaybackIcon color="primary" />
            <Typography variant="h6">Playback</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          {/* Gapless Playback */}
          <FormControlLabel
            control={
              <Switch
                checked={settings.playback.gapless}
                onChange={(e) => updatePlaybackSettings({ gapless: e.target.checked })}
              />
            }
            label="Gapless Playback"
            sx={{ mb: 2, display: "flex" }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mb: 3, display: "block", ml: 6 }}>
            Seamlessly transition between tracks without gaps.
          </Typography>

          <Divider sx={{ my: 3 }} />

          {/* Fade Settings */}
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Fade
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={settings.playback.fade.enabled}
                onChange={(e) => updateFadeSettings({ enabled: e.target.checked })}
              />
            }
            label="Enable Fade Effects"
            sx={{ mb: 2, display: "flex" }}
          />

          <Box sx={{ px: 2, opacity: settings.playback.fade.enabled ? 1 : 0.5 }}>
            <Typography variant="body2" gutterBottom>
              Fade in when play: {settings.playback.fade.fade_in_ms}ms
            </Typography>
            <Slider
              value={settings.playback.fade.fade_in_ms}
              onChange={(_, value) => updateFadeSettings({ fade_in_ms: value as number })}
              min={0}
              max={2000}
              step={100}
              marks={[
                { value: 0, label: "0" },
                { value: 500, label: "500" },
                { value: 1000, label: "1000" },
                { value: 1500, label: "1500" },
                { value: 2000, label: "2000" },
              ]}
              disabled={!settings.playback.fade.enabled}
              sx={{ mb: 3 }}
            />

            <Typography variant="body2" gutterBottom>
              Fade out when pause: {settings.playback.fade.fade_out_ms}ms
            </Typography>
            <Slider
              value={settings.playback.fade.fade_out_ms}
              onChange={(_, value) => updateFadeSettings({ fade_out_ms: value as number })}
              min={0}
              max={2000}
              step={100}
              marks={[
                { value: 0, label: "0" },
                { value: 500, label: "500" },
                { value: 1000, label: "1000" },
                { value: 1500, label: "1500" },
                { value: 2000, label: "2000" },
              ]}
              disabled={!settings.playback.fade.enabled}
              sx={{ mb: 3 }}
            />
          </Box>

          <Divider sx={{ my: 3 }} />

          {/* Equalizer */}
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Equalizer
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={settings.playback.equalizer_enabled}
                onChange={(e) => updatePlaybackSettings({ equalizer_enabled: e.target.checked })}
              />
            }
            label="Enable Equalizer"
            sx={{ mb: 2, display: "flex" }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mb: 3, display: "block", ml: 6 }}>
            Equalizer presets and customization will be available in a future update.
          </Typography>

          <Divider sx={{ my: 3 }} />

          {/* Replay Gain */}
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            Replay Gain
          </Typography>
          <FormControlLabel
            control={
              <Switch
                checked={settings.playback.replay_gain.enabled}
                onChange={(e) => updateReplayGainSettings({ enabled: e.target.checked })}
              />
            }
            label="Enable Replay Gain"
            sx={{ mb: 2, display: "flex" }}
          />

          <Box sx={{ px: 2, opacity: settings.playback.replay_gain.enabled ? 1 : 0.5 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.playback.replay_gain.calculate_unanalyzed}
                  onChange={(e) => updateReplayGainSettings({ calculate_unanalyzed: e.target.checked })}
                  disabled={!settings.playback.replay_gain.enabled}
                />
              }
              label="Calculate RG for unanalyzed tracks"
              sx={{ mb: 2, display: "flex" }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={settings.playback.replay_gain.analyze_on_scan}
                  onChange={(e) => updateReplayGainSettings({ analyze_on_scan: e.target.checked })}
                  disabled={!settings.playback.replay_gain.enabled}
                />
              }
              label="Analyze replay gain when scanning"
              sx={{ mb: 3, display: "flex" }}
            />

            <Typography variant="body2" gutterBottom>
              Segments per minute to analyze: {settings.playback.replay_gain.segments_per_minute}
            </Typography>
            <Slider
              value={settings.playback.replay_gain.segments_per_minute}
              onChange={(_, value) => updateReplayGainSettings({ segments_per_minute: value as number })}
              min={1}
              max={60}
              step={1}
              marks={[
                { value: 1, label: "1" },
                { value: 10, label: "10" },
                { value: 30, label: "30" },
                { value: 60, label: "60" },
              ]}
              disabled={!settings.playback.replay_gain.enabled}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
              Higher values = more accurate but slower analysis.
            </Typography>
          </Box>
        </AccordionDetails>
      </Accordion>

      {/* About Section */}
      <Accordion
        expanded={expandedPanel === "about"}
        onChange={handlePanelChange("about")}
        sx={{ mb: 1 }}
      >
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <InfoIcon color="primary" />
            <Typography variant="h6">About</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Box sx={{ textAlign: "center", py: 2 }}>
            <Typography variant="h5" sx={{ fontWeight: 600, mb: 1 }}>
              Musicsloth
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              Version 0.1.0
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              A modern, fast, and feature-rich music player built with Tauri and React.
            </Typography>
            <Divider sx={{ mb: 3 }} />
            <Typography variant="caption" color="text.secondary">
              Built with Rust, React, and TypeScript
            </Typography>
          </Box>
        </AccordionDetails>
      </Accordion>
    </Box>
  );
}
