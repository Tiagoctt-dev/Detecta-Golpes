package br.com.detectagolpes.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import br.com.detectagolpes.engine.EngineConfig
import br.com.detectagolpes.engine.Reputation
import org.json.JSONArray
import org.json.JSONObject

/**
 * Base local consultável sem internet (funcionalidade 3 / CA-04).
 * Guarda, por número: denúncias recentes, total e motivo predominante. Nunca guarda quem denunciou.
 * Também guarda o histórico de decisões, listas pessoais, preferências e a configuração do motor.
 */
class LocalStore private constructor(ctx: Context) : SQLiteOpenHelper(ctx, "detecta.db", null, 1) {

  companion object {
    @Volatile private var instance: LocalStore? = null
    fun get(ctx: Context): LocalStore = instance ?: synchronized(this) {
      instance ?: LocalStore(ctx.applicationContext).also { instance = it }
    }
  }

  override fun onCreate(db: SQLiteDatabase) {
    db.execSQL("CREATE TABLE reputation (e164 TEXT PRIMARY KEY, reports7d INTEGER NOT NULL, reports_total INTEGER NOT NULL, reason TEXT, last_report_at TEXT)")
    db.execSQL("CREATE TABLE official (e164 TEXT PRIMARY KEY, institution TEXT NOT NULL)")
    db.execSQL("CREATE TABLE personal (e164 TEXT PRIMARY KEY, list TEXT NOT NULL, label TEXT, created_at INTEGER NOT NULL)")
    db.execSQL(
      """CREATE TABLE calls (
           id INTEGER PRIMARY KEY AUTOINCREMENT, e164 TEXT, raw TEXT NOT NULL, level TEXT NOT NULL, action TEXT NOT NULL,
           reason TEXT NOT NULL, reason_code TEXT NOT NULL, latency_ms INTEGER, received_at INTEGER NOT NULL,
           ask_feedback INTEGER NOT NULL, feedback TEXT, feedback_dismissed INTEGER NOT NULL DEFAULT 0,
           server_id INTEGER, feedback_synced INTEGER NOT NULL DEFAULT 0)"""
    )
    db.execSQL("CREATE INDEX calls_received ON calls (received_at DESC)")
    db.execSQL("CREATE TABLE kv (k TEXT PRIMARY KEY, v TEXT)")
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {}

  // ---------- chave/valor ----------
  fun getKv(k: String): String? = readableDatabase.rawQuery("SELECT v FROM kv WHERE k = ?", arrayOf(k)).use {
    if (it.moveToFirst()) it.getString(0) else null
  }

  fun setKv(k: String, v: String?) {
    if (v == null) writableDatabase.delete("kv", "k = ?", arrayOf(k))
    else writableDatabase.insertWithOnConflict("kv", null, ContentValues().apply { put("k", k); put("v", v) }, SQLiteDatabase.CONFLICT_REPLACE)
  }

  val config: EngineConfig get() = EngineConfig.fromJson(getKv("engine_config"))
  val protection: String get() = getKv("protection") ?: "medio"
  val elderMode: Boolean get() = getKv("elder_mode") == "1"

  // ---------- consultas usadas na triagem ----------
  fun reputation(e164: String): Reputation? =
    readableDatabase.rawQuery("SELECT reports7d, reports_total, reason FROM reputation WHERE e164 = ?", arrayOf(e164)).use {
      if (it.moveToFirst()) Reputation(it.getInt(0), it.getInt(1), if (it.isNull(2)) null else it.getString(2)) else null
    }

  fun officialInstitution(e164: String): String? =
    readableDatabase.rawQuery("SELECT institution FROM official WHERE e164 = ?", arrayOf(e164)).use {
      if (it.moveToFirst()) it.getString(0) else null
    }

  fun personalList(e164: String): String? =
    readableDatabase.rawQuery("SELECT list FROM personal WHERE e164 = ?", arrayOf(e164)).use {
      if (it.moveToFirst()) it.getString(0) else null
    }

  // ---------- sincronização ----------
  /** Aplica o payload de GET /sync. */
  fun applySync(payload: JSONObject) {
    val db = writableDatabase
    db.beginTransaction()
    try {
      val reps = payload.optJSONArray("reputations") ?: JSONArray()
      for (i in 0 until reps.length()) {
        val r = reps.getJSONObject(i)
        val total = r.optInt("reportsTotal")
        if (total == 0) {
          db.delete("reputation", "e164 = ?", arrayOf(r.getString("numero")))
          continue
        }
        db.insertWithOnConflict("reputation", null, ContentValues().apply {
          put("e164", r.getString("numero"))
          put("reports7d", r.optInt("reports7d"))
          put("reports_total", total)
          put("reason", if (r.isNull("predominantReason")) null else r.optString("predominantReason"))
          put("last_report_at", if (r.isNull("lastReportAt")) null else r.optString("lastReportAt"))
        }, SQLiteDatabase.CONFLICT_REPLACE)
      }
      val off = payload.optJSONArray("official") ?: JSONArray()
      for (i in 0 until off.length()) {
        val o = off.getJSONObject(i)
        db.insertWithOnConflict("official", null, ContentValues().apply {
          put("e164", o.getString("numero")); put("institution", o.getString("instituicao"))
        }, SQLiteDatabase.CONFLICT_REPLACE)
      }
      payload.optJSONObject("config")?.let { setKv("engine_config", it.toString()) }
      payload.optString("servidorEm").takeIf { it.isNotEmpty() }?.let { setKv("last_sync", it) }
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
  }

  fun reputationCount(): Int = readableDatabase.rawQuery("SELECT count(*) FROM reputation", null).use { it.moveToFirst(); it.getInt(0) }

  // ---------- listas pessoais ----------
  fun setPersonal(e164: String, list: String, label: String?) {
    writableDatabase.insertWithOnConflict("personal", null, ContentValues().apply {
      put("e164", e164); put("list", list); put("label", label); put("created_at", System.currentTimeMillis())
    }, SQLiteDatabase.CONFLICT_REPLACE)
  }

  fun removePersonal(e164: String) { writableDatabase.delete("personal", "e164 = ?", arrayOf(e164)) }

  fun personalJson(): JSONArray = readableDatabase.rawQuery("SELECT e164, list, label, created_at FROM personal ORDER BY created_at DESC", null).use { c ->
    JSONArray().apply {
      while (c.moveToNext()) put(JSONObject().apply {
        put("numero", c.getString(0)); put("lista", c.getString(1)); put("rotulo", if (c.isNull(2)) JSONObject.NULL else c.getString(2)); put("criadoEm", c.getLong(3))
      })
    }
  }

  // ---------- histórico ----------
  fun insertCall(e164: String?, raw: String, level: String, action: String, reason: String, reasonCode: String, latencyMs: Long, askFeedback: Boolean): Long =
    writableDatabase.insert("calls", null, ContentValues().apply {
      put("e164", e164); put("raw", raw); put("level", level); put("action", action); put("reason", reason)
      put("reason_code", reasonCode); put("latency_ms", latencyMs); put("received_at", System.currentTimeMillis())
      put("ask_feedback", if (askFeedback) 1 else 0)
    })

  fun callsJson(limit: Int, offset: Int): JSONArray = readableDatabase.rawQuery(
    "SELECT id, e164, raw, level, action, reason, reason_code, latency_ms, received_at, ask_feedback, feedback, server_id FROM calls ORDER BY received_at DESC, id DESC LIMIT ? OFFSET ?",
    arrayOf(limit.toString(), offset.toString()),
  ).use { c ->
    JSONArray().apply {
      while (c.moveToNext()) put(JSONObject().apply {
        put("id", c.getLong(0)); put("numero", if (c.isNull(1)) c.getString(2) else c.getString(1)); put("bruto", c.getString(2))
        put("nivel", c.getString(3)); put("acao", c.getString(4)); put("motivo", c.getString(5)); put("codigoMotivo", c.getString(6))
        put("latenciaMs", c.getLong(7)); put("recebidaEm", c.getLong(8)); put("pedirFeedback", c.getInt(9) == 1)
        put("feedback", if (c.isNull(10)) JSONObject.NULL else c.getString(10)); put("servidorId", if (c.isNull(11)) JSONObject.NULL else c.getLong(11))
      })
    }
  }

  /** Última chamada desconhecida sem feedback (CA-08). */
  fun pendingFeedbackJson(): JSONObject? = readableDatabase.rawQuery(
    "SELECT id FROM calls WHERE ask_feedback = 1 AND feedback IS NULL AND feedback_dismissed = 0 AND received_at > ? ORDER BY received_at DESC LIMIT 1",
    arrayOf((System.currentTimeMillis() - 24L * 3600 * 1000).toString()),
  ).use { c ->
    if (!c.moveToFirst()) null else {
      val id = c.getLong(0)
      val all = callsJson(200, 0)
      (0 until all.length()).map { all.getJSONObject(it) }.firstOrNull { it.getLong("id") == id }
    }
  }

  fun setFeedback(id: Long, feedback: String?) {
    writableDatabase.update("calls", ContentValues().apply {
      if (feedback == null) put("feedback_dismissed", 1) else { put("feedback", feedback); put("feedback_synced", 0) }
    }, "id = ?", arrayOf(id.toString()))
  }

  /** Chamadas ainda não enviadas ao servidor e feedbacks pendentes de envio. */
  fun unsyncedJson(): JSONArray = readableDatabase.rawQuery(
    "SELECT id, raw, level, action, reason, reason_code, latency_ms, received_at, feedback, server_id FROM calls WHERE server_id IS NULL OR (feedback IS NOT NULL AND feedback_synced = 0) ORDER BY id LIMIT 200",
    null,
  ).use { c ->
    JSONArray().apply {
      while (c.moveToNext()) put(JSONObject().apply {
        put("id", c.getLong(0)); put("numero", c.getString(1)); put("nivel", c.getString(2)); put("acao", c.getString(3))
        put("motivo", c.getString(4)); put("codigoMotivo", c.getString(5)); put("latenciaMs", c.getLong(6)); put("recebidaEm", c.getLong(7))
        put("feedback", if (c.isNull(8)) JSONObject.NULL else c.getString(8)); put("servidorId", if (c.isNull(9)) JSONObject.NULL else c.getLong(9))
      })
    }
  }

  fun markCallSynced(id: Long, serverId: Long?, feedbackSynced: Boolean) {
    writableDatabase.update("calls", ContentValues().apply {
      if (serverId != null) put("server_id", serverId)
      if (feedbackSynced) put("feedback_synced", 1)
    }, "id = ?", arrayOf(id.toString()))
  }
}
