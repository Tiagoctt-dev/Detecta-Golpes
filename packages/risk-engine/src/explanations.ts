import type { ReportReason, RiskLevel } from './engine.js';

/**
 * Catálogo de explicações em linguagem simples por tipo de golpe (HU-08 / KAN-85).
 * Usado na tela de alerta do modo idoso (também lida em voz alta, TTS).
 */
export interface Explanation {
  title: string;
  text: string;
  advice: string;
}

export const SCAM_EXPLANATIONS: Readonly<Record<ReportReason, Explanation>> = Object.freeze({
  golpe: {
    title: 'Possível golpe',
    text: 'Outras pessoas disseram que este número tentou enganá-las.',
    advice: 'Não passe senhas, códigos ou dados do banco. Se for alguém conhecido, ligue você de volta para o número que já tem salvo.',
  },
  falso_banco: {
    title: 'Possível falso funcionário de banco',
    text: 'Pessoas disseram que este número finge ser do banco para pedir dados ou transferências.',
    advice: 'O banco nunca pede senha, código ou PIX por telefone. Desligue e ligue para o número que está atrás do seu cartão.',
  },
  telemarketing: {
    title: 'Telemarketing',
    text: 'Este número costuma ligar para oferecer produtos.',
    advice: 'Não é golpe, mas você não precisa atender. Cadastre-se no site Não Me Perturbe para receber menos ligações.',
  },
  cobranca_indevida: {
    title: 'Cobrança suspeita',
    text: 'Pessoas disseram que este número faz cobranças que não reconheciam.',
    advice: 'Não pague nada pelo telefone. Confira a dívida direto com a empresa, pelo site ou aplicativo oficial.',
  },
});

export const LEVEL_LABEL: Readonly<Record<RiskLevel, { label: string; color: string }>> = Object.freeze({
  baixo: { label: 'Baixo risco', color: '#2E7D32' },
  moderado: { label: 'Sem histórico', color: '#F9A825' },
  suspeito: { label: 'Suspeito', color: '#EF6C00' },
  alto: { label: 'Alto risco', color: '#C62828' },
});
