import { describe, expect, it } from 'vitest';
import { analyzeCall, actionFor, normalizeNumber, scoreToLevel, mergeConfig, DEFAULT_CONFIG } from '../src/index.js';

describe('normalizeNumber', () => {
  it.each([
    ['(11) 98765-4321', '+5511987654321', 'movel'],
    ['+55 11 98765-4321', '+5511987654321', 'movel'],
    ['011 98765 4321', '+5511987654321', 'movel'],
    ['0 21 11 98765-4321', '+5511987654321', 'movel'],
    ['1133334444', '+551133334444', 'fixo'],
    ['0303 123 4567', '03031234567', 'telemarketing_0303'],
    ['0800 123 4567', '08001234567', 'servico'],
    ['4004 0001', '40040001', 'servico'],
    ['+1 415 555 0100', '+14155550100', 'internacional'],
    ['0044 20 7946 0958', '+442079460958', 'internacional'],
  ])('%s → %s', (raw, e164, kind) => {
    const n = normalizeNumber(raw);
    expect(n.e164).toBe(e164);
    expect(n.kind).toBe(kind);
  });

  it('marca DDD inexistente', () => {
    const n = normalizeNumber('2098765-4321');
    expect(n.invalidDdd).toBe(true);
  });

  it('marca faixa não alocada em celular sem 9', () => {
    expect(normalizeNumber('11187654321').unallocatedRange).toBe(true);
  });

  it('não adivinha DDD ausente', () => {
    expect(normalizeNumber('98765-4321').e164).toBeNull();
    expect(normalizeNumber('').kind).toBe('desconhecido');
  });

  it('retorna a UF do DDD (D-14)', () => {
    expect(normalizeNumber('61 99999 0000').uf).toBe('DF');
  });
});

describe('scoreToLevel (referência KAN-53)', () => {
  it('mapeia faixas', () => {
    expect(scoreToLevel(0)).toBe('moderado');
    expect(scoreToLevel(20)).toBe('suspeito');
    expect(scoreToLevel(60)).toBe('alto');
  });
});

