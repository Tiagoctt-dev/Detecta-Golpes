# Detecta Golpes

App Android que avisa, **antes do primeiro toque**, se uma ligação de número desconhecido pode ser golpe, e explica o motivo
em linguagem simples. A classificação é **coletiva**: a denúncia de uma pessoa protege todas as outras.

Os requisitos vêm do Jira (projetos `MVP` e `KAN`) e do Confluence (espaço `DG`); o resumo consolidado está em
[docs/REQUISITOS.md](docs/REQUISITOS.md).

## Estrutura

```
packages/risk-engine   Motor de regras em TypeScript (normalização, sinais, score, 4 níveis, motivo)
api/                   API Node.js (Fastify) + PostgreSQL
mobile/                App React Native; triagem nativa em Kotlin
  android/app/src/main/java/br/com/detectagolpes/
    screening/CallGuardService.kt   intercepta a chamada antes do toque
    engine/RiskEngine.kt            o mesmo motor, portado para Kotlin (roda offline)
    data/LocalStore.kt              base local SQLite (reputação, histórico, listas)
    sync/SyncWorker.kt              sincronização a cada 15 min (WorkManager)
    bridge/DetectaModule.kt         ponte para o React Native
```

**Por que o motor existe duas vezes?** O `CallScreeningService` precisa responder em menos de 500 ms com o app
fechado e sem internet, então não pode depender do JavaScript. Para os dois não divergirem, o motor TS gera
3.000+ vetores de teste (`npm run vectors -w @detecta/risk-engine`) e o teste JUnit `RiskEngineParityTest` exige
resultado idêntico no Kotlin. O CI falha se os vetores estiverem desatualizados.

## Rodando

Pré-requisitos: Node 22+, Docker, JDK 17 e Android SDK (API 36).

```bash
npm install
```

```bash
npm run build
```

```bash
docker compose up -d
```

Isso sobe o PostgreSQL (porta **5433** no host) e a API em `http://localhost:3000`. Para popular números oficiais de
bancos e a configuração do motor:

```bash
DATABASE_URL=postgres://detecta:detecta@localhost:5433/detecta npm run seed -w @detecta/api
```

App (com emulador aberto ou aparelho conectado):

```bash
cd mobile && npm install && npx react-native run-android
```

No emulador a API padrão é `http://10.0.2.2:3000`. Em aparelho real, troque em **Ajustes → Servidor** pelo IP do seu
computador na rede. Depois, escolha o Detecta Golpes como "app de identificação de chamadas e spam" quando o Android pedir.

> **Porta 8081 ocupada** (outro projeto React Native rodando)? Suba o Metro em outra porta e compile apontando para ela:
> `npx react-native start --port 8088` e `./gradlew :app:assembleDebug -PreactNativeDevServerPort=8088`.
>
> **Testar chamadas no emulador:** `adb emu gsm call 11912340001` simula uma ligação recebida;
> `adb logcat -s DetectaGolpes:I` mostra a decisão e o tempo de cada triagem.

> **Windows:** se o Gradle falhar com `Unable to establish loopback connection`, o caminho do TEMP está no formato
> curto (`TIAGO~1.SAN`). Use um TEMP simples antes de rodar: `set TEMP=C:\gtmp` e `set TMP=C:\gtmp`.

## Testes

```bash
npm test
```

Motor (31 testes) e API (19 testes, contra PostgreSQL real em `detecta_test`).

```bash
cd mobile && npx jest
```

```bash
cd mobile/android && ./gradlew :app:testDebugUnitTest
```

## API

| Método | Rota | Para quê |
|---|---|---|
| POST | `/dispositivos` | registro anônimo, devolve token |
| GET | `/sync?desde=` | diferenças da base + configuração do motor |
| GET | `/reputacao/:numero` | consulta manual (HU-20), com limite por dispositivo |
| GET | `/numeros/:numero/historico` | total e últimas denúncias (HU-13) |
| POST | `/denuncias` | denunciar (HU-16), 1 por dispositivo/número; acima do limite diário não pesa (CA-10) |
| POST | `/chamadas/analisar` | decisão online (HU-09) |
| POST | `/chamadas` | registra decisão tomada no aparelho (HU-18) |
| POST | `/chamadas/:id/feedback` | golpe / telemarketing / legítima (CA-08); legítima libera o número |
| GET | `/historico` | paginado, filtros `nivel` e `acao` |
| GET/PUT/DELETE | `/listas`, `/listas/:numero` | permitidos e bloqueados (HU-17) |
| GET/PUT | `/preferencias` | nível de proteção (HU-19) e modo idoso (HU-10) |
| GET | `/niveis-risco`, `/explicacoes`, `/config` | dados estáticos |
| POST | `/contestacoes` | titular contesta a classificação (LGPD) |

Todas, exceto `/dispositivos`, `/contestacoes`, `/health` e as estáticas, exigem `Authorization: Bearer <token>`.

## Escopo desta entrega

Feito: as 9 funcionalidades do MVP do Confluence, mais HU-07 (falso banco), HU-08 (explicação + voz), HU-09, HU-10
(modo idoso), HU-13 a HU-20.

Próxima leva: modos de contexto (HU-01 a HU-06, HU-11, HU-12: Estudante, Trabalho, B2B, Plantão, Motorista,
secretária virtual, Descanso, Aula). A secretária virtual não terá transcrição de áudio, porque o Android não libera
o áudio da chamada para apps de terceiros (decisão D-08).

Pendências que não são de código: questões Q-01 (listas públicas), Q-02 (teste de balanceamento LGPD), Q-03
(hospedagem), Q-05 (declaração de permissões na Google Play) e conferir os números oficiais de bancos em
`api/src/seed.ts` antes do piloto.
