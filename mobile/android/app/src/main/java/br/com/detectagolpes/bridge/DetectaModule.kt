package br.com.detectagolpes.bridge

import android.Manifest
import android.app.Activity
import android.app.role.RoleManager
import android.content.Intent
import android.content.pm.PackageManager
import android.speech.tts.TextToSpeech
import androidx.core.content.ContextCompat
import br.com.detectagolpes.data.LocalStore
import br.com.detectagolpes.engine.CallContext
import br.com.detectagolpes.engine.Phone
import br.com.detectagolpes.engine.RiskEngine
import br.com.detectagolpes.screening.Notifier
import br.com.detectagolpes.sync.SyncWorker
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.BaseActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONObject
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Ponte nativa Android → React Native (KAN-46).
 * Os dados são trocados como JSON (string) para manter a interface simples.
 */
class DetectaModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {
  private val io = Executors.newSingleThreadExecutor()
  private val store get() = LocalStore.get(ctx)
  private var rolePromise: Promise? = null
  private var tts: TextToSpeech? = null

  private val activityListener: ActivityEventListener = object : BaseActivityEventListener() {
    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
      if (requestCode == REQ_ROLE) {
        rolePromise?.resolve(isRoleHeld())
        rolePromise = null
      }
    }
  }

  init { ctx.addActivityEventListener(activityListener) }

  override fun getName() = "DetectaNative"

  private fun bg(promise: Promise, block: () -> Any?) = io.execute {
    try { promise.resolve(block()) } catch (t: Throwable) { promise.reject("DETECTA_ERR", t.message, t) }
  }

  private fun isRoleHeld(): Boolean = ctx.getSystemService(RoleManager::class.java).isRoleHeld(RoleManager.ROLE_CALL_SCREENING)

  // ---------- permissão de triagem (H-01) ----------
  @ReactMethod fun isScreeningEnabled(promise: Promise) = promise.resolve(isRoleHeld())

  @ReactMethod fun requestScreeningRole(promise: Promise) {
    val activity = ctx.currentActivity ?: return promise.reject("NO_ACTIVITY", "Sem tela ativa")
    val rm = ctx.getSystemService(RoleManager::class.java)
    if (!rm.isRoleAvailable(RoleManager.ROLE_CALL_SCREENING)) return promise.reject("UNAVAILABLE", "Triagem de chamadas não disponível neste aparelho")
    if (rm.isRoleHeld(RoleManager.ROLE_CALL_SCREENING)) return promise.resolve(true)
    rolePromise = promise
    activity.startActivityForResult(rm.createRequestRoleIntent(RoleManager.ROLE_CALL_SCREENING), REQ_ROLE)
  }

  @ReactMethod fun hasNotificationPermission(promise: Promise) = promise.resolve(
    ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED,
  )

  // ---------- configuração ----------
  @ReactMethod fun configure(apiUrl: String, token: String, promise: Promise) = bg(promise) {
    store.setKv("api_url", apiUrl); store.setKv("token", token)
    Notifier.ensureChannels(ctx)
    SyncWorker.schedule(ctx)
    true
  }

  @ReactMethod fun getCredentials(promise: Promise) = bg(promise) {
    JSONObject().apply {
      put("apiUrl", store.getKv("api_url") ?: JSONObject.NULL); put("token", store.getKv("token") ?: JSONObject.NULL)
    }.toString()
  }

  @ReactMethod fun setPreferences(protection: String, elderMode: Boolean, promise: Promise) = bg(promise) {
    store.setKv("protection", protection); store.setKv("elder_mode", if (elderMode) "1" else "0"); true
  }

  @ReactMethod fun getState(promise: Promise) = bg(promise) {
    JSONObject().apply {
      put("protecao", store.protection); put("modoIdoso", store.elderMode)
      put("ultimaSincronizacao", store.getKv("last_sync") ?: JSONObject.NULL)
      put("numerosNaBase", store.reputationCount()); put("triagemAtiva", isRoleHeld())
    }.toString()
  }

  // ---------- base local ----------
  @ReactMethod fun syncNow(promise: Promise) = bg(promise) { SyncWorker.syncNow(ctx) }

  @ReactMethod fun applySync(json: String, promise: Promise) = bg(promise) { store.applySync(JSONObject(json)); true }

  /** Analisa um número com a base local (consulta offline e "simular chamada"). */
  @ReactMethod fun analyze(raw: String, promise: Promise) = bg(promise) {
    val e164 = Phone.normalize(raw).e164
    val a = RiskEngine.analyze(CallContext(
      rawNumber = raw, reputation = e164?.let(store::reputation), officialBank = e164?.let(store::officialInstitution),
      personalList = e164?.let(store::personalList), protection = store.protection, elderMode = store.elderMode,
    ), store.config)
    JSONObject().apply {
      put("numero", a.number.e164 ?: JSONObject.NULL); put("nivel", a.level); put("acao", a.action)
      put("motivo", a.reason); put("codigoMotivo", a.reasonCode); put("uf", a.number.uf ?: JSONObject.NULL)
    }.toString()
  }

  // ---------- listas pessoais ----------
  @ReactMethod fun setPersonal(number: String, list: String, label: String?, promise: Promise) = bg(promise) {
    val e164 = Phone.normalize(number).e164 ?: error("Número inválido")
    store.setPersonal(e164, list, label); e164
  }

  @ReactMethod fun removePersonal(number: String, promise: Promise) = bg(promise) {
    store.removePersonal(Phone.normalize(number).e164 ?: number); true
  }

  @ReactMethod fun getPersonal(promise: Promise) = bg(promise) { store.personalJson().toString() }

  // ---------- histórico e feedback ----------
  @ReactMethod fun getCalls(limit: Int, offset: Int, promise: Promise) = bg(promise) { store.callsJson(limit, offset).toString() }

  @ReactMethod fun getPendingFeedback(promise: Promise) = bg(promise) { store.pendingFeedbackJson()?.toString() }

  @ReactMethod fun setFeedback(id: Double, feedback: String?, promise: Promise) = bg(promise) { store.setFeedback(id.toLong(), feedback); true }

  @ReactMethod fun getUnsynced(promise: Promise) = bg(promise) { store.unsyncedJson().toString() }

  @ReactMethod fun markSynced(id: Double, serverId: Double, feedbackSynced: Boolean, promise: Promise) = bg(promise) {
    store.markCallSynced(id.toLong(), if (serverId > 0) serverId.toLong() else null, feedbackSynced); true
  }

  // ---------- leitura em voz (HU-08) ----------
  @ReactMethod fun speak(text: String) {
    val current = tts
    if (current != null) { current.speak(text, TextToSpeech.QUEUE_FLUSH, null, "detecta"); return }
    tts = TextToSpeech(ctx) { status ->
      if (status == TextToSpeech.SUCCESS) {
        tts?.language = Locale("pt", "BR")
        tts?.setSpeechRate(0.9f)
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "detecta")
      }
    }
  }

  @ReactMethod fun stopSpeaking() { tts?.stop() }

  override fun invalidate() {
    tts?.shutdown(); tts = null
    io.shutdown()
    super.invalidate()
  }

  companion object { private const val REQ_ROLE = 4711 }
}
