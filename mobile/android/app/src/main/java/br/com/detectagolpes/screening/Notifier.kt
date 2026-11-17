package br.com.detectagolpes.screening

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import br.com.detectagolpes.MainActivity
import br.com.detectagolpes.R

/**
 * Selo com o motivo (funcionalidade 6) e notificação pós-bloqueio com "Liberar" (D-10, KAN-65).
 */
object Notifier {
  private const val CH_ALERTS = "alertas"
  private const val CH_INFO = "informativos"

  private val COLORS = mapOf("baixo" to "#2E7D32", "moderado" to "#F9A825", "suspeito" to "#EF6C00", "alto" to "#C62828")

  fun ensureChannels(ctx: Context) {
    val nm = ctx.getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(NotificationChannel(CH_ALERTS, "Alertas de golpe", NotificationManager.IMPORTANCE_HIGH).apply {
      description = "Chamadas bloqueadas ou suspeitas"
    })
    nm.createNotificationChannel(NotificationChannel(CH_INFO, "Identificação de chamadas", NotificationManager.IMPORTANCE_DEFAULT).apply {
      description = "Informação sobre números desconhecidos"
      setSound(null, null)
    })
  }

  fun onScreened(ctx: Context, callId: Long, number: String, level: String, action: String, reason: String, elder: Boolean) {
    if (ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
    ensureChannels(ctx)

    val title = when (action) {
      "bloquear" -> if (elder) "Bloqueamos uma possível ligação de golpe" else "Chamada bloqueada"
      "silenciar" -> "Chamada silenciada: $number"
      else -> when (level) {
        "baixo" -> "Chamada de $number"
        else -> "Atenção: $number"
      }
    }
    val open = PendingIntent.getActivity(
      ctx, callId.toInt(),
      Intent(ctx, MainActivity::class.java).putExtra("callId", callId).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    val b = NotificationCompat.Builder(ctx, if (level == "alto" || level == "suspeito") CH_ALERTS else CH_INFO)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setColor(Color.parseColor(COLORS[level] ?: "#555555"))
      .setContentTitle(title)
      .setContentText(if (action == "bloquear") "$number · $reason" else reason)
      .setStyle(NotificationCompat.BigTextStyle().bigText(if (action == "bloquear") "$number\n$reason" else reason))
      .setContentIntent(open)
      .setAutoCancel(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setTimeoutAfter(if (action == "permitir") 60_000 else 0)

    if (action != "permitir") {
      val release = PendingIntent.getBroadcast(
        ctx, callId.toInt(),
        Intent(ctx, NotificationActionReceiver::class.java)
          .setAction(NotificationActionReceiver.ACTION_RELEASE)
          .putExtra("number", number).putExtra("callId", callId),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
      b.addAction(0, "Liberar este número", release)
    }
    NotificationManagerCompat.from(ctx).notify(callId.toInt(), b.build())
  }
}
