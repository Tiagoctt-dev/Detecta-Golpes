/**
 * Normalização de números (funcionalidade 2 do MVP).
 * Converte para E.164, remove espaços/traços/parênteses e código de operadora.
 * Não tenta adivinhar DDD ausente: sem DDD o número é tratado como desconhecido.
 */

/** DDDs válidos no Brasil e a UF de registro (D-14: UF do DDD em vez de localização). */
export const DDD_UF: Readonly<Record<string, string>> = Object.freeze({
  '11': 'SP', '12': 'SP', '13': 'SP', '14': 'SP', '15': 'SP', '16': 'SP', '17': 'SP', '18': 'SP', '19': 'SP',
  '21': 'RJ', '22': 'RJ', '24': 'RJ', '27': 'ES', '28': 'ES',
  '31': 'MG', '32': 'MG', '33': 'MG', '34': 'MG', '35': 'MG', '37': 'MG', '38': 'MG',
  '41': 'PR', '42': 'PR', '43': 'PR', '44': 'PR', '45': 'PR', '46': 'PR',
  '47': 'SC', '48': 'SC', '49': 'SC', '51': 'RS', '53': 'RS', '54': 'RS', '55': 'RS',
  '61': 'DF', '62': 'GO', '64': 'GO', '63': 'TO', '65': 'MT', '66': 'MT', '67': 'MS', '68': 'AC', '69': 'RO',
  '71': 'BA', '73': 'BA', '74': 'BA', '75': 'BA', '77': 'BA', '79': 'SE',
  '81': 'PE', '87': 'PE', '82': 'AL', '83': 'PB', '84': 'RN', '85': 'CE', '88': 'CE', '86': 'PI', '89': 'PI',
  '91': 'PA', '93': 'PA', '94': 'PA', '92': 'AM', '97': 'AM', '95': 'RR', '96': 'AP', '98': 'MA', '99': 'MA',
});

export type NumberKind = 'movel' | 'fixo' | 'telemarketing_0303' | 'servico' | 'internacional' | 'desconhecido';

export interface NormalizedNumber {
  /** Formato E.164 (ex.: +5511987654321). Para 0303 usa o formato nacional "0303XXXXXXX". null se não normalizável. */
  e164: string | null;
  /** Código do país sem "+" (ex.: "55"). */
  country: string | null;
  ddd: string | null;
  uf: string | null;
  kind: NumberKind;
  /** DDD existe, mas o número está fora das faixas de numeração alocadas. */
  unallocatedRange: boolean;
  /** DDD informado não existe. */
  invalidDdd: boolean;
}

const UNKNOWN: NormalizedNumber = {
  e164: null, country: null, ddd: null, uf: null, kind: 'desconhecido', unallocatedRange: false, invalidDdd: false,
};

function national(digits: string): NormalizedNumber {
  // Telemarketing ativo regulado pela Anatel.
  if (/^0303\d{7}$/.test(digits)) {
    return { ...UNKNOWN, e164: digits, country: '55', kind: 'telemarketing_0303' };
  }
  // 0800/0300/0500/0900 (serviços não geográficos).
  if (/^0[3589]00\d{6,7}$/.test(digits)) {
    return { ...UNKNOWN, e164: digits, country: '55', kind: 'servico' };
  }
  // Números únicos nacionais 300X/400X (sem DDD), muito usados por bancos.
  if (/^[34]00\d{5}$/.test(digits)) {
    return { ...UNKNOWN, e164: digits, country: '55', kind: 'servico' };
  }
  let d = digits;
  // Discagem com código de operadora: 0 + CSP(2) + DDD(2) + assinante(8|9)
  if (/^0\d{2}\d{2}\d{8,9}$/.test(d)) d = d.slice(3);
  // Discagem com zero de longa distância sem operadora: 0 + DDD + assinante
  else if (/^0\d{2}\d{8,9}$/.test(d)) d = d.slice(1);

  if (!/^\d{10,11}$/.test(d)) return { ...UNKNOWN };

  const ddd = d.slice(0, 2);
  const subscriber = d.slice(2);
  const uf = DDD_UF[ddd] ?? null;
  const invalidDdd = uf === null;
  let kind: NumberKind = 'desconhecido';
  let unallocatedRange = false;
  if (subscriber.length === 9) {
    kind = 'movel';
    unallocatedRange = !subscriber.startsWith('9');
  } else {
    kind = 'fixo';
    // Assinantes fixos começam com 2..5; 6..9 com 8 dígitos são celulares antigos (sem o 9) e 0/1 não são alocados.
    unallocatedRange = /^[01]/.test(subscriber);
    if (/^[6-9]/.test(subscriber)) kind = 'movel';
  }
  return { e164: `+55${d}`, country: '55', ddd, uf, kind, unallocatedRange, invalidDdd };
}

/**
 * Normaliza um número recebido pelo sistema (pode vir com +, espaços, traços, parênteses, 00 internacional...).
 * @param raw número cru
 * @param ownCountry país do aparelho (padrão Brasil, "55")
 */
export function normalizeNumber(raw: string | null | undefined, ownCountry = '55'): NormalizedNumber {
  if (!raw) return { ...UNKNOWN };
  const trimmed = raw.trim();
  const plus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');
  if (!digits) return { ...UNKNOWN };

  if (!plus && digits.startsWith('00')) {
    // 00 + país (discagem internacional)
    digits = digits.slice(2);
    return international(digits, ownCountry);
  }
  if (plus) return international(digits, ownCountry);
  return national(digits);
}

function international(digits: string, ownCountry: string): NormalizedNumber {
  if (digits.startsWith('55') && ownCountry === '55') {
    const n = national(digits.slice(2));
    return n.e164 ? n : { ...UNKNOWN };
  }
  if (digits.length < 8 || digits.length > 15) return { ...UNKNOWN };
  // Registra apenas o país (até 3 dígitos); não faz tratamento especial além disso.
  const country = digits.slice(0, digits.startsWith('1') || digits.startsWith('7') ? 1 : 2);
  return { ...UNKNOWN, e164: `+${digits}`, country, kind: 'internacional' };
}
