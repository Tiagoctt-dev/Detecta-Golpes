package br.com.detectagolpes.engine

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Garante que o motor Kotlin dá o mesmo resultado que o motor TS para todos os vetores gerados. */
class RiskEngineParityTest {
  private fun JSONObject.str(key: String): String? = if (isNull(key) || !has(key)) null else getString(key)

  @Test
  fun kotlinMatchesTypeScriptEngine() {
    val text = javaClass.classLoader!!.getResource("engine-vectors.json")!!.readText()
    val vectors = JSONArray(text)
    assertTrue("sem vetores", vectors.length() > 100)
    for (i in 0 until vectors.length()) {
      val v = vectors.getJSONObject(i)
      val input = v.getJSONObject("input")
      val exp = v.getJSONObject("expected")
      val rep = input.optJSONObject("reputation")?.let {
        Reputation(it.getInt("reports7d"), it.getInt("reportsTotal"), it.str("predominantReason"))
      }
      val ctx = CallContext(
        rawNumber = input.str("rawNumber"),
        isContact = input.optBoolean("isContact", false),
        verification = input.str("verification"),
        reputation = rep,
        officialBank = input.str("officialBank"),
        personalList = input.str("personalList"),
        protection = input.str("protection") ?: "medio",
        elderMode = input.optBoolean("elderMode", false),
      )
      val a = RiskEngine.analyze(ctx)
      val msg = "vetor $i: $input"
      assertEquals(msg, exp.str("e164"), a.number.e164)
      assertEquals(msg, exp.getString("kind"), a.number.kind.id)
      assertEquals(msg, exp.str("uf"), a.number.uf)
      assertEquals(msg, exp.getInt("score"), a.score)
      assertEquals(msg, exp.getString("level"), a.level)
      assertEquals(msg, exp.getString("action"), a.action)
      assertEquals(msg, exp.getString("reason"), a.reason)
      assertEquals(msg, exp.getString("reasonCode"), a.reasonCode)
    }
  }

  @Test
  fun decidesFast() {
    val start = System.nanoTime()
    repeat(10_000) { RiskEngine.analyze(CallContext("+55119${it.toString().padStart(8, '0')}", reputation = Reputation(it % 40, it % 60, "golpe"))) }
    val perCallMs = (System.nanoTime() - start) / 1e6 / 10_000
    assertTrue("muito lento: $perCallMs ms", perCallMs < 5)
  }
}