describe('analyzeCall', () => {
  const unknown = '+55 11 98765-4321';

  it('CA-02: contato da agenda não é interceptado nem registrado', () => {
    const a = analyzeCall({ rawNumber: unknown, isContact: true, reputation: { reports7d: 99, reportsTotal: 99 } });
    expect(a.action).toBe('permitir');
    expect(a.record).toBe(false);
  });

  it('número sem histórico é moderado e toca, com aviso neutro', () => {
    const a = analyzeCall({ rawNumber: unknown });
    expect(a.level).toBe('moderado');
    expect(a.action).toBe('permitir');
    expect(a.reasonCode).toBe('sem_historico');
    expect(a.askFeedback).toBe(true);
  });

  it('CA-05: 30+ denúncias em 7 dias é alto risco e bloqueia', () => {
    const a = analyzeCall({ rawNumber: unknown, reputation: { reports7d: 30, reportsTotal: 30, predominantReason: 'golpe' } });
    expect(a.level).toBe('alto');
    expect(a.action).toBe('bloquear');
    expect(a.reason).toBe('30 pessoas denunciaram como golpe esta semana');
  });

  it('poucas denúncias = suspeito, silenciado no nível médio', () => {
    const a = analyzeCall({ rawNumber: unknown, reputation: { reports7d: 2, reportsTotal: 2 } });
    expect(a.level).toBe('suspeito');
    expect(a.action).toBe('silenciar');
  });

  it('0303 é telemarketing, não golpe', () => {
    const a = analyzeCall({ rawNumber: '0303 123 4567' });
    expect(a.level).toBe('suspeito');
    expect(a.reason).toBe('Telemarketing (prefixo 0303)');
  });

  it('falha de autenticação de origem é alto risco', () => {
    const a = analyzeCall({ rawNumber: unknown, verification: 'falhou' });
    expect(a.level).toBe('alto');
    expect(a.reasonCode).toBe('falha_autenticacao');
  });

  it('origem autenticada sem denúncias é baixo risco', () => {
    const a = analyzeCall({ rawNumber: unknown, verification: 'aprovada' });
    expect(a.level).toBe('baixo');
    expect(a.reason).toBe('Origem confirmada pela operadora');
  });

  it('HU-07: denúncias de falso banco geram frase específica', () => {
    const a = analyzeCall({ rawNumber: unknown, reputation: { reports7d: 12, reportsTotal: 12, predominantReason: 'falso_banco' } });
    expect(a.reason).toBe('Possível falso banco: 12 pessoas denunciaram');
    expect(a.level).toBe('alto');
  });

  it('HU-07: número oficial de banco é baixo risco', () => {
    const a = analyzeCall({ rawNumber: '0800 123 4567', officialBank: 'Banco do Brasil' });
    expect(a.level).toBe('baixo');
    expect(a.reason).toBe('Número oficial do Banco do Brasil');
  });

  it('HU-17: lista de permitidos tem prioridade sobre o risco', () => {
    const a = analyzeCall({ rawNumber: unknown, personalList: 'permitido', reputation: { reports7d: 50, reportsTotal: 50 } });
    expect(a.action).toBe('permitir');
    expect(a.reason).toBe('Permitido por você');
  });

  it('HU-17: lista de bloqueados bloqueia', () => {
    expect(analyzeCall({ rawNumber: unknown, personalList: 'bloqueado' }).action).toBe('bloquear');
  });

  it('HU-19: proteção alta bloqueia suspeitos; baixa deixa tocar', () => {
    const ctx = { rawNumber: unknown, reputation: { reports7d: 2, reportsTotal: 2 } };
    expect(analyzeCall({ ...ctx, protection: 'alto' }).action).toBe('bloquear');
    expect(analyzeCall({ ...ctx, protection: 'baixo' }).action).toBe('permitir');
    expect(actionFor('alto', 'baixo')).toBe('bloquear');
  });

  it('HU-10: modo idoso bloqueia números muito denunciados', () => {
    const ctx = { rawNumber: unknown, reputation: { reports7d: 1, reportsTotal: 6 } };
    expect(analyzeCall(ctx).action).toBe('silenciar');
    const elder = analyzeCall({ ...ctx, elderMode: true });
    expect(elder.action).toBe('bloquear');
    expect(elder.level).toBe('alto');
  });

  it('CA-06: frase sempre ≤ 60 caracteres e sem pontuação numérica', () => {
    const cases = [
      { rawNumber: unknown, reputation: { reports7d: 1234, reportsTotal: 99999, predominantReason: 'cobranca_indevida' as const } },
      { rawNumber: '+44 20 7946 0958' },
      { rawNumber: '20 98765 4321' },
      { rawNumber: '' },
    ];
    for (const c of cases) {
      const a = analyzeCall(c);
      expect(a.reason.length).toBeLessThanOrEqual(60);
      expect(a.reason).not.toContain(String(a.score) + ' pontos');
    }
  });

  it('CA-03: analisa 100 mil chamadas bem abaixo de 500 ms cada', () => {
    const t0 = performance.now();
    for (let i = 0; i < 100_000; i++) analyzeCall({ rawNumber: `+55119${String(i).padStart(8, '0')}`, reputation: { reports7d: i % 40, reportsTotal: i % 60 } });
    const perCall = (performance.now() - t0) / 100_000;
    expect(perCall).toBeLessThan(1);
  });

  it('pesos são ajustáveis por configuração', () => {
    const cfg = mergeConfig({ weights: { ...DEFAULT_CONFIG.weights, prefix0303: 0 } });
    expect(analyzeCall({ rawNumber: '0303 123 4567' }, cfg).level).toBe('moderado');
  });
});
