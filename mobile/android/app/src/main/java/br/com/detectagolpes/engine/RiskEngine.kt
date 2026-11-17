package br.com.detectagolpes.engine

import org.json.JSONObject
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Porte em Kotlin de packages/risk-engine (TypeScript).
 * Precisa rodar dentro do CallScreeningService, com o app fechado e sem internet (D-12, CA-04),
 * em poucos milissegundos (CA-03). A equivalência com o TS é garantida pelos vetores de teste
 * gerados a partir do motor TS (app/src/test/resources/engine-vectors.json).
 */

enum class NumberKind(val id: String) {
  MOVEL("movel"), FIXO("fixo"), TELEMARKETING_0303("telemarketing_0303"), SERVICO("servico"),
  INTERNACIONAL("internacional"), DESCONHECIDO("desconhecido")
}

data class NormalizedNumber(
  val e164: String?,
  val country: String?,
  val ddd: String?,
  val uf: String?,
  val kind: NumberKind,
  val unallocatedRange: Boolean,
  val invalidDdd: Boolean,
)

object Phone {
  val DDD_UF: Map<String, String> = buildMap {
    listOf("11", "12", "13", "14", "15", "16", "17", "18", "19").forEach { put(it, "SP") }
    listOf("21", "22", "24").forEach { put(it, "RJ") }
    listOf("27", "28").forEach { put(it, "ES") }
    listOf("31", "32", "33", "34", "35", "37", "38").forEach { put(it, "MG") }
    listOf("41", "42", "43", "44", "45", "46").forEach { put(it, "PR") }
    listOf("47", "48", "49").forEach { put(it, "SC") }
    listOf("51", "53", "54", "55").forEach { put(it, "RS") }
    put("61", "DF"); put("62", "GO"); put("64", "GO"); put("63", "TO"); put("65", "MT"); put("66", "MT")
    put("67", "MS"); put("68", "AC"); put("69", "RO")
    listOf("71", "73", "74", "75", "77").forEach { put(it, "BA") }
    put("79", "SE"); put("81", "PE"); put("87", "PE"); put("82", "AL"); put("83", "PB"); put("84", "RN")
    put("85", "CE"); put("88", "CE"); put("86", "PI"); put("89", "PI")
    listOf("91", "93", "94").forEach { put(it, "PA") }
    put("92", "AM"); put("97", "AM"); put("95", "RR"); put("96", "AP"); put("98", "MA"); put("99", "MA")
  }

  private val UNKNOWN = NormalizedNumber(null, null, null, null, NumberKind.DESCONHECIDO, false, false)

  private fun national(digits: String): NormalizedNumber {
    if (Regex("^0303\\d{7}$").matches(digits)) return UNKNOWN.copy(e164 = digits, country = "55", kind = NumberKind.TELEMARKETING_0303)
    if (Regex("^0[3589]00\\d{6,7}$").matches(digits)) return UNKNOWN.copy(e164 = digits, country = "55", kind = NumberKind.SERVICO)
    if (Regex("^[34]00\\d{5}$").matches(digits)) return UNKNOWN.copy(e164 = digits, country = "55", kind = NumberKind.SERVICO)
    var d = digits
    if (Regex("^0\\d{2}\\d{2}\\d{8,9}$").matches(d)) d = d.substring(3)
    else if (Regex("^0\\d{2}\\d{8,9}$").matches(d)) d = d.substring(1)
    if (!Regex("^\\d{10,11}$").matches(d)) return UNKNOWN

    val ddd = d.substring(0, 2)
    val subscriber = d.substring(2)
    val uf = DDD_UF[ddd]
    var kind: NumberKind
    val unallocated: Boolean
    if (subscriber.length == 9) {
      kind = NumberKind.MOVEL
      unallocated = !subscriber.startsWith("9")
    } else {
      kind = NumberKind.FIXO
      unallocated = subscriber[0] == '0' || subscriber[0] == '1'
      if (subscriber[0] in '6'..'9') kind = NumberKind.MOVEL
    }
    return NormalizedNumber("+55$d", "55", ddd, uf, kind, unallocated, uf == null)
  }

  private fun international(digits: String, ownCountry: String): NormalizedNumber {
    if (digits.startsWith("55") && ownCountry == "55") {
      val n = national(digits.substring(2))
      return if (n.e164 != null) n else UNKNOWN
    }
    if (digits.length < 8 || digits.length > 15) return UNKNOWN
    val cc = digits.substring(0, if (digits.startsWith("1") || digits.startsWith("7")) 1 else 2)
    return UNKNOWN.copy(e164 = "+$digits", country = cc, kind = NumberKind.INTERNACIONAL)
  }

