# Prism AI Defender 🛡️

Prism AI Defender는 **보안 관제 및 위기 대응을 위한 AI 에이전트 플랫폼**입니다. 
Wazuh, CrowdStrike Falcon, Velociraptor와 같은 강력한 보안 도구들을 **Model Context Protocol (MCP)**로 통합하여, 복합적인 보안 쿼리 없이 **일상 언어(Natural Language)**만으로 인프라 전반의 위협을 식별하고 대응할 수 있는 지능형 관제 환경을 제공합니다.

기초적인 특정 OS 환경을 넘어, SSH가 가능한 모든 자산에 유연하게 대응하며 보안 운영자의 의사결정을 실시간으로 지원합니다.

---

## 🚀 시작하기 (Quick Start)

### 1. 프로젝트 클론
```bash
git clone https://github.com/seonwookim92/prism-ai-defender.git
cd prism-ai-defender
```

### 2. 환경 설정 파일 준비 ⚠️ (중요)
`.env`, `assets.json` 파일은 보안 및 설정의 편의를 위해 기본적으로 `.gitignore`에 포함되어 있습니다. 
**샘플 파일을 복사하여 실제 파일을 생성하지 않고 바로 실행하면 Docker가 파일 대신 디렉토리를 생성하여 오류가 발생할 수 있습니다.**

```bash
# 1. 환경 변수 설정
cp .env.sample .env
# .env 파일을 열어 API Key 및 각종 설정을 입력하세요. (필수)

# 2. 자산 정보 설정
cp assets.json.sample assets.json
```

### 3. Docker 실행
```bash
docker-compose up --build
```

---

## 🛠️ 트러블슈팅: "not a directory" 에러 발생 시
만약 `docker-compose up` 중에 `Are you trying to mount a directory onto a file?` 혹은 `not a directory` 에러가 발생한다면, 이미 Docker가 호스트에 파일이 없는 상태에서 동일한 이름의 **디렉토리**를 생성해 버린 것입니다.

**해결 방법:**
1. `docker-compose down` 명령으로 컨테이너를 중지합니다.
2. `rm -rf assets.json` 명령으로 호스트에 잘못 생성된 디렉토리를 삭제합니다.
3. 위의 **단계 2**를 수행하여 파일을 정상적으로 생성한 뒤 다시 실행하세요.

---

## 🏗️ 시스템 요구사항 (Prerequisites)

1.  **네트워크 연결 (VPN)**:
    - 등록할 자산(서버 등)들에 접근하려면 네트워크 통신이 가능해야 합니다. 필요시 **WireGuard VPN** 등을 사용하세요.
2.  **Docker & Docker Compose**: 시스템은 컨테이너 기반으로 동작합니다.
3.  **LLM API 키**:
    - OpenAI, Anthropic, Google Gemini 중 최소 하나의 API 키가 설정되어야 합니다. 로컬 LLM(Ollama)도 사용 가능합니다.

---

## 🚀 빠른 시작 (Quick Start)

### 1. 환경 설정 파일 준비
```bash
cp .env.sample .env
cp assets.json.sample assets.json
```

### 2. 설정값 입력 (`.env`)
최소한 LLM API 키 하나는 반드시 입력해야 합니다.
- `OPENAI_API_KEY`: GPT-4o 등을 사용하기 위해 필수.
- `LLM_PROVIDER`: 사용할 기본 모델 제조사 선택 (예: `openai`).
- `WAZUH_API_HOST`, `FALCON_CLIENT_ID` 등: 각 보안 엔진 연동 시 필요한 정보를 입력합니다.

### 3. 시스템 실행
```bash
docker-compose up --build
```
- 실행 후 브라우저에서 `http://localhost:3000`에 접속하세요.

### 4. 시스템 종료
- **프로세스만 종료**: `docker-compose stop`
- **컨테이너 삭제**: `docker-compose down`
- **데이터 완전 삭제 (DB 볼륨 포함)**: `docker-compose down -v`

---

## 🛠️ 주요 기능 가이드 (Feature Guide)

사이드바 메뉴 순서에 따른 기능 상세 안내입니다.

