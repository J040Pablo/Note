package com.example.spectru

import android.content.Context
import android.content.SharedPreferences
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject

class WidgetDataModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val PREFS_NAME = ContributionWidgetProvider.PREFS_NAME
        private const val KEY_DATA = ContributionWidgetProvider.KEY_CONTRIBUTION_DATA
        private const val MAX_DAYS = 112
    }

    override fun getName(): String = "WidgetBridge"

    @ReactMethod
    fun updateWidgetData(jsonString: String, promise: Promise) {
        try {
            val parsed = JSONObject(jsonString)
            val pruned = pruneOldKeys(parsed)
            writePrefs(pruned.toString())
            triggerWidgetUpdate()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("WIDGET_UPDATE_ERROR", e.message ?: "Unknown error", e)
        }
    }

    @ReactMethod
    fun updateDay(dateKey: String, count: Int, promise: Promise) {
        try {
            val existing = readCurrentJson()
            existing.put(dateKey, count)
            val pruned = pruneOldKeys(existing)
            writePrefs(pruned.toString())
            triggerWidgetUpdate()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("WIDGET_UPDATE_DAY_ERROR", e.message ?: "Unknown error", e)
        }
    }

    @ReactMethod
    fun getHeatmapData(promise: Promise) {
        try {
            val prefs = getPrefs()
            val raw = prefs.getString(KEY_DATA, "{}") ?: "{}"
            promise.resolve(raw)
        } catch (e: Exception) {
            promise.resolve("{}")
        }
    }

    @ReactMethod
    fun clearHeatmapData(promise: Promise) {
        try {
            getPrefs().edit().remove(KEY_DATA).apply()
            triggerWidgetUpdate()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("WIDGET_CLEAR_ERROR", e.message ?: "Unknown error", e)
        }
    }

    @ReactMethod
    fun refreshWidget(promise: Promise) {
        try {
            triggerWidgetUpdate()
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("WIDGET_REFRESH_ERROR", e.message ?: "Unknown error", e)
        }
    }

    private fun getPrefs(): SharedPreferences =
        reactContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun readCurrentJson(): JSONObject {
        val raw = getPrefs().getString(KEY_DATA, null)
        if (raw.isNullOrBlank()) return JSONObject()
        return try {
            JSONObject(raw)
        } catch (e: Exception) {
            JSONObject()
        }
    }

    private fun writePrefs(jsonString: String) {
        getPrefs().edit().putString(KEY_DATA, jsonString).apply()
    }

    private fun pruneOldKeys(json: JSONObject): JSONObject {
        val cutoff = buildSet<String> {
            for (i in 0 until MAX_DAYS) {
                val c = java.util.Calendar.getInstance()
                c.add(java.util.Calendar.DAY_OF_YEAR, -i)
                val key = "%04d-%02d-%02d".format(
                    c.get(java.util.Calendar.YEAR),
                    c.get(java.util.Calendar.MONTH) + 1,
                    c.get(java.util.Calendar.DAY_OF_MONTH)
                )
                add(key)
            }
        }

        val result = JSONObject()
        val keys = json.keys()
        while (keys.hasNext()) {
            val k = keys.next()
            if (k in cutoff) {
                result.put(k, json.optInt(k, 0))
            }
        }
        return result
    }

    private fun triggerWidgetUpdate() {
        ContributionWidgetProvider.requestUpdate(reactContext)
    }
}
