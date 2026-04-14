import { createAudioPlayer, setIsAudioActiveAsync, type AudioPlayer } from "expo-audio";
import { isExpoGo } from "@utils/runtimeEnv";

let player: AudioPlayer | null = null;
let fallbackPlayer: AudioPlayer | null = null;

const getPlayer = () => {
  if (!player) {
    player = createAudioPlayer(require("../../assets/sounds/alarm.mp3"));
  }
  return player;
};

const getFallbackPlayer = () => {
  if (!fallbackPlayer) {
    fallbackPlayer = createAudioPlayer({ uri: "https://actions.google.com/sounds/v1/alarms/beep_short.ogg" });
  }
  return fallbackPlayer;
};

const waitUntilLoaded = async (audioPlayer: AudioPlayer, timeoutMs = 1200) => {
  const startedAt = Date.now();
  while (!audioPlayer.isLoaded && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

export const playAlarm = async (): Promise<void> => {
  try {
    await setIsAudioActiveAsync(true);

    const alarmPlayer = getPlayer();
    alarmPlayer.loop = false;
    alarmPlayer.volume = 1.0;
    await waitUntilLoaded(alarmPlayer);
    await alarmPlayer.seekTo(0);
    alarmPlayer.play();
    console.log("[ALARM] Playing sound");

    if (isExpoGo) {
      const remotePlayer = getFallbackPlayer();
      remotePlayer.loop = false;
      remotePlayer.volume = 1.0;
      await waitUntilLoaded(remotePlayer);
      await remotePlayer.seekTo(0);
      remotePlayer.play();
      console.log("[ALARM] Expo Go fallback sound");
    }
  } catch (err) {
    console.warn("[ALARM] Failed to play sound", err);
  }
};

export const stopAlarm = async (): Promise<void> => {
  if (!player) {
    return;
  }

  try {
    player.pause();
    await player.seekTo(0);
  } catch {
    // ignore stop errors
  }

  if (!fallbackPlayer) {
    return;
  }

  try {
    fallbackPlayer.pause();
    await fallbackPlayer.seekTo(0);
  } catch {
    // ignore stop errors
  }
};