### 1. Dashboard (보안 현황판)
인프라 전체의 보안 건전성과 연동된 서비스의 상태를 한눈에 모니터링합니다.
- **Security Score**: 등록된 감시봇(Monitoring Task)들의 성공률을 실시간 점수화합니다.
- **Service Status**: Wazuh, Falcon, Velociraptor의 연결 상태를 표시합니다.
- **Live Alert Log**: 최근 발생한 크리티컬 경보들을 타임라인 형태로 노출합니다.

### 2. Ops Chat (보안 운영 챗)
보안 운영자의 개인 비서 역할을 합니다. 연동된 모든 보안 도구(MCP)를 사용해 실시간으로 상태를 조회하고 명령을 내릴 수 있습니다.
- "Wazuh에서 최근 1시간 동안 발생한 위험 알람 요약해줘."
- "falcon-host-01 서버의 현재 부하와 주요 프로세스 확인해줘."

### 3. Builder Chat (감시 정책 생성)
보안 감시에 필요한 도구와 조건을 대화만으로 설계합니다.
- "SSH 접속 실패 로그를 1분 주기로 감시하고, 결과가 Red일 때 알림을 줘."
- AI가 필요한 MCP 도구와 실행 인자를 자동으로 구성해 Monitoring 탭으로 등록해줍니다.

### 4. Monitoring (실시간 보안 모니터링)
Builder Chat을 통해 생성된 보안 체크 항목들을 관리하고 실행 결과를 확인합니다.
- 각 태스크의 성패 여부, 마지막 실행 시간, 상세 실행 로그를 확인할 수 있습니다.

### 5. No-Ansible (에이전트 없는 대응)
별도의 에이전트 설치 없이 AI가 SSH를 통해 스크립트를 작성하고 실행하여 자산의 상태를 변경하거나 긴급 패치를 수행합니다.
- "웹 서버의 보안 취약 패키지를 모두 업데이트해줘."
- "특정 포트를 사용하는 모든 프로세스를 강제 종료해줘."

### 6. Audit (보안 감사 및 실시간 검증)
포렌식 분석부터 실제 서버 검증까지 이어지는 지능형 분석 기능입니다.
- 로그 파일을 업로드하면 AI가 의심 항목을 추출합니다.
- 추출된 항목을 선택하면 **실제 대상 서버에 SSH로 접속**하여 해당 위협이 실재하는지 직접 확인합니다.

### 7. Terminal (통합 웹 터미널)
등록된 자산에 즉시 접속하여 명령어를 실행할 수 있는 HTML5 기반 터미널입니다.
- 별도의 SSH 클라이언트 없이 브라우저에서 서버를 선택하고 즉시 제어할 수 있습니다.

---

## 🧩 Model Context Protocol (MCP) 통합

Prism은 다양한 보안 엔진을 통합하기 위해 **MCP** 표준을 준수합니다.

- **Wazuh MCP**: 에이전트 상태, 취약점 로그, 인덱싱 데이터 조회.
- **Falcon MCP**: Detections, Incidents, Hosts 정보 수색.
- **Velociraptor MCP**: 원격 아티팩트 수집 및 VQL 쿼리 실행.
- **SSH Exec MCP**: SSH를 통한 원격 제어 및 파일 처리.

---

## 📁 프로젝트 구조

- `/src/app`: Next.js 프론트엔드 (Rich UI/UX, 대시보드)
- `/server`: FastAPI 백엔드 (AI 리즈닝 엔진 및 에이전트 로직)
- `/mcp`: 도구별 MCP 서버 소스 코드 (Wazuh, Falcon, Velociraptor)
- `docker-compose.yml`: 시스템 전체 오케스트레이션

---

## ⚠️ 주의 사항

- SSH 접속 대상 자산은 반드시 프로젝트 실행 환경에서 네트워크 접근이 가능해야 합니다.
- 자산 정보(`assets.json`)에 입력하는 계정은 명령어 실행 권한(sudo 등)이 필요할 수 있습니다.
- API 사용량: AI 에이전트가 복잡한 분석을 수행할 경우 토큰 소모량이 증가할 수 있습니다.
