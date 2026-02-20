import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { settingsApi, AppSettings, ThemeSettings, PlaybackSettings, TabConfig, FadeSettings, ReplayGainSettings, BehaviourSettings } from "../services/api";

// Default settings to use when loading fails
const defaultSettings: AppSettings = {
  version: 1,
  language: {
    language: "en",
  },
  interface: {
    theme: {
      mode: "dark",
      accent_color: "#4CAF50",
      font_family: "system-ui",
    },
    tabs: [
      { id: "queues", label: "Queues", visible: true, order: 0 },
      { id: "library", label: "Library", visible: true, order: 1 },
      { id: "playlists", label: "Playlists", visible: true, order: 2 },
      { id: "artists", label: "Artists", visible: true, order: 3 },
      { id: "albums", label: "Albums", visible: true, order: 4 },
      { id: "genres", label: "Genres", visible: true, order: 5 },
    ],
    quick_actions: [],
    behaviour: {
      on_minimize: "taskbar",
      on_close: "quit",
    },
  },
  playback: {
    gapless: false,
    fade: {
      enabled: false,
      fade_in_ms: 0,
      fade_out_ms: 0,
    },
    equalizer_enabled: false,
    equalizer_preset: "flat",
    replay_gain: {
      enabled: true,
      calculate_unanalyzed: true,
      analyze_on_scan: true,
      segments_per_minute: 10,
    },
  },
};

interface SettingsContextType {
  settings: AppSettings;
  isLoading: boolean;
  // Theme
  updateTheme: (theme: Partial<ThemeSettings>) => Promise<void>;
  // Tabs
  updateTabs: (tabs: TabConfig[]) => Promise<void>;
  // Playback
  updatePlaybackSettings: (playback: Partial<PlaybackSettings>) => Promise<void>;
  updateFadeSettings: (fade: Partial<FadeSettings>) => Promise<void>;
  updateReplayGainSettings: (replayGain: Partial<ReplayGainSettings>) => Promise<void>;
  // Behaviour
  updateBehaviourSettings: (behaviour: Partial<BehaviourSettings>) => Promise<void>;
  // Language
  updateLanguage: (language: string) => Promise<void>;
  // Full reload
  reloadSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        console.log("[SettingsContext] Loading settings...");
        const loaded = await settingsApi.getSettings();
        setSettings(loaded);
        console.log("[SettingsContext] Settings loaded:", loaded);
      } catch (error) {
        console.error("[SettingsContext] Failed to load settings, using defaults:", error);
        setSettings(defaultSettings);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Save settings helper
  const saveSettings = useCallback(async (newSettings: AppSettings) => {
    try {
      await settingsApi.saveSettings(newSettings);
      setSettings(newSettings);
      console.log("[SettingsContext] Settings saved");
    } catch (error) {
      console.error("[SettingsContext] Failed to save settings:", error);
      throw error;
    }
  }, []);

  const updateTheme = useCallback(async (theme: Partial<ThemeSettings>) => {
    const newSettings = {
      ...settings,
      interface: {
        ...settings.interface,
        theme: { ...settings.interface.theme, ...theme },
      },
    };
    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  const updateTabs = useCallback(async (tabs: TabConfig[]) => {
    const newSettings = {
      ...settings,
      interface: {
        ...settings.interface,
        tabs,
      },
    };
    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  const updatePlaybackSettings = useCallback(async (playback: Partial<PlaybackSettings>) => {
    const newSettings = {
      ...settings,
      playback: { ...settings.playback, ...playback },
    };
    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  const updateFadeSettings = useCallback(async (fade: Partial<FadeSettings>) => {
    const newSettings = {
      ...settings,
      playback: {
        ...settings.playback,
        fade: { ...settings.playback.fade, ...fade },
      },
    };
    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  const updateReplayGainSettings = useCallback(async (replayGain: Partial<ReplayGainSettings>) => {
    const newSettings = {
      ...settings,
      playback: {
        ...settings.playback,
        replay_gain: { ...settings.playback.replay_gain, ...replayGain },
      },
    };
    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  const updateBehaviourSettings = useCallback(async (behaviour: Partial<BehaviourSettings>) => {
    const newSettings = {
      ...settings,
      interface: {
        ...settings.interface,
        behaviour: { ...settings.interface.behaviour, ...behaviour },
      },
    };
    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  const updateLanguage = useCallback(async (language: string) => {
    const newSettings = {
      ...settings,
      language: { language },
    };
    await saveSettings(newSettings);
  }, [settings, saveSettings]);

  const reloadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const loaded = await settingsApi.getSettings();
      setSettings(loaded);
    } catch (error) {
      console.error("[SettingsContext] Failed to reload settings:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return (
    <SettingsContext.Provider
      value={{
        settings,
        isLoading,
        updateTheme,
        updateTabs,
        updatePlaybackSettings,
        updateFadeSettings,
        updateReplayGainSettings,
        updateBehaviourSettings,
        updateLanguage,
        reloadSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
