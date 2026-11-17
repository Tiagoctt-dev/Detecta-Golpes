/**
 * @format
 */
import { NativeModules } from 'react-native';
import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { describe, expect, it, jest } from '@jest/globals';

const base = { protecao: 'medio', modoIdoso: false, ultimaSincronizacao: null, numerosNaBase: 12, triagemAtiva: false };
let current = { ...base };

function mockNative(overrides: Partial<typeof base> = {}) {
  current = { ...base, ...overrides };
}

NativeModules.DetectaNative = {
    getState: jest.fn(async () => JSON.stringify(current)),
    getCredentials: jest.fn(async () => JSON.stringify({ apiUrl: 'http://x', token: 't' })),
    configure: jest.fn(async () => true),
    syncNow: jest.fn(async () => 0),
    getUnsynced: jest.fn(async () => '[]'),
    getPendingFeedback: jest.fn(async () => JSON.stringify({
      id: 1, numero: '+5511987654321', bruto: '', nivel: 'suspeito', acao: 'silenciar', motivo: '2 pessoas denunciaram como golpe esta semana',
      codigoMotivo: 'denuncias_recentes', latenciaMs: 3, recebidaEm: Date.now(), pedirFeedback: true, feedback: null, servidorId: null,
    })),
    getCalls: jest.fn(async () => '[]'),
    requestScreeningRole: jest.fn(async () => true),
    speak: jest.fn(),
    stopSpeaking: jest.fn(),
};
const App = require('../App').default;

const textOf = (r: ReactTestRenderer) =>
  r.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children as string).join(' | ');

async function render() {
  let r!: ReactTestRenderer;
  await act(async () => { r = create(<App />); });
  // Espera os efeitos assíncronos (estado nativo, sincronização) assentarem.
  for (let i = 0; i < 10; i++) {
    await act(async () => { await new Promise((res) => setTimeout(res, 10)); });
  }
  return r;
}

describe('App', () => {
  it('explica a permissão antes de pedir (H-01) quando a triagem está desligada', async () => {
    mockNative({ triagemAtiva: false });
    const r = await render();
    const t = textOf(r);
    expect(t).toContain('Ativar proteção');
    expect(t).toContain('Não lemos nem enviamos sua agenda de contatos.');
  });

  it('mostra o card de feedback pós-chamada (CA-08) quando protegido', async () => {
    mockNative({ triagemAtiva: true });
    const r = await render();
    const t = textOf(r);
    expect(t).toContain('Era golpe');
    expect(t).toContain('Era telemarketing');
    expect(t).toContain('Era legítima');
  });
});

describe('scamTypeOf', () => {
  it('deduz o tipo de golpe a partir do motivo', () => {
    const { scamTypeOf } = require('../src/screens/AlertDetail');
    expect(scamTypeOf({ motivo: 'Possível falso banco: 3 pessoas denunciaram', codigoMotivo: 'denuncias_recentes' })).toBe('falso_banco');
    expect(scamTypeOf({ motivo: 'Telemarketing (prefixo 0303)', codigoMotivo: 'prefixo_0303' })).toBe('telemarketing');
    expect(scamTypeOf({ motivo: 'Cobrança indevida denunciada por 2 pessoas', codigoMotivo: 'denuncias_recentes' })).toBe('cobranca_indevida');
    expect(scamTypeOf({ motivo: 'A operadora não confirmou a origem: pode ser falso', codigoMotivo: 'falha_autenticacao' })).toBe('golpe');
  });
});
