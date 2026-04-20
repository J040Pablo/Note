package com.example.lifeorganizer

import android.appwidget.AppWidgetManager
import android.content.Context
import android.os.Build
import android.util.SizeF
import android.util.TypedValue
import kotlin.math.max
import kotlin.math.roundToInt

enum class HeatmapBucket {
    SMALL,    // 5x5 = 25 itens
    MEDIUM,   // 6x6 = 36 itens
    LARGE     // 7x7 = 49 itens
}

data class HeatmapGridConfig(
    val bucket: HeatmapBucket,
    val cols: Int,
    val rows: Int,
    val layoutId: Int,  // R.layout.widget_heatmap_cell_{xs|sm|md}
    val cellSizeDp: Float,
)

object HeatmapWidgetSizing {
    private const val PREFS_NAME = "com.example.lifeorganizer.widget"
    private const val KEY_PREFIX = "grid_bucket_"

    // Buckets: área em dp² como treshold
    private const val SMALL_THRESHOLD_DP_SQ = 150f * 150f    // <= 22500 dp²
    private const val MEDIUM_THRESHOLD_DP_SQ = 200f * 200f   // <= 40000 dp²
    // > 40000 = LARGE

    // Configurações de bucket
    private const val SMALL_GRID = 5
    private const val SMALL_CELL_DP = 8f
    private const val SMALL_LAYOUT = "widget_heatmap_cell_xs"

    private const val MEDIUM_GRID = 6
    private const val MEDIUM_CELL_DP = 10f
    private const val MEDIUM_LAYOUT = "widget_heatmap_cell_sm"

    private const val LARGE_GRID = 7
    private const val LARGE_CELL_DP = 12f
    private const val LARGE_LAYOUT = "widget_heatmap_cell_md"

    private fun dpToPx(context: Context, value: Float): Int =
        TypedValue.applyDimension(
            TypedValue.COMPLEX_UNIT_DIP,
            value,
            context.resources.displayMetrics
        ).roundToInt()

    private fun prefs(context: Context) =
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun determineBucket(widthDp: Float, heightDp: Float): HeatmapBucket {
        val areaDpSq = widthDp * heightDp
        return when {
            areaDpSq <= SMALL_THRESHOLD_DP_SQ -> HeatmapBucket.SMALL
            areaDpSq <= MEDIUM_THRESHOLD_DP_SQ -> HeatmapBucket.MEDIUM
            else -> HeatmapBucket.LARGE
        }
    }

    private fun bucketToConfig(context: Context, bucket: HeatmapBucket): HeatmapGridConfig {
        val layoutId = when (bucket) {
            HeatmapBucket.SMALL -> context.resources.getIdentifier(
                SMALL_LAYOUT, "layout", context.packageName
            )
            HeatmapBucket.MEDIUM -> context.resources.getIdentifier(
                MEDIUM_LAYOUT, "layout", context.packageName
            )
            HeatmapBucket.LARGE -> context.resources.getIdentifier(
                LARGE_LAYOUT, "layout", context.packageName
            )
        }

        return when (bucket) {
            HeatmapBucket.SMALL -> HeatmapGridConfig(
                bucket = bucket,
                cols = SMALL_GRID,
                rows = SMALL_GRID,
                layoutId = layoutId,
                cellSizeDp = SMALL_CELL_DP
            )
            HeatmapBucket.MEDIUM -> HeatmapGridConfig(
                bucket = bucket,
                cols = MEDIUM_GRID,
                rows = MEDIUM_GRID,
                layoutId = layoutId,
                cellSizeDp = MEDIUM_CELL_DP
            )
            HeatmapBucket.LARGE -> HeatmapGridConfig(
                bucket = bucket,
                cols = LARGE_GRID,
                rows = LARGE_GRID,
                layoutId = layoutId,
                cellSizeDp = LARGE_CELL_DP
            )
        }
    }

    fun save(context: Context, widgetId: Int, bucket: HeatmapBucket) {
        prefs(context).edit()
            .putString("${KEY_PREFIX}${widgetId}", bucket.name)
            .apply()
    }

    fun load(context: Context, widgetId: Int): HeatmapBucket? {
        val bucketName = prefs(context).getString("${KEY_PREFIX}${widgetId}", null)
        return if (bucketName != null) HeatmapBucket.valueOf(bucketName) else null
    }

    fun clear(context: Context, widgetId: Int) {
        prefs(context).edit()
            .remove("${KEY_PREFIX}${widgetId}")
            .apply()
    }


    fun resolve(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int): HeatmapGridConfig {
        val options = appWidgetManager.getAppWidgetOptions(widgetId)

        val minWidthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 110)
        val minHeightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)
        val maxWidthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, minWidthDp)
        val maxHeightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, minHeightDp)

        var widthDp = max(minWidthDp, maxWidthDp).toFloat()
        var heightDp = max(minHeightDp, maxHeightDp).toFloat()

        // Android 12+: Usar OPTION_APPWIDGET_SIZES se disponível
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val sizes = options.getParcelableArrayList<SizeF>(AppWidgetManager.OPTION_APPWIDGET_SIZES)
            if (!sizes.isNullOrEmpty()) {
                val targetArea = widthDp * heightDp
                val active = sizes
                    .filter { it.width > 0f && it.height > 0f }
                    .minByOrNull { size -> kotlin.math.abs((size.width * size.height) - targetArea) }
                if (active != null) {
                    widthDp = active.width
                    heightDp = active.height
                }
            }
        }

        val bucket = determineBucket(widthDp, heightDp)
        return bucketToConfig(context, bucket)
    }

    fun resolveAndPersist(context: Context, appWidgetManager: AppWidgetManager, widgetId: Int): HeatmapGridConfig {
        val config = resolve(context, appWidgetManager, widgetId)
        save(context, widgetId, config.bucket)
        return config
    }
}

