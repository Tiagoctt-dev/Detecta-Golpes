# Detecta Golpes (Call Safe): requisitos consolidados

Fonte: Jira (projetos `MVP` e `KAN`) e Confluence (espaço `DG`), lidos em 17/11/2026.

## Produto
App **Android** (mínimo Android 10 / API 29) que, **antes do primeiro toque**, analisa chamadas de números
**fora da agenda**, classifica o risco e explica o motivo em linguagem simples. A classificação é **coletiva**:
denúncias de vários usuários distintos valem para todos.

## Stack já definida no backlog (KAN)
- Android: `CallScreeningService` nativo (Kotlin) + ponte nativa → **React Native** para a UI (KAN-45/46)
- API + **PostgreSQL** em **Docker**, pipeline de **CI**, ambiente de homologação com deploy automático (KAN-41/42/49)
- Rate limiting no endpoint público de consulta (KAN-80)
- Autenticação anônima por token de dispositivo (KAN-56)

## Regras inegociáveis (Confluence: decisões e critérios de aceite)
- D-11 / CA-11: a agenda de contatos **nunca** sai do aparelho
- CA-02: contato salvo nunca é interceptado
- D-12 / CA-04: motor de decisão por **regras, no aparelho, offline** (base local sincronizada)
- CA-03: decisão em até **500 ms p95**
- D-10 / CA-07: nenhum bloqueio silencioso: histórico + notificação + botão de desfazer/liberar
- CA-06: alerta sempre com frase simples (≤ 60 caracteres), **sem exibir a pontuação**
- D-06: a decisão final é do usuário
- D-08: sem áudio nem IA (restrição de plataforma)
- CA-08 / D-13: card de feedback pós-chamada (golpe / telemarketing / legítima) em 1 toque
- CA-09: denúncia passa a valer para outros usuários em até 15 min
- CA-10: denúncias acima do limite diário são gravadas mas não pesam no score público
- 0303 = telemarketing, não golpe

## Níveis de risco (Confluence, D-09: 4 níveis)
| Nível | Cor | Quando | Ação |
|---|---|---|---|
| Baixo | verde | permitido / origem autenticada | toca |
| Moderado | amarelo | desconhecido sem histórico | toca com aviso neutro |
| Suspeito | laranja | 0303, poucas denúncias, padrão estranho | silencioso + motivo |
| Alto | vermelho | ≥ 30 denúncias em 7 dias (CA-05), falha de autenticação, lista de golpes | não toca + notificação com desfazer |

Sinais: denúncias na base (alto), volume/recência (alto), falha de autenticação de origem/STIR (alto),
prefixo 0303 (médio), faixa não alocada/DDD inexistente (médio), internacional inesperada (médio).
Score 0–100, pesos em arquivo de configuração.

## As 9 funcionalidades do MVP (Confluence)
1. Interceptação antes do toque 2. Normalização do número (E.164) 3. Base local offline
4. Motor de regras com score 5. Quatro níveis 6. Selo com o motivo 7. Card de feedback pós-chamada
8. Histórico com reclassificação 9. Sincronização diária + ao abrir o app

## Histórias de usuário (KAN)
| HU | Tema | Épico |
|---|---|---|
| HU-13 | Identificação do número + histórico de denúncias | KAN-21 |
| HU-15 | Classificação de risco por chamada | KAN-22 |
| HU-16 | Denunciar número (1 por dispositivo/número) | KAN-23 |
| HU-14 | Alerta de número denunciado pela comunidade | KAN-24 |
| HU-09 | Análise de risco e bloqueio de alto risco | KAN-25 |
| HU-17 | Listas pessoais (permitidos têm prioridade sobre o score) | KAN-26 |
| HU-18 | Histórico com motivo + "Não era golpe" | KAN-27 |
| HU-19 | Nível de proteção baixo/médio/alto | KAN-28 |
| HU-20 | Consulta manual de reputação | KAN-29 |
| HU-10 | Modo idoso: bloqueio por volume de denúncias | KAN-30 |
| HU-08 | Alerta para idoso com explicação simples + TTS | KAN-31 |
| HU-07 | Falso funcionário de banco (base de números oficiais) | KAN-32 |
| HU-01..06, 11, 12 | Modos de contexto: Estudante, Trabalho, B2B, Plantão, Motorista, Secretária virtual, Descanso, Aula | KAN-33..40 |

## Endpoints previstos (tarefas KAN)
- `GET /numeros/{numero}/historico` (KAN-44)
- `GET /niveis-risco` (KAN-51)
- `POST /dispositivos` registro + token anônimo (KAN-56)
- `POST /denuncias` (KAN-57)
- decisão da chamada permitir/alertar/bloquear (KAN-63)
- CRUD de listas (KAN-67)
- persistência de decisões + `GET /historico` paginado (KAN-71/72)
- preferências / nível de proteção (KAN-75)
- `GET /reputacao/{numero}` (KAN-78)
- explicações por tipo de golpe (KAN-85), números oficiais de bancos + job (KAN-88/89)
- motor de modos de contexto + agendamento (KAN-92..116)

## Divergências entre Jira e Confluence
- **Níveis:** Jira fala em 3 (baixo/médio/alto); Confluence decidiu 4 (D-09).
- **Modos e listas:** Jira inclui no MVP; Confluence coloca fora do MVP (onda 2+).
- **Secretária virtual (HU-06):** Jira prevê STT/transcrição (KAN-108/110); Confluence D-08 diz sem áudio nem IA,
  e o Android não libera o áudio da chamada para apps de terceiros.
- **Motorista (HU-05):** "corrida ativa" exige integração com Uber/99, que não existe; o backlog resolve com
  cadastro manual de passageiro temporário (KAN-105/106).

## Cronograma
Sprint 1: 15/10–28/10 · Sprint 2: 29/10–11/11 · Sprint 3: 12/11–25/11 · Sprint 4 (piloto com 30 usuários): 26/11–09/12.
