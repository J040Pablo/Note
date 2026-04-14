import { playAlarm as playAlarmInternal, stopAlarm as stopAlarmInternal } from "@services/alarmService";

export async function playAlarm() {
  await playAlarmInternal();
}

export async function stopAlarm() {
  await stopAlarmInternal();
}
