import { useEffect, useState } from 'react';
import {
  LEVEL_LABEL, SCAM_EXPLANATIONS, normalizeNumber,
  type Analysis, type ProtectionLevel, type ReportReason, type RiskLevel,
} from '@detecta/risk-engine';
import {
  analyze, formatNumber, myReport, pendingFeedback, setFeedback, setPersonal,
  type CallRecord, type Feedback, type IncomingCall, type SimState,
} from '../sim';
import {
  ActionIcon, ClockIcon, HomeIcon, LevelIcon, ListIcon, PhoneIcon, PhoneOffIcon, SearchIcon, SettingsIcon, ShieldCheckIcon,
} from '../icons';

export interface Ringing {
  call: IncomingCall;
  analysis: Analysis;
  recordId: number | null;
  phase: 'tocando' | 'em-chamada';
}

export interface Banner {
  key: number;
  title: string;
  text: string;
  level: RiskLevel;
  number: string | null;
  recordId: number | null;
}

type Tab = 'inicio' | 'historico' | 'consultar' | 'listas' | 'ajustes';
const TABS: Array<[Tab, string, (p: { size?: number }) => JSX.Element]> = [
  ['inicio', 'Início', HomeIcon], ['historico', 'Histórico', ClockIcon], ['consultar', 'Consultar', SearchIcon],
  ['listas', 'Listas', ListIcon], ['ajustes', 'Ajustes', SettingsIcon],
];
const ACTION_LABEL = { permitir: 'Tocou', silenciar: 'Silenciada', bloquear: 'Bloqueada' } as const;

function speak(text: string) {
  try {
    const synth = window.speechSynthesis;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    u.rate = 0.95;
    synth.speak(u);
  } catch { /* sem voz neste navegador */ }
}

function stopSpeaking() {
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
}

export function scamTypeOf(a: Pick<Analysis, 'reason' | 'reasonCode'>): ReportReason {
  if (a.reasonCode === 'prefixo_0303' || a.reason.startsWith('Telemarketing')) return 'telemarketing';
  if (a.reason.includes('falso banco')) return 'falso_banco';
  if (a.reason.startsWith('Cobrança')) return 'cobranca_indevida';
  return 'golpe';
}

function Badge({ level }: { level: RiskLevel }) {
  return (
    <span className={`badge lv-${level}`}>
      <LevelIcon level={level} />
      {LEVEL_LABEL[level].label}
    </span>
  );
}

