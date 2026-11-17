import type { IncomingCall } from './sim';

/** Roteiro da apresentação: cada cenário demonstra uma regra do MVP. */
export interface Scenario {
  id: string;
  title: string;
  who: string;
  expect: string;
  rule: string;
  call: IncomingCall;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'falso-banco', title: 'Golpe do falso banco', who: '(11) 91234-0001',
    expect: 'Bloqueia', rule: 'CA-05 · 30+ denúncias em 7 dias',
    call: { raw: '+55 11 91234-0001' },
  },
  {
    id: 'poucas', title: 'Número com 2 denúncias', who: '(21) 91234-0002',
    expect: 'Silencia', rule: 'Nível suspeito',
    call: { raw: '+55 21 91234-0002' },
  },
  {
    id: 'telemarketing', title: 'Telemarketing 0303', who: '0303 123 4567',
    expect: 'Silencia', rule: 'Prefixo 0303 é telemarketing, não golpe',
    call: { raw: '0303 123 4567' },
  },
  {
    id: 'desconhecido', title: 'Número sem histórico', who: '(31) 91234-0003',
    expect: 'Toca', rule: 'Aviso neutro, sem alarde',
    call: { raw: '+55 31 91234-0003' },
  },
  {
    id: 'spoofing', title: 'Número falsificado', who: '(11) 2345-6789',
    expect: 'Bloqueia', rule: 'Operadora não confirmou a origem',
    call: { raw: '+55 11 2345-6789', verification: 'falhou' },
  },
  {
    id: 'banco-real', title: 'Banco de verdade', who: '4004-0001',
    expect: 'Toca', rule: 'HU-07 · base de números oficiais',
    call: { raw: '4004 0001' },
  },
  {
    id: 'contato', title: 'Contato da agenda', who: 'Mãe',
    expect: 'Toca', rule: 'CA-02 · contatos nunca são analisados',
    call: { raw: '+55 11 99876-5432', isContact: true, contactName: 'Mãe' },
  },
  {
    id: 'exterior', title: 'Ligação do exterior', who: '+44 20 7946 0958',
    expect: 'Silencia', rule: 'Chamada internacional inesperada',
    call: { raw: '+44 20 7946 0958' },
  },
];

/**
 * Número usado para mostrar o efeito de rede: começa sem histórico.
 * Diferente do cenário "Número sem histórico", para as denúncias simuladas não mudarem aquele cenário.
 */
export const NETWORK_NUMBER = '+55 41 98765-1000';
