# 🛡️ Product Requirement Document: Aegis-Link

**Version:** 2.0 (Splunk-inspired Chat-to-Query Edition)
**Target Audience:** Locked Shields 'Live Fire' Linux Defense Team (Non-AI Experts)
**Core Value:** "Natural Language is the new SPL." (자연어가 새로운 쿼리 언어다)

---

## 1. 개요 (Executive Summary)

**Aegis-Link**는 개별 보안 요원의 PC(Docker)에서 구동되는 **AI 기반 로컬 보안 관제 플랫폼**이다.
복잡한 보안 장비(Wazuh, Firewall, Linux Server)의 쿼리 언어를 몰라도, **채팅(Builder)**을 통해 로그를 분석하고, 이를 **대시보드 위젯**으로 저장하거나 **자동화된 탐지 규칙(Batch Job)**으로 변환한다.
운영 단계에서는 LLM의 개입을 최소화(Token Free)하여, 미리 생성된 로직을 고속으로 수행한다.

---

## 2. 시스템 아키텍처 (System Architecture)

### 2.1 기술 스택 (Tech Stack)

* **App Framework:** Next.js 14+ (App Router), TypeScript.
* **UI Library:** Shadcn/ui (Radix UI), Tailwind CSS.
* **Dashboarding:** `react-grid-layout` (Splunk-style Layout), Recharts (Visualization).
* **Database:** SQLite (via Prisma ORM) - *Single File Local DB*.
* **AI Engine:** LangGraph (State Management), Vercel AI SDK.
* **Orchestration:** Node-cron (Scheduling), Docker Compose.
* **Integration (MCP):** Custom MCP Clients (Wazuh, SSH, CrowdStrike).

### 2.2 핵심 디자인 패턴: "Builder & Executor"

1. **Builder (The 'Search' App):** Splunk의 검색창 역할. 사용자의 자연어를 해석하여 **'실행 가능한 설정(JSON Config)'**을 생성.
2. **Executor (The Dashboard):** 저장된 JSON Config를 주기적으로 실행. LLM 추론 없이 API/SSH만 호출.

---

## 3. 핵심 기능 명세 (Core Features)

### 3.1 The Builder (AI-Powered Search & Config)

**"Splunk의 Search Bar를 채팅창으로 대체한 기능"**

* **UX Concept:**
* 화면 상단: **Chat Input** (예: "최근 10분간 5번 이상 로그인 실패한 IP 보여줘").
* 화면 중앙: **Preview Area** (차트/테이블 미리보기).
* 화면 하단: **Action Bar** ([대시보드에 추가], [배치 잡으로 저장], [CSV 내보내기]).


* **Process Flow:**
1. **Input:** 사용자 자연어 입력.
2. **Reasoning:** LLM이 Intent 파악 (Log Search vs Status Check) -> 적절한 MCP 도구 선정 -> 파라미터 생성.
3. **Preview:** 생성된 파라미터로 즉시 1회 실행 후 결과 시각화.
4. **Refinement:** 사용자가 "차트 색깔 빨간색으로 바꿔줘" 또는 "조건을 10번 이상으로 바꿔줘"라고 하면 JSON 수정.
5. **Save:** 사용자가 만족하면 **Widget** 또는 **Job** 형태로 DB에 저장.



### 3.2 Dynamic Dashboard (Splunk-style)

**"자유로운 배치와 리사이징이 가능한 개인화 관제 화면"**

* **Library:** `react-grid-layout`.
* **Modes:**
* **View Mode:** 위젯 고정. 데이터 자동 갱신(Polling). 클릭 시 상세 로그(Drill-down) 보기.
* **Edit Mode:** 우상단 `[Edit]` 토글 활성화 시 진입.
* **Drag:** 위젯 헤더를 잡아 위치 이동.
* **Resize:** 위젯 우측 하단을 잡아 크기 조절.
* **Config:** 위젯 우상단 메뉴 -> `[쿼리 수정]` (Builder로 이동), `[삭제]`.




* **Widget Types:**
* **Single Value:** 핵심 지표 (예: 차단된 IP 수).
* **Time Series Chart:** 라인/영역 차트 (트래픽 추이).
* **Distribution Chart:** 파이/바 차트 (공격 유형 분포).
* **Data Table:** 원본 로그 테이블.
* **Markdown Note:** 팀장 지시사항 등 메모 위젯.



### 3.3 Automation Manager (Batch Jobs)

**"Splunk의 'Saved Search' & 'Alert' 기능"**

* **Creation:** Builder에서 [배치 잡으로 저장] 버튼을 통해 생성.
* **Configuration:**
* **Schedule:** Cron 표현식 (예: `*/10 * * * *`).
* **Threshold:** "결과 개수가 0보다 크면 알람 발송".
* **Actions:** Discord Webhook, Telegram Bot 전송.


* **Monitoring UI:**
* 잡 리스트 및 상태(Healthy/Failing).
* 실행 이력(History) 및 실패 로그 확인.



### 3.4 Global Contextual Chat (Floating Assistant)

**"어디서든 즉시 호출 가능한 AI 오퍼레이터"**

* **UI:** 화면 우측 하단 둥근 버튼(FAB). 클릭 시 패널 확장.
* **Context Injection:** 현재 보고 있는 페이지의 데이터(위젯 값, 로그 등)를 프롬프트에 자동 포함.
* **Quick Actions:**
* "이 그래프 분석해줘" (현재 화면 차트 해석).
* "IP 1.2.3.4 차단해" (즉시 실행 - Active Mode).
* "방금 알람 뜬 거 뭐야?" (최근 Batch Job 로그 조회).



