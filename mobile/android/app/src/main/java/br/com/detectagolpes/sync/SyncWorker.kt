package br.com.detectagolpes.sync

import android.content.Context
import android.net.Uri
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import br.com.detectagolpes.data.LocalStore
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.TimeUnit

/**
 * Funcionalidade 9: baixa as diferenças da base usando o agendador do sistema
 * (exigência de bateria da página de restrições técnicas). Intervalo de 15 min = CA-09.
 * Se falhar, tenta na próxima execução.
 */
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
  override suspend fun doWork(): Result = runCatching { syncNow(applicationContext) }.fold(
    onSuccess = { Result.success() },
    onFailure = { Result.retry() },
  )

  companion object {
    private const val NAME = "detecta-sync"

    fun schedule(ctx: Context) {
      val req = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
        .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
        .build()
      WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(NAME, ExistingPeriodicWorkPolicy.KEEP, req)
    }

    /** Executa GET /sync e aplica na base local. Retorna o número de reputações recebidas. */
    fun syncNow(ctx: Context): Int {
      val store = LocalStore.get(ctx)
      val base = store.getKv("api_url") ?: error("API não configurada")
      val token = store.getKv("token") ?: error("dispositivo não registrado")
      val since = store.getKv("last_sync")
      val url = Uri.parse(base.trimEnd('/') + "/sync").buildUpon().apply { if (since != null) appendQueryParameter("desde", since) }.build().toString()
      val conn = (URL(url).openConnection() as HttpURLConnection).apply {
        connectTimeout = 10_000; readTimeout = 30_000
        setRequestProperty("Authorization", "Bearer $token")
        setRequestProperty("Accept", "application/json")
      }
      try {
        if (conn.responseCode != 200) error("HTTP ${conn.responseCode}")
        val body = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
        store.applySync(body)
        return body.optJSONArray("reputations")?.length() ?: 0
      } finally {
        conn.disconnect()
      }
    }
  }
}
