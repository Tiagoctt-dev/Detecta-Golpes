package br.com.detectagolpes.screening

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.widget.Toast
import androidx.core.app.NotificationManagerCompat
import br.com.detectagolpes.data.LocalStore

/** Botão "Liberar este número" da notificação: move o número para a lista de permitidos (CA-07). */
class NotificationActionReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    if (intent.action != ACTION_RELEASE) return
    val number = intent.getStringExtra("number") ?: return
    val callId = intent.getLongExtra("callId", -1)
    val store = LocalStore.get(ctx)
    store.setPersonal(number, "permitido", null)
    if (callId > 0) store.setFeedback(callId, "legitima")
    NotificationManagerCompat.from(ctx).cancel(callId.toInt())
    Toast.makeText(ctx, "Número liberado. As próximas ligações vão tocar.", Toast.LENGTH_LONG).show()
  }

  companion object { const val ACTION_RELEASE = "br.com.detectagolpes.RELEASE" }
}
