package com.example.lifeorganizer

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Color
import android.view.View
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject

class TodayTasksWidgetProvider : AppWidgetProvider() {

    companion object {
        const val PREFS_NAME = ContributionWidgetProvider.PREFS_NAME
        const val KEY_TASKS_DATA = "tasks_today_data"
        private const val MAX_TASKS = 5

        fun requestUpdate(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, TodayTasksWidgetProvider::class.java)
            )
            if (ids.isNotEmpty()) {
                val provider = TodayTasksWidgetProvider()
                provider.onUpdate(context, manager, ids)
            }
        }
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (widgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, widgetId)
        }
    }

    private fun updateWidget(context: Context, manager: AppWidgetManager, widgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.widget_tasks_today)
        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_TASKS_DATA, "[]")

        // 1. Reset all tasks to GONE by default
        for (i in 0 until MAX_TASKS) {
            val containerId = context.resources.getIdentifier("task_container_$i", "id", context.packageName)
            if (containerId != 0) {
                views.setViewVisibility(containerId, View.GONE)
            }
        }
        views.setViewVisibility(R.id.empty_text, View.GONE)

        try {
            val jsonArray = JSONArray(raw)
            if (jsonArray.length() == 0) {
                views.setViewVisibility(R.id.empty_text, View.VISIBLE)
            } else {
                val limit = Math.min(jsonArray.length(), MAX_TASKS)
                for (i in 0 until limit) {
                    val taskObj = jsonArray.optJSONObject(i) ?: continue
                    val title = taskObj.optString("title", "Untitled")
                    val completed = taskObj.optBoolean("completed", false)
                    val time = taskObj.optString("time", "")
                    val priority = taskObj.optString("priority", "normal")

                    val containerId = context.resources.getIdentifier("task_container_$i", "id", context.packageName)
                    val titleId = context.resources.getIdentifier("task_title_$i", "id", context.packageName)
                    val timeId = context.resources.getIdentifier("task_time_$i", "id", context.packageName)
                    val iconId = context.resources.getIdentifier("task_icon_$i", "id", context.packageName)

                    if (containerId != 0 && titleId != 0) {
                        views.setViewVisibility(containerId, View.VISIBLE)
                        views.setTextViewText(titleId, title)
                        
                        // Handle Check icon
                        if (completed) {
                            views.setImageViewResource(iconId, R.drawable.ic_widget_check)
                        } else {
                            views.setImageViewResource(iconId, R.drawable.ic_widget_uncheck)
                        }

                        // Handle Time
                        if (timeId != 0) {
                            if (time.isNotEmpty()) {
                                views.setViewVisibility(timeId, View.VISIBLE)
                                views.setTextViewText(timeId, time)
                            } else {
                                views.setViewVisibility(timeId, View.GONE)
                            }
                        }

                        // Priority color visual logic
                        if (priority == "high" && !completed) {
                            views.setTextColor(titleId, Color.parseColor("#F87171"))
                        } else {
                            views.setTextColor(titleId, Color.parseColor("#F1F5F9"))
                        }
                    }
                }
            }
        } catch (e: Exception) {
            views.setViewVisibility(R.id.empty_text, View.VISIBLE)
        }

        // Tap on widget launches the App explicitly with openRoute
        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            putExtra("openRoute", "tasks") // Tell mainActivity to deep link
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        
        if (intent != null) {
            val pendingIntent = android.app.PendingIntent.getActivity(
                context, widgetId, intent, 
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
        }

        manager.updateAppWidget(widgetId, views)
    }
}
