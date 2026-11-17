-- Detecta Golpes: modelo de dados inicial (KAN-43)
-- Princípio: nada da agenda do usuário chega aqui (CA-11). Só números fora da agenda.

CREATE TABLE devices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash   TEXT NOT NULL UNIQUE,
  protection   TEXT NOT NULL DEFAULT 'medio' CHECK (protection IN ('baixo', 'medio', 'alto')),
  elder_mode   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Denúncias. Uma por dispositivo/número (HU-16). "counts" = dentro do limite diário (CA-10).
CREATE TABLE reports (
  id          BIGSERIAL PRIMARY KEY,
  device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  e164        TEXT NOT NULL,
  reason      TEXT NOT NULL CHECK (reason IN ('golpe', 'falso_banco', 'telemarketing', 'cobranca_indevida')),
  counts      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (device_id, e164)
);
CREATE INDEX reports_e164_idx ON reports (e164, created_at DESC);
CREATE INDEX reports_created_idx ON reports (created_at);
CREATE INDEX reports_device_day_idx ON reports (device_id, created_at);

-- Listas pessoais (HU-17). Valem só para o dispositivo e nunca alteram o risco público.
CREATE TABLE personal_lists (
  device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  e164        TEXT NOT NULL,
  list        TEXT NOT NULL CHECK (list IN ('permitido', 'bloqueado')),
  label       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, e164)
);

-- Decisão de cada chamada analisada, com o motivo (HU-18, KAN-71).
CREATE TABLE call_decisions (
  id          BIGSERIAL PRIMARY KEY,
  device_id   UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  e164        TEXT,
  raw_number  TEXT NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('baixo', 'moderado', 'suspeito', 'alto')),
  action      TEXT NOT NULL CHECK (action IN ('permitir', 'silenciar', 'bloquear')),
  reason      TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  latency_ms  INTEGER,
  feedback    TEXT CHECK (feedback IN ('golpe', 'telemarketing', 'legitima')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX call_decisions_device_idx ON call_decisions (device_id, received_at DESC);

-- Base de números oficiais de bancos (HU-07, KAN-88).
CREATE TABLE official_numbers (
  e164        TEXT PRIMARY KEY,
  institution TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Configuração do motor de regras (pesos ajustáveis sem nova versão do app).
CREATE TABLE engine_config (
  id          INTEGER PRIMARY KEY CHECK (id = 1),
  config      JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Canal de contestação do titular do número (LGPD, mecanismo de oposição).
CREATE TABLE contestations (
  id          BIGSERIAL PRIMARY KEY,
  e164        TEXT NOT NULL,
  contact     TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'aceita', 'recusada')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
