package com.example.lifeorganizer

import android.util.Log
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject

class WidgetBridgeModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
    private val tag = "WidgetBridgeModule"

    override fun getName(): String = "WidgetBridge"

    @ReactMethod
    fun updateWidgetData(jsonString: String, promise: Promise) {
        try {
            // Validate JSON payload before writing.
            JSONObject(jsonString)
            Log.i(tag, "updateWidgetData: payload accepted")
            WidgetDataRepository.saveHeatmapData(reactContext, jsonString)
            ContributionWidgetProvider.updateAllWidgets(reactContext)
            Log.i(tag, "updateWidgetData: widget update dispatched")
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(tag, "updateWidgetData failed", e)
            promise.reject("WIDGET_UPDATE_ERROR", e.message ?: "Invalid heatmap payload", e)
        }
    }

    @ReactMethod
    fun updateDay(dateKey: String, count: Int, promise: Promise) {
        try {
            Log.i(tag, "updateDay: date=$dateKey count=$count")
            // Validate dateKey format (YYYY-MM-DD)
            if (!dateKey.matches(Regex("\\d{4}-\\d{2}-\\d{2}"))) {
                Log.w(tag, "updateDay: INVALID date format received: $dateKey, expected YYYY-MM-DD")
            }
            WidgetDataRepository.updateDay(reactContext, dateKey, count)
            ContributionWidgetProvider.updateAllWidgets(reactContext)
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(tag, "updateDay failed", e)
            promise.reject("WIDGET_UPDATE_DAY_ERROR", e.message ?: "Failed to update day", e)
        }
    }

    @ReactMethod
    fun refreshWidget(promise: Promise) {
        try {
            Log.i(tag, "refreshWidget requested")
            ContributionWidgetProvider.updateAllWidgets(reactContext)
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(tag, "refreshWidget failed", e)
            promise.reject("WIDGET_REFRESH_ERROR", e.message ?: "Failed to refresh widget", e)
        }
    }

    @ReactMethod
    fun getHeatmapData(promise: Promise) {
        try {
            promise.resolve(WidgetDataRepository.getHeatmapDataRaw(reactContext))
        } catch (_: Exception) {
            Log.e(tag, "getHeatmapData failed, returning empty JSON")
            promise.resolve("{}")
        }
    }

    @ReactMethod
    fun clearHeatmapData(promise: Promise) {
        try {
            Log.w(tag, "clearHeatmapData requested")
            WidgetDataRepository.clearHeatmapData(reactContext)
            ContributionWidgetProvider.updateAllWidgets(reactContext)
            promise.resolve(null)
        } catch (e: Exception) {
            Log.e(tag, "clearHeatmapData failed", e)
            promise.reject("WIDGET_CLEAR_ERROR", e.message ?: "Failed to clear data", e)
        }
    }
}
