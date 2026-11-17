package br.com.detectagolpes.screening

import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.telecom.Call
import android.telecom.CallScreeningService
import android.telecom.Connection
import android.util.Log
import br.com.detectagolpes.data.LocalStore
import br.com.detectagolpes.engine.CallContext
import br.com.detectagolpes.engine.RiskEngine

/**
 * Funcionalidade 1: interceptação antes do primeiro toque (CA-01).
 *
 * O Android só aciona este serviço para números que NÃO estão na agenda (quando o app não é o discador
 * padrão), então contatos salvos nunca chegam aqui (CA-02) e a agenda nunca é lida nem enviada (CA-11).
 * Toda a decisão é local e offline (D-12, CA-04).
 */
class CallGuardService : CallScreeningService() {

  override fun onScreenCall(details: Call.Details) {
    val start = SystemClock.elapsedRealtime()
    // Só chamadas recebidas; chamadas feitas pelo usuário não sofrem interferência.
    if (details.callDirection != Call.Details.DIRECTION_INCOMING) {
      respondToCall(details, CallResponse.Builder().build())
      return
    }

    val raw = details.handle?.takeIf { it.scheme == "tel" }?.schemeSpecificPart?.let(Uri::decode) ?: ""
    val response = CallResponse.Builder()
    var responded = false
    try {
      val store = LocalStore.get(this)
      val normalized = br.com.detectagolpes.engine.Phone.normalize(raw)
      val e164 = normalized.e164
      val ctx = CallContext(
        rawNumber = raw,
        verification = verificationOf(details),
        reputation = e164?.let(store::reputation),
        officialBank = e164?.let(store::officialInstitution),
        personalList = e164?.let(store::personalList),
        protection = store.protection,
        elderMode = store.elderMode,
      )
      val a = RiskEngine.analyze(ctx, store.config)

      when (a.action) {
        "bloquear" -> response
          .setDisallowCall(true)
          .setRejectCall(true)
          // D-10: nunca some do registro de chamadas
          .setSkipCallLog(false)
          .setSkipNotification(false)
        "silenciar" -> response.setSilenceCall(true)
        else -> {}
      }
      respondToCall(details, response.build())
      responded = true
      val latency = SystemClock.elapsedRealtime() - start

      if (a.record) {
        val id = store.insertCall(e164, raw.ifEmpty { "Número oculto" }, a.level, a.action, a.reason, a.reasonCode, latency, a.askFeedback)
        Notifier.onScreened(this, id, e164 ?: raw, a.level, a.action, a.reason, store.elderMode)
      }
      Log.i(TAG, "decisão=${a.action} nivel=${a.level} motivo=${a.reasonCode} latencia=${latency}ms")
    } catch (t: Throwable) {
      // Em caso de erro, nunca impede a chamada.
      Log.e(TAG, "falha na triagem", t)
      if (!responded) respondToCall(details, CallResponse.Builder().build())
    }
  }

  /** Autenticação de origem (Origem Verificada / STIR-SHAKEN), disponível a partir do Android 11. */
  private fun verificationOf(details: Call.Details): String? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null
    return when (details.callerNumberVerificationStatus) {
      Connection.VERIFICATION_STATUS_PASSED -> "aprovada"
      Connection.VERIFICATION_STATUS_FAILED -> "falhou"
      else -> "nao_verificada"
    }
  }

  companion object { private const val TAG = "DetectaGolpes" }
}