  fun normalize(raw: String?, ownCountry: String = "55"): NormalizedNumber {
    if (raw.isNullOrBlank()) return UNKNOWN
    val trimmed = raw.trim()
    val plus = trimmed.startsWith("+")
    var digits = trimmed.filter { it.isDigit() }
    if (digits.isEmpty()) return UNKNOWN
    if (!plus && digits.startsWith("00")) {
      digits = digits.substring(2)
      return international(digits, ownCountry)
    }
    if (plus) return international(digits, ownCountry)
    return national(digits)
  }
}

data class EngineConfig(
  val recentFirst: Int = 25, val recentEach: Int = 5, val recentMax: Int = 70,
  val olderEach: Int = 2, val olderMax: Int = 15,
  val verificationFailed: Int = 60, val verificationApproved: Int = 30, val officialBank: Int = 50,
  val prefix0303: Int = 30, val unallocatedRange: Int = 25, val invalidDdd: Int = 25,
  val international: Int = 20, val invalidNumber: Int = 20,
  val suspeito: Int = 20, val alto: Int = 60,
  val forceHighReports7d: Int = 30, val elderModeBlockReports: Int = 5,
) {
  companion object {
    /** Lê o JSON de configuração vindo do servidor (mesmo formato do EngineConfig TS). */
    fun fromJson(json: String?): EngineConfig {
      if (json.isNullOrBlank()) return EngineConfig()
      val o = JSONObject(json)
      val w = o.optJSONObject("weights") ?: JSONObject()
      val t = o.optJSONObject("thresholds") ?: JSONObject()
      val d = EngineConfig()
      return EngineConfig(
        recentFirst = w.optInt("recentFirst", d.recentFirst), recentEach = w.optInt("recentEach", d.recentEach),
        recentMax = w.optInt("recentMax", d.recentMax), olderEach = w.optInt("olderEach", d.olderEach),
        olderMax = w.optInt("olderMax", d.olderMax), verificationFailed = w.optInt("verificationFailed", d.verificationFailed),
        verificationApproved = w.optInt("verificationApproved", d.verificationApproved),
        officialBank = w.optInt("officialBank", d.officialBank), prefix0303 = w.optInt("prefix0303", d.prefix0303),
        unallocatedRange = w.optInt("unallocatedRange", d.unallocatedRange), invalidDdd = w.optInt("invalidDdd", d.invalidDdd),
        international = w.optInt("international", d.international), invalidNumber = w.optInt("invalidNumber", d.invalidNumber),
        suspeito = t.optInt("suspeito", d.suspeito), alto = t.optInt("alto", d.alto),
        forceHighReports7d = o.optInt("forceHighReports7d", d.forceHighReports7d),
        elderModeBlockReports = o.optInt("elderModeBlockReports", d.elderModeBlockReports),
      )
    }
  }
}

data class Reputation(val reports7d: Int, val reportsTotal: Int, val predominantReason: String?)

data class CallContext(
  val rawNumber: String?,
  val isContact: Boolean = false,
  /** "aprovada" | "falhou" | "nao_verificada" | null */
  val verification: String? = null,
  val reputation: Reputation? = null,
  val officialBank: String? = null,
  /** "permitido" | "bloqueado" | null */
  val personalList: String? = null,
  /** "baixo" | "medio" | "alto" */
  val protection: String = "medio",
  val elderMode: Boolean = false,
)

data class Signal(val id: String, val weight: Int)

data class Analysis(
  val number: NormalizedNumber,
  val score: Int,
  val level: String,
  val action: String,
  val reason: String,
  val reasonCode: String,
  val signals: List<Signal>,
  val record: Boolean,
  val askFeedback: Boolean,
)

object RiskEngine {
  fun collectSignals(num: NormalizedNumber, ctx: CallContext, c: EngineConfig): List<Signal> {
    val s = mutableListOf<Signal>()
    val rep = ctx.reputation
    if (rep != null && rep.reports7d > 0) s += Signal("denuncias_recentes", min(c.recentMax, c.recentFirst + c.recentEach * (rep.reports7d - 1)))
    val older = if (rep != null) max(0, rep.reportsTotal - rep.reports7d) else 0
    if (older > 0) s += Signal("denuncias_antigas", min(c.olderMax, older * c.olderEach))
    if (ctx.verification == "falhou") s += Signal("falha_autenticacao", c.verificationFailed)
    if (ctx.verification == "aprovada") s += Signal("origem_autenticada", -c.verificationApproved)
    if (!ctx.officialBank.isNullOrEmpty()) s += Signal("banco_oficial", -c.officialBank)
    when (num.kind) {
      NumberKind.TELEMARKETING_0303 -> s += Signal("prefixo_0303", c.prefix0303)
      NumberKind.INTERNACIONAL -> s += Signal("internacional", c.international)
      NumberKind.DESCONHECIDO -> s += Signal("numero_invalido", c.invalidNumber)
      else -> {}
    }
    if (num.invalidDdd) s += Signal("ddd_inexistente", c.invalidDdd)
    else if (num.unallocatedRange) s += Signal("faixa_nao_alocada", c.unallocatedRange)
    return s
  }

