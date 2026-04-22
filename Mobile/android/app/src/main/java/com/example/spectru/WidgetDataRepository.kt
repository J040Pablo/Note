package com.example.spectru

import android.content.Context
import android.util.Log
import org.json.JSONObject
import java.util.Calendar

object WidgetDataRepository {
    private const val TAG: String = "WidgetDataRepository"
    const val PREFS_NAME: String = "com.example.spectru.widget"
    const val KEY_CONTRIBUTION_DATA: String = "contribution_data"
    private const val MAX_DAYS: Int = 112

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveHeatmapData(context: Context, jsonString: String) {
        val parsed = parseToMap(jsonString)
        Logger.i(TAG, "saveHeatmapData: entries=${parsed.size}")
        saveHeatmapMap(context, parsed)
    }

    fun saveHeatmapMap(context: Context, map: Map<String, Int>) {
        val pruned = pruneToRecentWindow(map)
        val json = JSONObject()
        pruned.forEach { (key, value) -> json.put(key, value.coerceAtLeast(0)) }
        prefs(context).edit().putString(KEY_CONTRIBUTION_DATA, json.toString()).commit()
        Logger.i(TAG, "saveHeatmapMap: persistedEntries=${pruned.size}")
    }

    fun updateDay(context: Context, dateKey: String, count: Int) {
        val next = getHeatmapData(context).toMutableMap()
        next[dateKey] = count.coerceAtLeast(0)
        Logger.i(TAG, "updateDay: date=$dateKey count=${count.coerceAtLeast(0)}")
        saveHeatmapMap(context, next)
    }

    fun getHeatmapData(context: Context): Map<String, Int> {
        val raw = prefs(context).getString(KEY_CONTRIBUTION_DATA, "{}") ?: "{}"
        val parsed = parseToMap(raw)
        Logger.d(TAG, "getHeatmapData: entries=${parsed.size}")
        return parsed
    }

    fun getHeatmapDataRaw(context: Context): String {
        return prefs(context).getString(KEY_CONTRIBUTION_DATA, "{}") ?: "{}"
    }

    fun clearHeatmapData(context: Context) {
        prefs(context).edit().remove(KEY_CONTRIBUTION_DATA).commit()
        Logger.w(TAG, "clearHeatmapData: key removed")
    }

    fun recentDateKeys(days: Int = MAX_DAYS): List<String> {
        val keys = ArrayList<String>(days)
        val base = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, 0)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        for (offset in (days - 1) downTo 0) {
            val c = base.clone() as Calendar
            c.add(Calendar.DAY_OF_YEAR, -offset)
            keys.add(dateKey(c))
        }
        return keys
    }

    private fun pruneToRecentWindow(source: Map<String, Int>): Map<String, Int> {
        val valid = recentDateKeys().toHashSet()
        val out = linkedMapOf<String, Int>()
        source.forEach { (key, value) ->
            if (key in valid) out[key] = value.coerceAtLeast(0)
        }
        return out
    }

    private fun parseToMap(rawJson: String): Map<String, Int> {
        return try {
            val map = linkedMapOf<String, Int>()
            val json = JSONObject(rawJson)
            val keys = json.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                map[key] = json.optInt(key, 0).coerceAtLeast(0)
            }
            map
        } catch (e: Exception) {
            Logger.e(TAG, "parseToMap: invalid JSON payload", e)
            emptyMap()
        }
    }

    private fun dateKey(calendar: Calendar): String {
        val y = calendar.get(Calendar.YEAR)
        val m = calendar.get(Calendar.MONTH) + 1
        val d = calendar.get(Calendar.DAY_OF_MONTH)
        return "%04d-%02d-%02d".format(y, m, d)
    }
}