### 3.5 Settings & Onboarding

* **Initial Setup:**
* Role 선택 (Web Defense / AD Defense).
* Target Assets (IP List) 입력.
* MCP Connection (Wazuh URL, SSH Key Path).
* Notification Channels (Webhooks).


* **Control Mode:**
* **Advisor:** 모든 액션 승인 필요.
* **Active:** 조회(Read) 자동, 변경(Write) 승인.
* **Auto-Pilot:** 전체 자동 (경고 문구 포함).



---

## 4. 데이터 스키마 (Prisma Schema)

```prisma
// 1. 시스템 전역 설정
model SystemConfig {
  key         String @id // 'main'
  controlMode String // 'ADVISOR', 'ACTIVE', 'AUTO'
  assets      String // JSON: Target IPs
  
  // Credentials & Integrations
  llmProvider String // 'openai', 'anthropic', 'google'
  llmApiKey   String
  mcpConfig   String // JSON: { "wazuh": { "url":... }, "ssh": ... }
  discordUrl  String?
  telegramTk  String?
}

// 2. 대시보드 위젯 (Saved Queries for View)
model Widget {
  id          String   @id @default(uuid())
  title       String
  type        String   // 'METRIC', 'LINE_CHART', 'BAR_CHART', 'TABLE', 'NOTE'
  
  // Layout (RGL Spec)
  x           Int
  y           Int
  w           Int
  h           Int
  
  // The "Compiled" Logic
  toolName    String   // ex: 'wazuh_search'
  toolArgs    String   // JSON: { "query": "failed", "time": "now-1h" }
  
  refreshInt  Int      @default(60) // 초 단위
}

// 3. 자동화 작업 (Saved Queries for Alert)
model BatchJob {
  id          String   @id @default(uuid())
  name        String
  enabled     Boolean  @default(true)
  cron        String   // "*/5 * * * *"
  
  // Logic
  toolName    String
  toolArgs    String
  
  // Alert Condition
  alertType   String   // 'ALWAYS', 'IF_RESULT_EXISTS', 'IF_COUNT_GT'
  alertValue  Int      @default(0)
  channels    String   // JSON: ["DISCORD"]
  
  // Status
  lastRun     DateTime?
  lastStatus  String?  // 'SUCCESS', 'FAIL'
  lastResult  String?  // 요약 메시지
}

// 4. 작전 기록 (Incident Timeline) - 팀장 보고용
model Incident {
  id          String   @id @default(uuid())
  timestamp   DateTime @default(now())
  severity    String   // 'INFO', 'WARNING', 'CRITICAL'
  source      String   // 'BatchJob', 'UserAction'
  message     String
  details     String?  // JSON Log
}

```

---

## 5. MCP 도구 정의 (Tools Spec)

Builder가 사용할 수 있는 도구 목록입니다. (백엔드 구현 대상)

| Tool | Description | Input Params (JSON) |
| --- | --- | --- |
| `search_logs` | Wazuh/System 로그 검색 | `query`(str), `time_range`(str), `limit`(int) |
| `get_metrics` | 시스템 리소스(CPU/RAM) 조회 | `target_ip`(str) |
| `exec_command` | SSH 명령어 실행 (화이트리스트) | `target_ip`(str), `command`(str) |
| `network_block` | IP 차단 (Firewall) | `target_ip`(str), `direction`(in/out) |
| `incident_report` | 중요 사건 기록 | `severity`(str), `message`(str) |

---

## 6. 개발 로드맵 (Implementation Steps)

1. **Project Init:** Next.js + Shadcn/ui + Prisma Setup.
2. **MCP Layer:** `wazuh_client.ts`, `ssh_client.ts` 구현 및 테스트.
3. **The Builder (Brain):**
* LangChain을 이용해 "자연어 -> JSON(ToolArgs)" 변환 로직 구현.
* 채팅 UI 및 미리보기(Preview) 컴포넌트 개발.


4. **Dashboard (Body):**
* `react-grid-layout` 적용.
* DB에서 Widget 로드하여 렌더링하는 `WidgetRenderer` 개발.


5. **Automation (Pulse):**
* `node-cron` 연동.
* Discord Webhook 발송 로직 구현.


6. **Packaging:** Dockerfile 작성 및 배포 테스트.

---

### 🎨 UI/UX Design Reference

**Builder Page Layout:**

```
+---------------------------------------------------------------+
|  [ Chat Input: "Show me SSH failures on 10.0.1.5"       ]  |
+---------------------------------------------------------------+
|                                                               |
|   [ Visualization Preview ]        [ JSON Config View ]       |
|   ( Bar Chart showing 50           ( { "tool": "ssh",         |
|     failures in last hour )          "args": "..." } )        |
|                                                               |
+---------------------------------------------------------------+
|  [Add to Dashboard]   [Create Alert Job]   [Export CSV]       |
+---------------------------------------------------------------+

```

**Dashboard Layout:**

```
+--------------------------------------------------+ [Edit Mode]
| [ Widget 1: CPU ]   [ Widget 2: Login Attempts ] |
| (Resize Handle ↘)   (Resize Handle ↘)            |
|                                                  |
+---------------------+                            |
| [ Widget 3: Logs  ] |                            |
| [                 ] |                            |
+---------------------+----------------------------+

```