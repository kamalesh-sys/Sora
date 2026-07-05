import { createContext, ReactNode, useContext, useMemo, useRef } from "react";
import * as Haptics from "expo-haptics";

import successSound from "../assets/sounds/expense-success.wav";

type FeedbackContextValue = {
  navTap: () => void;
  success: () => void;
};

const FeedbackContext = createContext<FeedbackContextValue>({
  navTap: () => undefined,
  success: () => undefined,
});

type AudioPlayerHandle = {
  play: () => void;
  seekTo: (seconds: number) => Promise<void>;
};

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const playerRef = useRef<AudioPlayerHandle | null>(null);

  const playSuccessSound = async () => {
    try {
      const { createAudioPlayer, setAudioModeAsync } = await import("expo-audio");
      await setAudioModeAsync({
        interruptionMode: "mixWithOthers",
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
      if (!playerRef.current) {
        playerRef.current = createAudioPlayer(successSound, { keepAudioSessionActive: false });
      }
      await playerRef.current.seekTo(0);
      playerRef.current.play();
    } catch {
      // Audio feedback is optional; haptics should still work if audio is unavailable.
    }
  };

  const value = useMemo<FeedbackContextValue>(
    () => ({
      navTap: () => {
        void Haptics.selectionAsync().catch(() => undefined);
      },
      success: () => {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
        void playSuccessSound();
      },
    }),
    []
  );

  return <FeedbackContext.Provider value={value}>{children}</FeedbackContext.Provider>;
}

export function useFeedback() {
  return useContext(FeedbackContext);
}
