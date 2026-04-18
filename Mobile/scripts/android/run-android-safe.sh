#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$ANDROID_HOME}"
export ANDROID_HOME ANDROID_SDK_ROOT
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"

AVD_NAME="${ANDROID_AVD_NAME:-Pixel_6_API_36}"
DEVICE_ID="${ANDROID_DEVICE_ID:-emulator-5554}"
MAX_WAIT_SECS="${ANDROID_BOOT_TIMEOUT_SECS:-420}"

echo "[android-safe] ANDROID_HOME=$ANDROID_HOME"
echo "[android-safe] AVD=$AVD_NAME"

adb start-server >/dev/null

DEVICE_STATE="$(adb devices | awk -v id="$DEVICE_ID" '$1==id{print $2}')"
if [[ "$DEVICE_STATE" != "device" ]]; then
  if ! pgrep -f "emulator.*$AVD_NAME" >/dev/null 2>&1; then
    echo "[android-safe] Starting emulator $AVD_NAME..."
    nohup "$ANDROID_HOME/emulator/emulator" -avd "$AVD_NAME" -no-snapshot >/tmp/${AVD_NAME}.log 2>&1 &
    sleep 4
  else
    echo "[android-safe] Emulator process already running."
  fi
fi

echo "[android-safe] Waiting for ADB device state..."
SECONDS_WAITED=0
until [[ "$(adb devices | awk -v id="$DEVICE_ID" '$1==id{print $2}')" == "device" ]]; do
  sleep 2
  SECONDS_WAITED=$((SECONDS_WAITED + 2))
  if (( SECONDS_WAITED >= MAX_WAIT_SECS )); then
    echo "[android-safe] Timeout waiting ADB device state."
    adb devices
    exit 1
  fi
done

echo "[android-safe] Waiting for Android boot completion..."
SECONDS_WAITED=0
while true; do
  SYS_BOOT="$(adb -s "$DEVICE_ID" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')"
  DEV_BOOT="$(adb -s "$DEVICE_ID" shell getprop dev.bootcomplete 2>/dev/null | tr -d '\r')"
  BOOT_ANIM="$(adb -s "$DEVICE_ID" shell getprop init.svc.bootanim 2>/dev/null | tr -d '\r')"

  if [[ "$SYS_BOOT" == "1" || "$DEV_BOOT" == "1" || "$BOOT_ANIM" == "stopped" ]]; then
    break
  fi

  sleep 3
  SECONDS_WAITED=$((SECONDS_WAITED + 3))
  if (( SECONDS_WAITED >= MAX_WAIT_SECS )); then
    echo "[android-safe] Timeout waiting boot complete (sys=$SYS_BOOT dev=$DEV_BOOT anim=$BOOT_ANIM)."
    exit 1
  fi
done

echo "[android-safe] Device is ready. Running Expo Android..."
cd "$PROJECT_ROOT"
npx expo run:android "$@"
