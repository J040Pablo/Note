import { playAlarm, stopAlarm } from "@services/alarmService";

export const playAlarmSound = async (): Promise<void> => {
  await playAlarm();
};

export const stopAlarmSound = async (): Promise<void> => {
  await stopAlarm();
};