function when(ms: number) {
  return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function Phone({ state, setState, ringing, setRinging, banner, setBanner }: {
  state: SimState;
  setState: (fn: (s: SimState) => SimState) => void;
  ringing: Ringing | null;
  setRinging: (r: Ringing | null) => void;
  banner: Banner | null;
  setBanner: (b: Banner | null) => void;
}) {
  const [tab, setTab] = useState<Tab>('inicio');
  const [detail, setDetail] = useState<CallRecord | null>(null);
  const [roleDialog, setRoleDialog] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  function release(number: string, recordId: number | null) {
    setState((s) => {
      let n = setPersonal(s, number, 'permitido');
      if (recordId) n = setFeedback(n, recordId, 'legitima');
      return n;
    });
    setBanner(null);
    setToast('Número liberado. As próximas ligações vão tocar.');
  }

  const root = `phone ${state.elderMode ? 'elder' : ''}`;

  return (
    <div className={root} aria-label="Simulação do celular">
      <div className="statusbar"><span>{new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><span className="notch" /><span>5G ▮▮▮</span></div>

      <div className="screen">
        {!state.onboarded ? (
          <Onboarding onActivate={() => setRoleDialog(true)} />
        ) : detail ? (
          <AlertDetail
            call={detail}
            elder={state.elderMode}
            onBack={() => { stopSpeaking(); setDetail(null); }}
            onRelease={() => { release(detail.numero, detail.id); stopSpeaking(); setDetail(null); }}
          />
        ) : (
          <>
            <div className="scroll">
              {tab === 'inicio' && <Home state={state} setState={setState} onOpen={setDetail} />}
              {tab === 'historico' && <History state={state} setState={setState} onOpen={setDetail} />}
              {tab === 'consultar' && <Lookup state={state} setState={setState} />}
              {tab === 'listas' && <Lists state={state} setState={setState} />}
              {tab === 'ajustes' && <Settings state={state} setState={setState} />}
            </div>
            <nav className="tabs">
              {TABS.map(([id, label, TabIcon]) => (
                <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)} aria-current={tab === id}>
                  <TabIcon size={19} />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
          </>
        )}
      </div>

      {roleDialog && (
        <div className="sheet-backdrop">
          <div className="sheet" role="dialog" aria-label="Permissão do Android">
            <div className="sheet-title">Definir Detecta Golpes como app padrão de identificação de chamadas e spam?</div>
            <label className="radio"><input type="radio" name="role" defaultChecked /> Detecta Golpes</label>
            <label className="radio"><input type="radio" name="role" /> Telefone</label>
            <div className="sheet-actions">
              <button className="link" onClick={() => setRoleDialog(false)}>Cancelar</button>
              <button className="link strong" onClick={() => { setRoleDialog(false); setState((s) => ({ ...s, onboarded: true })); }}>Definir como padrão</button>
            </div>
            <div className="sheet-note">Diálogo do próprio Android, simulado para a demonstração.</div>
          </div>
        </div>
      )}

      {ringing && <CallScreen ringing={ringing} elder={state.elderMode} onAnswer={() => setRinging({ ...ringing, phase: 'em-chamada' })} onEnd={() => setRinging(null)} />}

      {banner && (
        <div className={`banner lv-edge-${banner.level}`} key={banner.key} role="status">
          <div className="banner-app">Detecta Golpes · agora</div>
          <div className="banner-title"><LevelIcon level={banner.level} size={15} /> {banner.title}</div>
          <div className="banner-text">{banner.text}</div>
          <div className="banner-actions">
            {banner.number && <button className="link strong" onClick={() => release(banner.number!, banner.recordId)}>Liberar este número</button>}
            <button className="link" onClick={() => setBanner(null)}>Fechar</button>
          </div>
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Onboarding({ onActivate }: { onActivate: () => void }) {
  return (
    <div className="scroll pad">
      <h2 className="app-title">Detecta Golpes</h2>
      <p className="muted lead">Avisamos se uma ligação desconhecida pode ser golpe, antes de você atender.</p>
      <div className="card">
        <h3>O que vamos pedir</h3>
        <p>O Android vai perguntar se o Detecta Golpes pode ser seu "app de identificação de chamadas e spam". Isso deixa a gente olhar o número de quem liga, antes de tocar.</p>
      </div>
      <div className="card">
        <h3>O que nunca fazemos</h3>
        <ul>
          <li>Não lemos nem enviamos sua agenda de contatos.</li>
          <li>Contatos salvos tocam normalmente, sem interferência.</li>
          <li>Não ouvimos nem gravamos ligações.</li>
          <li>Nenhuma chamada some: tudo que barrarmos fica no histórico, com um botão para liberar.</li>
        </ul>
      </div>
      <button className="btn primary" onClick={onActivate}>Ativar proteção</button>
    </div>
  );
}

function CallScreen({ ringing, elder, onAnswer, onEnd }: { ringing: Ringing; elder: boolean; onAnswer: () => void; onEnd: () => void }) {
  const { call, analysis: a, phase } = ringing;
  const silent = a.action === 'silenciar';
  const showSeal = !call.isContact;
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (phase !== 'em-chamada') return;
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);
  useEffect(() => {
    if (elder && showSeal && phase === 'tocando' && a.level !== 'baixo') speak(`Atenção. ${a.reason}`);
  }, [elder, showSeal, phase, a.level, a.reason]);

  return (
    <div className="callscreen">
      <div className="call-top">
        <div className="call-state">{phase === 'em-chamada' ? `Em chamada · 0:${String(secs).padStart(2, '0')}` : silent ? 'Chamada recebida · no silencioso' : 'Chamada recebida'}</div>
        <div className="call-number">{call.contactName ?? formatNumber(a.number.e164 ?? call.raw)}</div>
        {a.number.uf && !call.contactName && <div className="call-sub">Linha registrada em {a.number.uf}</div>}
        {showSeal && (
          <div className={`seal lv-bg-${a.level}`}>
            <div className="seal-level"><LevelIcon level={a.level} size={14} /> {LEVEL_LABEL[a.level].label}</div>
            <div className="seal-reason">{a.reason}</div>
          </div>
        )}
        {silent && phase === 'tocando' && <div className="call-hint">O telefone não tocou alto. Você decide se atende.</div>}
      </div>
      <div className="call-actions">
        {phase === 'tocando' ? (
          <>
            <div className="call-btn-wrap">
              <button className="round decline" onClick={onEnd} aria-label="Recusar"><PhoneOffIcon size={28} /></button>
              <span className="call-btn-label">Recusar</span>
            </div>
            <div className="call-btn-wrap">
              <button className="round answer" onClick={onAnswer} aria-label="Atender"><PhoneIcon size={28} /></button>
              <span className="call-btn-label">Atender</span>
            </div>
          </>
        ) : (
          <div className="call-btn-wrap">
            <button className="round decline" onClick={onEnd} aria-label="Desligar"><PhoneOffIcon size={28} /></button>
            <span className="call-btn-label">Desligar</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Home({ state, setState, onOpen }: { state: SimState; setState: (fn: (s: SimState) => SimState) => void; onOpen: (c: CallRecord) => void }) {
  const pending = pendingFeedback(state);
  const recent = state.calls.slice(0, 3);
  const answer = (f: Feedback | null) => pending && setState((s) => setFeedback(s, pending.id, f));
  return (
    <div className="pad stack">
      <div className="card ok">
        <h3 className="ok-text"><ShieldCheckIcon size={18} /> Você está protegido</h3>
        <p className="muted">{Object.keys(state.reputations).length} números denunciados na base do aparelho</p>
      </div>
      {pending && (
        <div className="card focus">
          <h3>Como foi a ligação de {pending.exibido}?</h3>
          <p className="muted small">{when(pending.at)} · sua resposta protege outras pessoas</p>
          <button className="btn danger" onClick={() => answer('golpe')}>Era golpe</button>
          <button className="btn ghost" onClick={() => answer('telemarketing')}>Era telemarketing</button>
          <button className="btn ghost" onClick={() => answer('legitima')}>Era legítima</button>
          <button className="btn ghost quiet" onClick={() => answer(null)}>Não sei / não atendi</button>
        </div>
      )}
      <h4 className="section">Últimas chamadas analisadas</h4>
      {recent.length === 0 && <p className="muted">Nenhuma chamada desconhecida ainda. Use o painel ao lado para simular uma.</p>}
      {recent.map((c) => <CallRow key={c.id} c={c} onOpen={onOpen} />)}
    </div>
  );
}

function CallRow({ c, onOpen }: { c: CallRecord; onOpen: (c: CallRecord) => void }) {
  return (
    <button className="card row-card" onClick={() => onOpen(c)}>
      <div className="row-head"><strong>{c.exibido}</strong><Badge level={c.analysis.level} /></div>
      <div>{c.analysis.reason}</div>
      <div className="muted small">
        {ACTION_LABEL[c.analysis.action]} · {when(c.at)}
        {c.feedback && ` · você disse: ${c.feedback === 'legitima' ? 'legítima' : c.feedback}`}
      </div>
    </button>
  );
}

function History({ state, onOpen }: { state: SimState; setState: (fn: (s: SimState) => SimState) => void; onOpen: (c: CallRecord) => void }) {
  return (
    <div className="pad stack">
      <p className="muted small">Toque numa chamada para ver o motivo, liberar ou denunciar.</p>
      {state.calls.length === 0 && <p className="muted">Nenhuma chamada analisada ainda.</p>}
      {state.calls.map((c) => <CallRow key={c.id} c={c} onOpen={onOpen} />)}
    </div>
  );
}

function AlertDetail({ call, elder, onBack, onRelease }: { call: CallRecord; elder: boolean; onBack: () => void; onRelease: () => void }) {
  const ex = SCAM_EXPLANATIONS[scamTypeOf(call.analysis)];
  const risky = call.analysis.level === 'alto' || call.analysis.level === 'suspeito';
  const text = `${ex.title}. ${call.analysis.reason}. ${ex.text} ${ex.advice}`;
  useEffect(() => { if (elder && risky) speak(text); return stopSpeaking; }, [elder, risky, text]);
  return (
    <div className="scroll pad stack">
      <div className="card">
        <Badge level={call.analysis.level} />
        <h3 className="detail-title">{risky ? ex.title : 'Chamada analisada'}</h3>
        <p className="big">{call.analysis.reason}</p>
        <p className="muted small">{call.exibido} · {when(call.at)} · {ACTION_LABEL[call.analysis.action]}</p>
      </div>
      {risky && (
        <div className="card">
          <p className="big">{ex.text}</p>
          <h4>O que fazer</h4>
          <p className="big">{ex.advice}</p>
        </div>
      )}
      {risky && <button className="btn primary" onClick={() => speak(text)}>Ouvir explicação</button>}
      {call.analysis.reasonCode !== 'lista_permitidos' && <button className="btn ghost" onClick={onRelease}>Não era golpe: liberar este número</button>}
      <button className="btn ghost" onClick={onBack}>Voltar</button>
    </div>
  );
}

const REASONS: Array<[ReportReason, string]> = [
  ['golpe', 'Golpe'], ['falso_banco', 'Falso banco'], ['telemarketing', 'Telemarketing'], ['cobranca_indevida', 'Cobrança indevida'],
];

function Lookup({ state, setState }: { state: SimState; setState: (fn: (s: SimState) => SimState) => void }) {
  const [input, setInput] = useState('(11) 91234-0001');
  const [shown, setShown] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const valid = !!normalizeNumber(input).e164;
  const e164 = shown ? normalizeNumber(shown).e164 : null;
  const rep = e164 ? state.reputations[e164] : undefined;
  const result = shown ? analyze(state, { raw: shown }).analysis : null;
  const noRecords = result && !rep && !(e164 && state.official[e164]) && result.signals.length === 0;

  function report(reason: ReportReason) {
    const [next, outcome] = myReport(state, shown!, reason);
    setState(() => next);
    setMsg(outcome === 'duplicada' ? 'Você já denunciou este número.' : 'Obrigado! Sua denúncia já protege outras pessoas.');
  }

  return (
    <div className="pad stack">
      <h3>Consultar um número</h3>
      <p className="muted small">Recebeu um número por mensagem? Veja a reputação antes de ligar de volta.</p>
      <label className="sr" htmlFor="lookup-input">Número</label>
      <input id="lookup-input" className="input" inputMode="tel" value={input} onChange={(e) => setInput(e.target.value)} placeholder="(11) 98765-4321" />
      <button className="btn primary" disabled={!valid} onClick={() => { setShown(input); setMsg(null); }}>Consultar</button>
      {!valid && input.length > 6 && <p className="danger-text small">Número inválido. Inclua o DDD.</p>}
      {result && (
        <div className="card">
          <Badge level={result.level} />
          <p className="big strong">{noRecords ? 'Sem registros - número ainda não avaliado' : result.reason}</p>
          {rep && <p className="muted small">{rep.reportsTotal} denúncia(s) no total, {rep.reports7d} nesta semana</p>}
          {result.number.uf && <p className="muted small">Linha registrada em {result.number.uf}</p>}
          <h4>Denunciar este número</h4>
          <div className="chips">
            {REASONS.map(([id, label]) => <button key={id} className="chip" onClick={() => report(id)}>{label}</button>)}
          </div>
        </div>
      )}
      {msg && <p className="small">{msg}</p>}
    </div>
  );
}

function Lists({ state, setState }: { state: SimState; setState: (fn: (s: SimState) => SimState) => void }) {
  const [num, setNum] = useState('');
  const valid = !!normalizeNumber(num).e164;
  const entries = Object.entries(state.personal);
  const add = (l: 'permitido' | 'bloqueado') => { setState((s) => setPersonal(s, num, l)); setNum(''); };
  const section = (l: 'permitido' | 'bloqueado', title: string, hint: string) => (
    <div className="card">
      <h3>{title}</h3>
      <p className="muted small">{hint}</p>
      {entries.filter(([, v]) => v === l).length === 0 && <p className="muted small">Vazia.</p>}
      {entries.filter(([, v]) => v === l).map(([n]) => (
        <div className="row-head list-row" key={n}>
          <span>{formatNumber(n)}</span>
          <button className="link" onClick={() => setState((s) => setPersonal(s, n, null))}>Remover</button>
        </div>
      ))}
    </div>
  );
  return (
    <div className="pad stack">
      <div className="card">
        <h3>Adicionar número</h3>
        <label className="sr" htmlFor="list-input">Número com DDD</label>
        <input id="list-input" className="input" inputMode="tel" placeholder="Número com DDD" value={num} onChange={(e) => setNum(e.target.value)} />
        <div className="two">
          <button className="btn primary" disabled={!valid} onClick={() => add('permitido')}>Sempre permitir</button>
          <button className="btn danger" disabled={!valid} onClick={() => add('bloqueado')}>Sempre bloquear</button>
        </div>
      </div>
      {section('permitido', 'Permitidos', 'Tocam normalmente, mesmo que outras pessoas tenham denunciado.')}
      {section('bloqueado', 'Bloqueados', 'Nunca tocam. Continuam aparecendo no histórico.')}
    </div>
  );
}

const LEVELS: Array<[ProtectionLevel, string, string]> = [
  ['baixo', 'Baixa', 'Só bloqueia alto risco. Suspeitas tocam com aviso.'],
  ['medio', 'Média (recomendada)', 'Bloqueia alto risco e silencia suspeitas.'],
  ['alto', 'Alta', 'Bloqueia também as suspeitas. Pode barrar ligações legítimas.'],
];

function Settings({ state, setState }: { state: SimState; setState: (fn: (s: SimState) => SimState) => void }) {
  return (
    <div className="pad stack">
      <div className="card">
        <h3>Nível de proteção</h3>
        {LEVELS.map(([id, label]) => (
          <button key={id} className={`btn ${state.protection === id ? 'primary' : 'ghost'}`} onClick={() => setState((s) => ({ ...s, protection: id }))}>{label}</button>
        ))}
        <p className="muted small">{LEVELS.find((l) => l[0] === state.protection)?.[2]}</p>
      </div>
      <div className="card">
        <label className="toggle" htmlFor="elder-toggle">
          <span>
            <h3>Modo simples (idosos)</h3>
            <span className="muted small">Letras maiores, explicação lida em voz alta e bloqueio automático de números com várias denúncias.</span>
          </span>
          <input id="elder-toggle" type="checkbox" checked={state.elderMode} onChange={(e) => setState((s) => ({ ...s, elderMode: e.target.checked }))} />
        </label>
      </div>
      <div className="card">
        <h3>Privacidade</h3>
        <p className="small">Sua agenda nunca sai do aparelho. Enviamos apenas números desconhecidos que ligaram para você, a decisão tomada e suas denúncias, com a finalidade única de prevenir fraudes.</p>
      </div>
    </div>
  );
}
