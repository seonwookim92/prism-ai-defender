import os
import json
import re
import httpx
from openai import OpenAI
from anthropic import Anthropic
from google import generativeai as genai
from mcp_dispatcher import dispatcher
from models import SystemConfig, SessionLocal
from sqlalchemy.future import select

from config_svc import config_svc

async def builder_reasoning(user_input: str, provider: str = None, model: str = None, mode: str = "ops", chat_history: list = None):
    config = await config_svc.get_config()
    if not config:
        yield "System not onboarded"
        return

    active_provider = provider or config.llm_provider
    llm_configs = json.loads(config.llm_configs)
    
    provider_config = llm_configs.get(active_provider, {})
    api_key = provider_config.get("apiKey")
    active_model = model or provider_config.get("model")

    if not api_key and active_provider != "ollama":
        yield f"API Key for {active_provider} not found."
        return

    assets_data = ""
    try:
        assets_list = json.loads(config.assets) if config.assets else []
        if assets_list:
            assets_data = "REGISTERED SSH ASSETS:\n" + "\n".join([
                    f"- Name: {a.get('name')}, IP: {a.get('ip')}, OS: {a.get('os', 'linux').upper()}"
                    for a in assets_list
                ])
    except:
        pass

    tools_description = "사용 가능한 MCP 도구 목록 (provider별 그룹화):\n"
    # deploy_monitoring_task is only meaningful in builder modes (schedules recurring background jobs,
    # returns no usable output in ops/audit contexts).
    _builder_modes = ("builder", "builder_threshold", "builder_action", "builder_tool_selection")
    try:
        import asyncio as _asyncio
        tools_list = await _asyncio.wait_for(dispatcher.list_tools(), timeout=5.0)
        providers: dict = {}
        for t in tools_list:
            if t.get("name") == "deploy_monitoring_task" and mode not in _builder_modes:
                continue
            p = t.get("provider", "Wazuh")
            providers.setdefault(p, []).append(t)
        for p, ptools in providers.items():
            tools_description += f"\n### {p}\n"
            for t in ptools:
                name = t.get("name")
                desc = t.get("description")
                input_schema = t.get("inputSchema", {})
                props = input_schema.get("properties", {})
                required = input_schema.get("required", [])
                
                args_parts = []
                for prop_name, prop_info in props.items():
                    p_type = prop_info.get("type", "any")
                    p_desc = prop_info.get("description", "")
                    p_req = " (REQUIRED)" if prop_name in required else ""
                    p_ex = f", example: {prop_info.get('examples')}" if prop_info.get('examples') else ""
                    args_parts.append(f"  - {prop_name} ({p_type}){p_req}: {p_desc}{p_ex}")
                
                args_str = "\n".join(args_parts) if args_parts else "  (No arguments)"
                tools_description += f"- **{name}**: {desc}\n{args_str}\n"
    except Exception as e:
        tools_description += """
### SSH Exec
- execute_host_command(target, command): SSH로 대상 호스트에 셸 명령을 직접 실행.
  - target: 대상 호스트 IP 또는 이름
  - command: 실행할 쉘 명령어 (예: 'ls -la')

### Web Search
- search_web(query): 인터넷에서 최신 보안 정보를 검색
  - query: 검색어

### Wazuh
- get_wazuh_alerts(limit, level, agent_id...): Wazuh 보안 경고 조회
- get_wazuh_agents(status): 보안 에이전트 목록 조회
"""

    # ── Mode-specific system prompts ─────────────────────────────────────────
    if mode == "builder":
        system_prompt = f"""당신은 Prism Builder입니다. MCP(Model Context Protocol) 기반 자동 모니터링 로직을 설계하는 전문가입니다.

## 사용 가능한 MCP 도구
{tools_description}

## 역할
사용자가 원하는 보안 모니터링 시나리오를 4단계로 설계합니다:
1. **수집(Monitor)**: 어떤 MCP 도구로 데이터를 수집할지
2. **파싱(Parser)**: Raw Output에서 어떤 변수를 추출할지 (선택적)
3. **임계치(Threshold)**: 어떤 조건이 위험인지
4. **조치(Action)**: 위험 감지 시 자동으로 수행할 작업 (선택적)

## 절대 규칙
- **target, targets, agent_id, host 등 대상을 특정하는 인자는 절대 사용하지 마십시오.** 모니터링 대상은 UI에서 선택하며 자동으로 주입됩니다.
- **수집 방법 옵션을 먼저 제시하십시오.** 사용자가 옵션을 선택하기 전에는 ```monitor 블록을 출력하지 마십시오.
- SSH 직접 실행(`execute_host_command`)이 해당 목적에 쓸 수 있다면 반드시 옵션으로 포함하십시오.
- **SSH 명령(`command` 값)에서 대상 IP/호스트가 필요한 경우 반드시 `{{target}}` 플레이스홀더를 사용하십시오.** 실행 시 자동으로 선택된 자산 IP로 치환됩니다. (예: `"ping -c 4 {{target}}"`, `"ssh {{target}} uptime"`)
- 모든 설명은 한국어로 하십시오.

## JSON 출력 형식 (UI 자동 반영)
각 단계가 결정되면 **반드시** 아래 코드블록 형식으로 출력하십시오. UI가 자동으로 감지하여 Blueprint에 반영합니다.

### 수집 설계:
```monitor
{{
  "tool_name": "도구명",
  "args": {{ "arg1": "value1" }}
}}
```

### 파싱 설계 (선택, Raw Output에서 변수 추출):
파서는 Raw Output(주로 stdout 문자열)에서 숫자/텍스트 변수를 추출합니다.
- JSONPath 형식: `"$.key.subkey"` (JSON 응답용)
- 정규식 형식: `"regex(\\"패턴\\", 그룹번호)"` (텍스트 응답용)
- **정규식 제약 사항**: `(?m)` 이나 복잡한 Lookaround를 사용하지 마십시오.
```parser
{{
  "cpu_usage": "$.cpu_percent",
  "packet_loss": "regex(\\"(\\\\d+)% packet loss\\", 1)",
  "rtt_avg": "regex(\\"rtt min/avg/max/mdev = [0-9.]+/([0-9.]+)/\\", 1)"
}}
```

### 임계치 설정:
**변수 비교형 (파서 변수 사용 시 권장, 자동 평가 가능):**
```threshold
{{
  "mode": "variable",
  "rules": [
    {{ "var": "packet_loss", "op": ">", "value": 20, "level": "red" }},
    {{ "var": "packet_loss", "op": ">", "value": 0, "level": "amber" }},
    {{ "var": "rtt_avg", "op": ">=", "value": 200, "level": "red" }}
  ]
}}
```
op 허용값: `>`, `>=`, `<`, `<=`, `==`

**텍스트 포함 여부 (구조화 출력 또는 Raw에서 키워드 탐지):**
```threshold
{{
  "mode": "contains",
  "contains": ["error", "critical"],
  "not_contains": ["OK", "success"],
  "match_level": "red"
}}
```

**AI 판단형 (자동 평가 불가 → 항상 amber 처리됨, 사용 자제):**
```threshold
{{
  "mode": "ai",
  "criteria": "자연어로 위험 조건 설명"
}}
```

### 액션 설정 (선택):
```action
{{
  "action_tool_name": "도구명",
  "action_tool_args": {{ "command": "kill -9 {{pid}}" }}
}}
```
(파싱 단계에서 정의한 변수를 `{{변수명}}` 형태로 사용 가능)

## 대화 흐름
1. **[옵션 제시]** 사용자 의도를 파악하면, 즉시 JSON을 출력하지 말고 먼저 **적용 가능한 수집 방법 옵션 2~4개를 아래 형식으로 제시**하십시오:
   - **옵션 A: [방법명]** `[tool_name]`
     특징: (간단 설명)
     예시: `(명령어 또는 인자 예시)`
   - 각 옵션은 provider(SSH Exec, Wazuh 등)와 tool_name을 명시하십시오.
   - SSH 직접 실행이 가능하면 반드시 포함하십시오.
   - 마지막에 "어떤 방법으로 수집할까요?"라고 물으십시오.

2. **[수집 설계]** 사용자가 옵션을 선택하면 즉시 ```monitor 블록을 출력하십시오.

3. **[파싱/임계치]** 사용자가 테스트 실행 결과를 공유하면, 파싱이 필요한지 판단하고 임계치를 제안하십시오.

4. **[임계치 확정]** 임계치를 확정하고 ```threshold 블록을 출력하십시오.

5. **[액션]** 액션이 필요한지 물어보고 ```action 블록을 출력하십시오.

6. 모든 단계 완료 후: "설계가 완료되었습니다. 오른쪽 **Save as Monitoring Job** 버튼으로 저장하세요."라고 안내하십시오."""

    elif mode == "builder_selection":
        system_prompt = f"""당신은 모니터링 작업 JSON 설계 전문 어시스턴트입니다.
당신의 목적은 사용자와 대화하여 아래 형식의 **MCP Tool JSON**을 완성하는 것입니다.

🎯 작업 프로세스 (반드시 준수):
1. **니즈 파악 (NEED_ANALYSIS)**: 사용자가 무엇을 하고 싶은지 파악합니다. 첫 질문 이후 사용자가 의도를 밝히면 즉시 다음 단계로 넘어가십시오.
2. **도구 선정 (TOOL_SELECTION)**: 파악된 니즈에 가장 적합한 도구를 **당신이 직접 제안**하십시오. 파일 시스템 직접 조작(파일 개수, 내용, 프로세스 등)은 Wazuh보다 `execute_host_command`를 우선 고려하십시오. 이 단계에서 인자(args)를 확정합니다.
3. **JSON 작성 (JSON_GENERATION)**: 확정된 도구와 인자를 바탕으로 최종 JSON을 생성합니다.

🎯 목표 JSON 형식:
```json
{{
  "tool_name": "<tool_name>",
  "args": {{ "<arg>": "<value>" }}
}}
```

⚠️ 엄격한 규칙 (위반 시 실패):
1. **대상 지정 금지**: `target`, `targets`, `agent_id`, `host` 등 대상을 특정하는 인자는 **사용자에게 묻지 말고 JSON에서도 제외**하십시오. UI의 체크박스에서 처리됩니다.
2. **결단력**: 사용자가 대략적인 의도만 말해도 가능한 도구를 바로 제안하십시오. 질문을 2번 이상 반복하지 말고 바로 `TOOL_SELECTION` 단계로 진입하십시오.
3. **SSH Exec 활용**: 서버 내의 구체적인 파일 체크, 프로세스 개수 확인 등은 `execute_host_command`를 사용하여 쉘 명령어로 처리하는 것이 훨씬 정확합니다. (예: `ls /path | wc -l`)
4. **단계 태그 필수**: 모든 응답의 마지막 줄에 `[STEP: 단계명]`을 출력하십시오.
    - 첫 응답만 `[STEP: NEED_ANALYSIS]`입니다.
    - 사용자가 의도를 답하면 그 응답부터는 `[STEP: TOOL_SELECTION]`입니다.
    - JSON을 출력할 때는 `[STEP: JSON_GENERATION]`입니다.

사용 가능한 도구:
{tools_description}

행동 규칙:
1. 한국어로 답변하십시오.
2. "잡설" 없이 목적 지향적으로 대화하십시오.
3. 사용자가 "파일 개수"를 물으면 `execute_host_command`로 `ls -A /path | wc -l` 같은 명령어를 제안하고 즉시 `TOOL_SELECTION` 단계로 가십시오."""

    elif mode == "builder_threshold":
        system_prompt = f"""당신은 모니터링 임계치(Threshold) 설계 전문 어시스턴트입니다.
사용자가 선택한 도구의 실행 결과(Result)를 보고, 어떤 상태가 '위험(Red)'인지 결정하는 JSON을 만듭니다.

🎯 임계치 형식:
1. structured: {{"mode": "structured", "red": "CPU > 90%", "amber": "CPU > 70%", "green": "정상"}}
2. contains: {{"mode": "contains", "contains": ["error", "failure"], "match_level": "red"}}
3. ai: {{"mode": "ai", "criteria": "결과에 root가 아닌 계정의 접근이 있으면 Red"}}

행동 규칙:
1. 어떤 유형이 적합할지 제안하고 기준을 논의하십시오.
2. JSON이 완성되면 다음 단계인 'Action 설정' (문제가 생겼을 때의 자동 조치)으로 가라고 안내하십시오."""

    elif mode == "builder_action":
        system_prompt = f"""당신은 모니터링 경보 발생 시 실행할 **자동 조치(Action) JSON** 설계 전문가입니다.
임계치가 Red(위험)에 도달했을 때 실행할 MCP 도구를 정의합니다.

🎯 조치 JSON 예시:
```json
{{
  "action_tool_name": "execute_host_command",
  "action_tool_args": "{{\\"command\\": \\"pkill -9 {{pid}}\\", \\"target\\": \\"{{target}}\\"}}"
}}
```

💡 중요 (변수 템플릿):
- 이전 도구의 실행 결과값(예: PID, 프로세스 이름 등)을 `{{key}}` 형태로 사용할 수 있습니다.
- 예를 들어 `ps` 결과의 `pid`를 쓰고 싶다면 `{{pid}}`라고 작성하도록 안내하십시오.

행동 규칙:
1. 사용자에게 "위험 상황 발생 시 어떤 조치를 취할까요?"라고 물으십시오.
2. 조치가 필요 없으면 건너뛰어도 된다고 하십시오.
3. 조치 JSON 작성 시 변수 템플릿 사용법을 설명해 주십시오."""

    elif mode == "audit_read":
        asset_line = ""
        if assets_data:
            asset_line = f"\n{assets_data}\n"
        system_prompt = f"""당신은 전문 보안 감사관입니다. 대상 서버에 SSH로 접속하여 지정된 파일을 읽고 보안 분석을 수행합니다.
{asset_line}
절차:
1. execute_host_command 도구를 사용하여 지정된 파일 경로를 `cat <경로>`로 읽으세요.
2. 파일 내용을 바탕으로 보안 의심 항목을 분석하세요.
3. 마지막에 반드시 아래 형식의 JSON 배열만 출력하세요 (마크다운 코드블록 없이 순수 JSON만):
[
  {{
    "id": "1",
    "title": "항목 제목",
    "severity": "critical|high|medium|low",
    "category": "Backdoor|Rootkit|Misconfiguration|Suspicious Process|Suspicious Network|Persistence|Credential|SUID/SGID|Kernel|Other",
    "analysis": "핵심 분석 결과 요약 (AI Findings, 한국어)",
    "description": "세부 설명 (한국어)",
    "evidence": "파일에서 발견된 직접적인 근거 텍스트"
  }}
]

파일 읽기 실패 또는 의심 항목 없음 → 빈 배열 [] 반환."""

    elif mode == "audit_analysis":
        system_prompt = """당신은 전문 보안 감사관입니다. 제공된 보안 스캔 출력(또는 그 일부 청크)을 분석하여 의심스러운 항목을 추출합니다.

중요 규칙:
- 제공된 텍스트에 실제로 존재하는 내용만 보고하세요. 텍스트에 없는 항목은 추가하지 마세요.
- **분석 내용(analysis) 필드를 반드시 구체적으로 작성하세요.** 단순히 '분석 필요'가 아니라, 무엇이 왜 의심스러운지 핵심 이유를 기술하세요.
- 대용량 파일의 일부 청크일 수 있으므로, 해당 청크에서 발견된 항목만 출력하세요.

반드시 다른 텍스트 없이 JSON 배열만 출력하세요:
[
  {
    "title": "항목 제목",
    "severity": "critical|high|medium|low",
    "category": "Backdoor|Rootkit|Misconfiguration|Suspicious Process|Suspicious Network|Persistence|Credential|SUID/SGID|Kernel|Other",
    "analysis": "핵심 분석 및 왜 이것이 위협인지 설명 (한국어)",
    "description": "세부적인 맥락 및 설명 (한국어)",
    "evidence": "스캔 출력에서 발견된 직접적인 근거 텍스트 (명령어 출력, 로그 라인 등)"
  }
]
의심 항목이 없는 청크라면 반드시 빈 배열 []을 반환하세요."""

    elif mode == "audit_verify":
        asset_line = ""
        if assets_data:
            asset_line = f"\n{assets_data}\n"
        system_prompt = f"""당신은 보안 포렌식 및 모의해킹 전문가입니다. 대상 호스트에 SSH로 직접 접속하여 보안 취약점 및 설정 미비점을 실시간 검증합니다.
{asset_line}
## 사용 가능한 도구
{tools_description}

전달되는 각 항목에는 제목, 분석 내용, 세부 설명, 발견 근거가 포함되어 있습니다.

## 도구 호출 형식 (반드시 준수)
도구를 실행해야 할 때는 다른 텍스트 없이 아래 JSON 형식만 단독으로 출력하세요:

SSH 명령 실행:
```json
{{
  "response": "이 명령을 실행하는 이유를 한 줄로 설명",
  "tool": "execute_host_command",
  "args": {{"target": "<자산명_또는_IP>", "command": "<실행할_명령>"}}
}}
```

웹 검색 (CVE/버전 확인 등):
```json
{{
  "response": "검색 이유",
  "tool": "search_web",
  "args": {{"query": "<검색어>"}}
}}
```

## 검증 절차
1. 전달된 분석 내용을 바탕으로 취약점 실존 여부를 확인할 SSH 명령어를 결정.
2. 위 도구 호출 형식으로 한 번에 하나씩 실행 — 실행 결과를 받은 후 다음 명령을 결정.
3. CVE 상세나 버전 취약성 확인이 필요하면 search_web 도구를 사용.
4. 충분한 증거가 확보되면 **마크다운 형식**(`##` 헤더, `**강조**`, `- 목록` 등)으로 결론을 작성하고 마지막 줄에 다음 태그 중 하나를 단독으로 출력:
   [AUDIT_RESULT:confirmed] — 실제 보안 위협/취약점으로 확인됨 (증거 제시 필수)
   [AUDIT_RESULT:clear]     — 오탐 또는 이미 패치/조치되어 정상임이 확인됨
   [AUDIT_RESULT:needs_review] — 불확실하거나 수동 검토가 반드시 필요함

## 규칙
- 반드시 직접 검증 후 결론을 내리십시오. 추측은 절대 금물입니다.
- 항목당 최대 10회까지 도구를 실행할 수 있습니다.
- 답변은 한국어로 작성하며, 핵심 증거 위주로 간결하게 보고하세요.
- [AUDIT_RESULT:...] 태그는 반드시 응답의 마지막 줄에 단독으로 위치해야 합니다."""

    else:
        # ops or default
        system_prompt = f"""You are Prism, a professional security AI assistant.
    Current Mode: {mode}

    {assets_data}

OS-AWARE COMMAND RULES (CRITICAL):
When generating execute_host_command calls, always match the command to the target asset's OS:
- LINUX assets (OS: LINUX):
    Network:  ip addr / ifconfig / ss -tulpn / netstat -an
    Process:  ps aux / top / systemctl status <svc>
    Files:    cat / grep / find / ls / tail -f
    Users:    id / who / last / w
    System:   uname -a / df -h / free -m / uptime
- WINDOWS assets (OS: WINDOWS):
    Network:  ipconfig /all / netstat -an / Get-NetIPAddress
    Process:  Get-Process / tasklist / Get-Service
    Files:    type / dir / Get-Content / Select-String
    Users:    whoami / net user / Get-LocalUser / net localgroup
    System:   systeminfo / Get-ComputerInfo / wmic os get
  For Windows SSH, prefer PowerShell: powershell -Command "<cmdlet>"
  Use cmd.exe syntax only when explicitly needed.
- NEVER mix OS commands (no ip addr on Windows, no ipconfig on Linux).

    {tools_description}

    GUIDANCE:
    - Respond in KOREAN (한국어).
    - **핵심 정보만 간결하게 답변하십시오.** 불필요한 설명을 생략하고 전문가답게 결론부터 말씀하십시오.
    - 질문이나 명령에 대해 MCP 도구 호출이 필요하면 즉시 JSON 형식으로 호출하십시오.
    - **Self-Correction (CRITICAL)**: 도구 호출이 실패(Validation Error, Syntax Error 등)한 경우, 에러 메시지를 정밀하게 분석하여 **즉시 수정된 파라미터로 다시 호출(Tool Call)하십시오.** 단순히 실패했다고 보고하고 멈추는 것은 금지됩니다. (최대 3회까지 재시도 권장)
    - **Type Integrity**: 도구의 인자 값으로 리스트(배열, `[]`)를 사용할 때는 스키마에 `type: array`라고 명시된 경우에만 사용하십시오. `type: string`인 필드에 리스트를 전달하지 않도록 각별히 주의하십시오 (예: `sort` 파라미터는 반드시 문자열이어야 함).
    - **Thought Process**: Start your response with `[THOUGHT]` ... `[/THOUGHT]`.
    - **File Analysis**: 사용자가 `[FILE_UPLOAD: <filename>]` 형식으로 데이터나 로그 파일을 제공하면, 해당 파일의 내용을 정밀하게 분석하여 보안 관련 통찰을 제공하십시오.
    - If the user asks to run a command on an SSH asset, respond with:
    ```json
    {{
      "response": "명령 실행 설명",
      "tool": "execute_host_command",
      "args": {{"target": "<ip_or_name>", "command": "<command>"}}
    }}
    ```
"""

    print(f"Agentic Reasoning starting: provider={active_provider}, model={active_model}, mode={mode}")

    # Initialize message history with system prompt
    messages = [{"role": "system", "content": system_prompt}]

    # Inject conversation history for context continuity (All modes)
    if chat_history:
        for msg in chat_history[:-1]:  # Exclude last message (current user_input)
            role = msg.get("role")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": user_input})

    async def call_llm_stream(current_messages):
        if active_provider == "openai":
            client = OpenAI(api_key=api_key)
            response = client.chat.completions.create(
                model=active_model or "gpt-5-mini",
                messages=current_messages,
                stream=True
            )
            for chunk in response:
                if chunk.choices[0].delta.content:
                    yield chunk.choices[0].delta.content

        elif active_provider == "anthropic":
            from anthropic import Anthropic as AnthropicClient
            client = AnthropicClient(api_key=api_key)
            system_msg = next((m["content"] for m in current_messages if m["role"] == "system"), None)
            chat_messages = [m for m in current_messages if m["role"] != "system"]
            kwargs = {
                "model": active_model or "claude-sonnet-4-6",
                "max_tokens": 8096,
                "messages": chat_messages,
            }
            if system_msg:
                kwargs["system"] = system_msg
            with client.messages.stream(**kwargs) as stream:
                for text_chunk in stream.text_stream:
                    yield text_chunk

        elif active_provider == "google":
            genai.configure(api_key=api_key)
            system_msg = next((m["content"] for m in current_messages if m["role"] == "system"), None)
            non_system = [m for m in current_messages if m["role"] != "system"]
            model_kwargs = {"model_name": active_model or "gemini-2.5-flash"}
            if system_msg:
                model_kwargs["system_instruction"] = system_msg
            model = genai.GenerativeModel(**model_kwargs)
            # Build history (all messages except the last one)
            history = []
            for msg in non_system[:-1]:
                role = "user" if msg["role"] == "user" else "model"
                history.append({"role": role, "parts": [msg["content"]]})
            last_content = non_system[-1]["content"] if non_system else ""
            chat = model.start_chat(history=history)
            response = chat.send_message(last_content, stream=True)
            for chunk in response:
                try:
                    if chunk.text:
                        yield chunk.text
                except Exception:
                    pass

        elif active_provider == "ollama":
            ollama_url = provider_config.get("endpoint") or os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
            full_prompt = ""
            for msg in current_messages:
                full_prompt += f"{msg['role'].upper()}: {msg['content']}\n"
            full_prompt += "ASSISTANT: "
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{ollama_url}/api/generate",
                    json={"model": active_model or "qwen3-coder-next:q8_0", "prompt": full_prompt, "stream": True},
                    timeout=120.0
                )
                async for line in response.aiter_lines():
                    if line:
                        data = json.loads(line)
                        yield data.get("response", "")

        else:
            yield f"Unsupported provider: {active_provider}"

    max_steps = 20 if mode in ("audit_verify", "audit_read") else 10
    step_count = 0

    try:
        while step_count < max_steps:
            step_count += 1
            full_content = ""
            
            # 1. Get LLM response
            # audit_verify: buffer first — suppress raw tool-call JSON from streaming to frontend
            if mode == "audit_verify":
                async for chunk in call_llm_stream(messages):
                    full_content += chunk
            else:
                async for chunk in call_llm_stream(messages):
                    full_content += chunk
                    yield chunk

            # Add assistant's thought to history
            messages.append({"role": "assistant", "content": full_content})

            # 2. Extract Tool Call
            def extract_top_json(text: str):
                depth = 0
                start = None
                for i, ch in enumerate(text):
                    if ch == '{':
                        if depth == 0: start = i
                        depth += 1
                    elif ch == '}':
                        depth -= 1
                        if depth == 0 and start is not None:
                            return text[start:i+1]
                return None

            cleaned = full_content
            if "```json" in cleaned:
                cleaned = cleaned.split("```json")[1].split("```")[0].strip()
            elif "```" in cleaned:
                cleaned = cleaned.split("```")[1].split("```")[0].strip()

            top_json_str = extract_top_json(cleaned)
            data = {}
            if top_json_str:
                try: data = json.loads(top_json_str)
                except: pass

            tool_name = data.get("tool") or data.get("tool_name")
            tool_args  = data.get("args") or {}

            # For audit_verify: emit [SYSTEM] status for tool calls, or yield final analysis as-is
            if mode == "audit_verify":
                if tool_name:
                    response_desc = data.get("response", "")
                    if response_desc:
                        yield f"[SYSTEM] ▶ {response_desc}\n"
                else:
                    yield full_content

            # 3. Decision: Should we execute a tool?
            # Builder/audit_analysis mode — design-only, never execute tools
            if not tool_name or mode in ("builder", "audit_analysis", "builder_action"):
                break

            # Execute tool (audit_verify already shows [SYSTEM] ▶ response_desc, skip redundant status line)
            if mode != "audit_verify":
                yield f"\n\n[SYSTEM] 도구 실행 중: {tool_name}...\n"
            
            try:
                execution_result_data = None
                if tool_name == "execute_host_command":
                    if not tool_args.get("target") and data.get("target"):
                        tool_args["target"] = data["target"]
                    if not tool_args.get("command") and data.get("command"):
                        tool_args["command"] = data["command"]
                    
                    res = await dispatcher.execute("execute_host_command", tool_args)
                    execution_result_data = {"tool": tool_name, "args": tool_args, "result": res}
                    execution_result = f"Command execution result: {json.dumps(res, ensure_ascii=False)}"

                else:
                    # Generic Wazuh/Falcon MCP Tools
                    res = await dispatcher.execute(tool_name, tool_args)
                    execution_result_data = {"tool": tool_name, "args": tool_args, "result": res}
                    execution_result = json.dumps(res, ensure_ascii=False)

                # Output standard MCP_TOOL_CALL block for frontend
                mcp_payload = json.dumps(execution_result_data, ensure_ascii=False)
                yield f"\n[MCP_TOOL_CALL]{mcp_payload}[/MCP_TOOL_CALL]\n"

                # 4. Feed result back to the LLM for the NEXT step
                if mode == "audit_read":
                    feedback = f"TOOL RESULT ({tool_name}): {execution_result}\n\n이제 파일 내용을 바탕으로 보안 의심 항목을 JSON 배열 형식으로만 반환하세요. 마크다운 없이 순수 JSON만 출력:"
                elif mode == "audit_verify":
                    feedback = f"TOOL RESULT ({tool_name}): {execution_result}\n\n결과를 분석하세요. 추가 검증이 필요하면 다음 도구를 호출하고, 충분한 증거가 확보됐다면 한국어로 결론을 작성하고 마지막 줄에 [AUDIT_RESULT:...] 태그를 출력하세요."
                else:
                    feedback = f"TOOL RESULT ({tool_name}): {execution_result}\n\n결과를 바탕으로 핵심 요지만 간결하게 분석해서 보고해줘. 추가적인 제언이나 권고사항은 생략해."
                messages.append({
                    "role": "user",
                    "content": feedback
                })
                # We don't need a redundant [SYSTEM] yield here as the tool call block is visible

            except Exception as tool_err:
                error_msg = f"Tool execution error: {str(tool_err)}"
                # Encourage self-correction by adding a prompt suffix to the error message
                feedback_to_ai = error_msg + "\n\nCRITICAL: Analyze the validation/syntax error above and immediately attempt to fix it by calling the tool again with corrected parameters. Do NOT just report the error to the user."
                messages.append({"role": "user", "content": feedback_to_ai})
                yield f"\n[SYSTEM] 오류 발생: {error_msg}. AI가 수정을 시도합니다...\n"

        if step_count >= max_steps:
            yield "\n[SYSTEM] 최대 도구 실행 단계(10회)에 도달하여 작업을 중단합니다.\n"

    except Exception as e:
        import traceback
        traceback.print_exc()
        yield f"\nReasoning Error: {str(e)}"
