import { useEffect, useRef, useState } from 'react';
import { LEVEL_LABEL, normalizeNumber, type Analysis, type OriginVerification } from '@detecta/risk-engine';
import { Phone, type Banner, type Ringing } from './phone/Phone';
import { NETWORK_NUMBER, SCENARIOS, type Scenario } from './scenarios';
import { analyze, communityReports, formatNumber, initialState, load, recordCall, save, type IncomingCall, type SimState } from './sim';

interface LogEntry {
  key: number;
  at: number;
  who: string;
  analysis: Analysis;
  latencyMs: number;
}

const DECISION = { permitir: 'Tocou', silenciar: 'Silenciou', bloquear: 'Bloqueou' } as const;
const SIGNAL_LABEL: Record<string, string> = {
  denuncias_recentes: 'Denúncias recentes', denuncias_antigas: 'Denúncias antigas', falha_autenticacao: 'Origem não confirmada',
  prefixo_0303: 'Prefixo 0303', faixa_nao_alocada: 'Faixa não alocada', ddd_inexistente: 'DDD inexistente',
  internacional: 'Internacional', numero_invalido: 'Número oculto', origem_autenticada: 'Origem confirmada', banco_oficial: 'Banco oficial',
};

export default function App() {
  const [state, setStateRaw] = useState<SimState>(() => load() ?? initialState());
  const [ringing, setRinging] = useState<Ringing | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [custom, setCustom] = useState('');
  const [verification, setVerification] = useState<OriginVerification | ''>('');
  const keyRef = useRef(1);

  const setState = (fn: (s: SimState) => SimState) => setStateRaw((s) => fn(s));
  useEffect(() => save(state), [state]);

  function placeCall(call: IncomingCall, who: string) {
    if (!state.onboarded) {
      setBanner({ key: keyRef.current++, title: 'Proteção ainda desligada', text: 'Toque em "Ativar proteção" no celular primeiro.', level: 'moderado', number: null, recordId: null });
      return;
    }
    const { analysis, latencyMs } = analyze(state, call);
    const recordId = analysis.record ? state.nextId : null;
    setState((s) => recordCall(s, call, analysis, latencyMs));
    setLog((l) => [{ key: keyRef.current++, at: Date.now(), who, analysis, latencyMs }, ...l].slice(0, 12));
    const number = analysis.number.e164 ?? call.raw;

    if (analysis.action === 'bloquear') {
      setRinging(null);
      setBanner({
        key: keyRef.current++,
        title: state.elderMode ? 'Bloqueamos uma possível ligação de golpe' : 'Chamada bloqueada',
        text: `${formatNumber(number)} · ${analysis.reason}`,
        level: analysis.level, number, recordId,
      });
      return;
    }
    setBanner(null);
    setRinging({ call, analysis, recordId, phase: 'tocando' });
  }

  function runScenario(s: Scenario) {
    placeCall(s.call, s.who);
  }

  function reset() {
    setStateRaw(initialState());
    setRinging(null);
    setBanner(null);
    setLog([]);
  }

  const networkRep = state.reputations[normalizeNumber(NETWORK_NUMBER).e164 ?? ''];

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <div className="eyebrow">Demonstração · MVP Android</div>
          <h1>Detecta Golpes</h1>
          <p className="intro">O app olha o número antes de o telefone tocar, compara com as denúncias da comunidade e decide: deixa tocar, silencia ou bloqueia. Esta página roda o mesmo motor de risco do app Android, direto no navegador.</p>
        </div>
      </header>

      <main className="layout">
        <section className="console" aria-label="Painel do apresentador">
          <div className="panel">
            <div className="panel-head">
              <h2>Simular uma ligação</h2>
              <span className="hint">o celular reage na hora</span>
            </div>
            <div className="scenarios">
              {SCENARIOS.map((s) => (
                <button key={s.id} className="scenario" onClick={() => runScenario(s)}>
                  <span className="sc-title">{s.title}</span>
                  <span className="sc-who">{s.who}</span>
                  <span className="sc-foot">
                    <span className={`expect ex-${s.expect === 'Toca' ? 'ok' : s.expect === 'Silencia' ? 'warn' : 'bad'}`}>{s.expect}</span>
                    <span className="sc-rule">{s.rule}</span>
                  </span>
                </button>
              ))}
            </div>
            <form className="custom" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) placeCall({ raw: custom, verification: verification || undefined }, custom); }}>
              <label htmlFor="custom-number">Outro número</label>
              <div className="custom-row">
                <input id="custom-number" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="(62) 98888-7777" inputMode="tel" />
                <select id="custom-verification" aria-label="Autenticação de origem" value={verification} onChange={(e) => setVerification(e.target.value as OriginVerification | '')}>
                  <option value="">Origem: sem informação</option>
                  <option value="aprovada">Origem confirmada</option>
                  <option value="falhou">Origem falhou</option>
                </select>
                <button type="submit">Ligar</button>
              </div>
            </form>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Efeito de rede</h2>
              <span className="hint">uma denúncia protege todo mundo</span>
            </div>
            <p className="body">
              O número <strong>{formatNumber(NETWORK_NUMBER)}</strong> tem hoje <strong className="num">{networkRep?.reports7d ?? 0}</strong> denúncias nesta semana.
              Ligue com ele, simule outras pessoas denunciando e ligue de novo: a decisão muda sem ninguém mexer no seu celular.
            </p>
            <div className="net-actions">
              <button onClick={() => placeCall({ raw: NETWORK_NUMBER }, formatNumber(NETWORK_NUMBER))}>Ligar com ele</button>
              <button onClick={() => setState((s) => communityReports(s, NETWORK_NUMBER, 3, 'golpe'))}>3 pessoas denunciam</button>
              <button onClick={() => setState((s) => communityReports(s, NETWORK_NUMBER, 30, 'golpe'))}>30 pessoas denunciam</button>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <h2>Por dentro do motor</h2>
              <span className="hint">o usuário nunca vê a pontuação</span>
            </div>
            {log.length === 0 ? (
              <p className="body muted">Cada ligação simulada aparece aqui, com os sinais encontrados, a pontuação de 0 a 100 e o tempo que o motor levou para decidir. O limite do projeto é 500 ms.</p>
            ) : (
              <ol className="log">
                {log.map((e) => (
                  <li key={e.key}>
                    <div className="log-head">
                      <span className="log-who">{e.who}</span>
                      <span className={`pill lv-bg-${e.analysis.level}`}>{LEVEL_LABEL[e.analysis.level].label}</span>
                      <span className="log-dec">{e.analysis.record ? DECISION[e.analysis.action] : 'Contato: não analisado'}</span>
                    </div>
                    <div className="log-meta">
                      <span>pontuação <b className="num">{e.analysis.score}</b></span>
                      <span>decidiu em <b className="num">{e.latencyMs < 1 ? '< 1' : e.latencyMs.toFixed(1)} ms</b></span>
                    </div>
                    {e.analysis.signals.length > 0 && (
                      <div className="signals">
                        {e.analysis.signals.map((s) => (
                          <span key={s.id} className={s.weight < 0 ? 'sig good' : 'sig'}>{SIGNAL_LABEL[s.id] ?? s.id} <b className="num">{s.weight > 0 ? `+${s.weight}` : s.weight}</b></span>
                        ))}
                      </div>
                    )}
                    <div className="log-reason">“{e.analysis.reason}”</div>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <button className="reset" onClick={reset}>Recomeçar a demonstração</button>
        </section>

        <section className="stage" aria-label="Celular">
          <Phone state={state} setState={setState} ringing={ringing} setRinging={setRinging} banner={banner} setBanner={setBanner} />
          <p className="stage-note">Simulação. No app real, quem mostra a chamada é o próprio Android; o Detecta Golpes decide antes do primeiro toque.</p>
        </section>
      </main>
    </div>
  );
}