  fun scoreToLevel(score: Int, c: EngineConfig): String = when {
    score >= c.alto -> "alto"
    score >= c.suspeito -> "suspeito"
    else -> "moderado"
  }

  fun actionFor(level: String, protection: String): String = when (level) {
    "alto" -> "bloquear"
    "suspeito" -> when (protection) { "alto" -> "bloquear"; "baixo" -> "permitir"; else -> "silenciar" }
    else -> "permitir"
  }

  fun reasonFor(signal: String, ctx: CallContext): String {
    val rep = ctx.reputation
    return when (signal) {
      "denuncias_recentes", "denuncias_antigas" -> {
        val n = if (signal == "denuncias_recentes") rep?.reports7d ?: 0 else rep?.reportsTotal ?: 0
        val who = if (n == 1) "1 pessoa" else "$n pessoas"
        val denounced = if (n == 1) "1 pessoa denunciou" else "$n pessoas denunciaram"
        when (rep?.predominantReason) {
          "falso_banco" -> "Possível falso banco: $denounced"
          "telemarketing" -> "Telemarketing denunciado por $who"
          "cobranca_indevida" -> "Cobrança indevida denunciada por $who"
          else -> if (signal == "denuncias_recentes") "$denounced como golpe esta semana" else "$denounced como golpe"
        }
      }
      "falha_autenticacao" -> "A operadora não confirmou a origem: pode ser falso"
      "prefixo_0303" -> "Telemarketing (prefixo 0303)"
      "faixa_nao_alocada" -> "Número com formato estranho"
      "ddd_inexistente" -> "O código de área (DDD) não existe"
      "internacional" -> "Ligação do exterior inesperada"
      "numero_invalido" -> "Número oculto ou inválido"
      "origem_autenticada" -> "Origem confirmada pela operadora"
      "banco_oficial" -> "Número oficial do ${ctx.officialBank ?: "banco"}"
      else -> "Número desconhecido, ainda sem histórico"
    }
  }

  fun analyze(ctx: CallContext, c: EngineConfig = EngineConfig()): Analysis {
    val num = Phone.normalize(ctx.rawNumber)
    if (ctx.isContact) {
      return Analysis(num, 0, "baixo", "permitir", "Contato da sua agenda", "contato", emptyList(), record = false, askFeedback = false)
    }
    val signals = collectSignals(num, ctx, c)
    val score = signals.sumOf { it.weight }.toDouble().roundToInt().coerceIn(0, 100)
    val negative = signals.filter { it.weight > 0 }.sortedByDescending { it.weight }
    val positive = signals.filter { it.weight < 0 }.sortedBy { it.weight }

    if (ctx.personalList == "permitido") {
      return Analysis(num, score, "baixo", "permitir", "Permitido por você", "lista_permitidos", signals, record = true, askFeedback = false)
    }
    if (ctx.personalList == "bloqueado") {
      return Analysis(num, score, "alto", "bloquear", "Bloqueado por você", "lista_bloqueados", signals, record = true, askFeedback = false)
    }

    val reports7d = ctx.reputation?.reports7d ?: 0
    var level = when {
      reports7d >= c.forceHighReports7d -> "alto"
      negative.isEmpty() && positive.isNotEmpty() -> "baixo"
      else -> scoreToLevel(score, c)
    }

    var reasonCode: String
    val reason: String
    if (negative.isNotEmpty() && level != "baixo") {
      reasonCode = negative[0].id; reason = reasonFor(negative[0].id, ctx)
    } else if (positive.isNotEmpty()) {
      reasonCode = positive[0].id; reason = reasonFor(positive[0].id, ctx)
    } else {
      reasonCode = "sem_historico"; reason = "Número desconhecido, ainda sem histórico"
    }

    var action = actionFor(level, ctx.protection)
    if (ctx.elderMode && level != "baixo" && (ctx.reputation?.reportsTotal ?: 0) >= c.elderModeBlockReports) {
      action = "bloquear"
      if (level != "alto") { level = "alto"; reasonCode = "modo_idoso" }
    }
    return Analysis(num, score, level, action, reason.take(60), reasonCode, signals, record = true, askFeedback = true)
  }
}
