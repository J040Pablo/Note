package com.example.lifeorganizer

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Build
import android.util.SizeF
import android.util.TypedValue
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

data class HeatmapGridConfig(
    val widthPx: Int,
    val heightPx: Int,
    val cols: Int,
    val rows: Int,
    val cellSizePx: Int,
    val gapPx: Int,
    val paddingPx: Int,
)

object HeatmapWidgetSizing {
    private const val PREFS_NAME = "com.example.lifeorganizer.widget"
    private const val KEY_PREFIX = "grid_config_"

    private const val MIN_WIDGET_DP = 96f
    private const val MAX_WIDGET_DP = 600f
    private const val MIN_GRID = 5
    private const val MAX_GRID = 7

    private const val PADDING_DP = 6f
    private const val GAP_DP = 2f
    private const val MIN_CELL_DP = 8.5f

    private fun dpToPx(context: Context, value: Float): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value,
            context.resources.displayMetrics
        ).roundToInt()

    private fun sanitizeDp(value: Float): Float = value.coerceIn(MIN_WIDGET_DP, MAX_WIDGET_DP)

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun save(context: Context, widgetId: Int, config: HeatmapGridConfig) {
        prefs(context).edit()
            .putInt("${KEY_PREFIX}${widgetId}_w", config.widthPx)
            .putInt("${KEY_PREFIX}${widgetId}_h", config.heightPx)
            .putInt("${KEY_PREFIX}${widgetId}_c", config.cols)
            .putInt("${KEY_PREFIX}${widgetId}_r", config.rows)
            .putInt("${KEY_PREFIX}${widgetId}_s", config.cellSizePx)
            .putInt("${KEY_PREFIX}${widgetId}_g", config.gapPx)
            .putInt("${KEY_PREFIX}${widgetId}_p", config.paddingPx)
            .apply()
    }

    fun load(context: Context, widgetId: Int): HeatmapGridConfig? {
        val p = prefs(context)
        val width = p.getInt("${KEY_PREFIX}${widgetId}_w", -1)
        if (width <= 0) return null

        val height = p.getInt("${KEY_PREFIX}${widgetId}_h", -1)
        val cols = p.getInt("${KEY_PREFIX}${widgetId}_c", -1)
        val rows = p.getInt("${KEY_PREFIX}${widgetId}_r", -1)
        val cell = p.getInt("${KEY_PREFIX}${widgetId}_s", -1)
        val gap = p.getInt("${KEY_PREFIX}${widgetId}_g", dpToPx(context, GAP_DP))
        val padding = p.getInt("${KEY_PREFIX}${widgetId}_p", dpToPx(context, PADDING_DP))

        if (height <= 0 || cols <= 0 || rows <= 0 || cell <= 0) return null
        return HeatmapGridConfig(width, height, cols, rows, cell, gap, padding)
    }

    fun clear(context: Context, widgetId: Int) {
        prefs(context).edit()
            .remove("${KEY_PREFIX}${widgetId}_w")
            .remove("${KEY_PREFIX}${widgetId}_h")
            .remove("${KEY_PREFIX}${widgetId}_c")
            .remove("${KEY_PREFIX}${widgetId}_r")
            .remove("${KEY_PREFIX}${widgetId}_s")
            .remove("${KEY_PREFIX}${widgetId}_g")
            .remove("${KEY_PREFIX}${widgetId}_p")
            .apply()
    }

    fun resolve(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int): HeatmapGridConfig {
        val options = appWidgetManager.getAppWidgetOptions(widgetId)

        val minWidthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, MIN_WIDGET_DP.toInt())
        val minHeightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, MIN_WIDGET_DP.toInt())
        val maxWidthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, minWidthDp)
        val maxHeightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, minHeightDp)

        var widthDp = sanitizeDp(max(minWidthDp, maxWidthDp).toFloat())
        var heightDp = sanitizeDp(max(minHeightDp, maxHeightDp).toFloat())

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val sizes = options.getParcelableArrayList<SizeF>(AppWidgetManager.OPTION_APPWIDGET_SIZES)
            if (!sizes.isNullOrEmpty()) {
                val targetArea = widthDp * heightDp
                val active = sizes
                    .filter { it.width > 0f && it.height > 0f }
                    .minByOrNull { size -> kotlin.math.abs((size.width * size.height) - targetArea) }
                if (active != null) {
                    widthDp = sanitizeDp(active.width)
                    heightDp = sanitizeDp(active.height)
                }
            }
        }

        val widthPx = dpToPx(context, widthDp)
        val heightPx = dpToPx(context, heightDp)
        val paddingPx = dpToPx(context, PADDING_DP)
        val gapPx = dpToPx(context, GAP_DP)
        val minCellPx = dpToPx(context, MIN_CELL_DP)

        var chosenGrid = MIN_GRID
        var chosenCell = 1

        for (grid in MAX_GRID downTo MIN_GRID) {
            val usableWidth = widthPx - (paddingPx * 2) - (gapPx * (grid - 1))
            val usableHeight = heightPx - (paddingPx * 2) - (gapPx * (grid - 1))
            val cell = min(usableWidth / grid, usableHeight / grid)
            if (cell >= minCellPx) {
                chosenGrid = grid
                chosenCell = cell
                break
            }

            if (grid == MIN_GRID) {
                chosenCell = cell.coerceAtLeast(1)
            }
        }

        return HeatmapGridConfig(
            widthPx = widthPx,
            heightPx = heightPx,
            cols = chosenGrid,
            rows = chosenGrid,
            cellSizePx = chosenCell,
            gapPx = gapPx,
            paddingPx = paddingPx,
        )
    }

    fun resolveAndPersist(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int): HeatmapGridConfig {
        val config = resolve(context, appWidgetManager, widgetId)
        save(context, widgetId, config)
        return config
    }
}
