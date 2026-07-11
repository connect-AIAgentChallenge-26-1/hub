# cmds-llm-wiki

> **LLM Wiki 볼트 템플릿** — Karpathy LLM Wiki pattern + 미래의 나에게 보내는 편지 + Codex-first agent harness.
>
> Obsidian 볼트이자 Codex 프로젝트. 외부 소스 (기사·논문·전사) 를 LLM 이 컴파일하여 복리로 성장하는 persistent wiki 로 축적합니다.

**🌐 Live Showcase**: **[llm-wiki.cmdspace.work](https://llm-wiki.cmdspace.work)** — 10 섹션 상세 페이지 (아키텍처 · 11 commands · 미래의 나에게 보내는 편지 · Quick Start)

**운영자**: [[김규태]] · 개인 LLM Wiki / 포트폴리오 Evidence Wiki로 커스터마이즈

---

## 무엇인가

- **Karpathy LLM Wiki pattern** 의 실행 가능한 시작 킷
  - Raw Sources (불변) → Wiki (LLM 관리) → Schema (규칙) 3-layer
  - Ingest · Query · Lint 3 operations
  - `index.md` + `log.md` 두 개 핵심 파일
- **미래의 나에게 보내는 편지** — `/ingest` 시 "왜 수집?" 목적 질문을 강제하여 파편 축적 방지
- **Codex-first harness**
  - `AGENTS.md` — Codex 가 자동으로 읽는 repo 규칙
  - `.agents/skills/` — Codex repo-scoped skills 10개 (`ingest`, `query`, `lint`, `status`, `verify`, `audit` 등)
  - `.codex/commands/` — 각 skill 이 읽는 상세 operation checklist 10개
  - `.codex/hooks/` — raw source verbatim 검증 + qmd auto-reindex hooks
  - `.claude/` + `CLAUDE.md` — Claude Code 호환용 legacy mirror
  - 18 Obsidian Web Clipper JSON 템플릿 (Article / YouTube / Substack / X / arXiv / Stibee 등)
  - 73개 Obsidian hotkey 바인딩 (`.obsidian/hotkeys.json`) — heading shortcuts, wikilink/callout 삽입, 사이드바 토글 등
- **선택적 mothership 볼트 연계** — 별도 PKM 볼트가 있다면 satellite 로 운영 가능

---

## 출처 및 참고

| 원천 | 링크 |
|---|---|
| **Andrej Karpathy — LLM Wiki Gist** | https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f |
| **Karpathy X thread** (2026-04-02) | https://x.com/karpathy/status/1... (본 레포 `10. Raw Sources/11. Articles/` 에 예시 포함) |
| **kepano (Steph Ango, Obsidian CEO)** — contamination mitigation | 에이전트 playground 와 personal vault 분리 개념 |
| **cmds-system-files** (mothership pattern 자매 레포) | https://github.com/johnfkoo951/cmds-system-files |

## 관련 레포

- **[cmds-system-files](https://github.com/johnfkoo951/cmds-system-files)** — CMDS mothership PKM 시스템 (100-900 카테고리 + Connect→Merge→Develop→Share). 본 레포가 optional mothership 으로 연결할 수 있는 사자매 시스템.

---

## 빠르게 시작하기

> **깊이있는 셋업 매뉴얼**: `90. Settings/Sharing/Setup Guide.md` — Mode A/B 구분, sed 일괄 치환 명령어, 검증용 grep, FAQ 7개 포함. 아래 5단계로 부족하다면 이 문서를 펼쳐놓고 작업.

### 1. 클론

```bash
cd ~/DEV
git clone https://github.com/gyutaetae/cmds-llm-wiki.git my-llm-wiki
cd my-llm-wiki
```

### 2. Obsidian 볼트로 열기

Obsidian → Open folder as vault → `my-llm-wiki/` 선택.

### 3. placeholder 채우기

아래 placeholder 가 여러 파일에 흩어져 있습니다. 한 번에 바꾸세요:

| placeholder | 채울 값 (예시) |
|---|---|
| `김규태` | `[[홍길동]]` 같은 wikilink 친화 이름 |
| `김규태` | `Jane Doe` 표시용 이름 |
| `C:\Users\kym70\OneDrive\Desktop\cmds-llm-wiki-work\cmds-llm-wiki` | `/Users/foo/DEV/my-llm-wiki` |
| `{PATH_TO_YOUR_MOTHERSHIP_VAULT}` | (옵션) 별도 PKM 볼트 경로 |
| `{your-mothership-vault-name}` | (옵션) mothership 폴더 이름 |

일괄 치환:
```bash
cd my-llm-wiki
LC_ALL=C find . -name "*.md" -o -name "*.sh" -o -name "*.yml" -o -name "*.json" | xargs sed -i '' \
  -e 's|김규태|홍길동|g' \
  -e 's|김규태|Jane Doe|g' \
  -e 's|C:\Users\kym70\OneDrive\Desktop\cmds-llm-wiki-work\cmds-llm-wiki|/Users/foo/DEV/my-llm-wiki|g'
```

### 4. Core Context 채우기

`Core Context.md` 에서:
- §1 정체성 (이름·역할·전문 분야·연속성 선언)
- §2 재활용 축 5~9개 (당신의 지식은 어디에 쓰일 것인가)
- §3~§5 는 선택

### 5. qmd (선택, 권장) — 로컬 검색 엔진

```bash
# 설치 (brew 필요)
brew install qmd-search/qmd/qmd

# 설정 파일 복사
cp "90. Settings/qmd-config-template.yml" ~/.config/qmd/index.yml
# ~/.config/qmd/index.yml 의 C:\Users\kym70\OneDrive\Desktop\cmds-llm-wiki-work\cmds-llm-wiki 를 실제 경로로 수정

# 인덱싱
export QMD_EMBED_MODEL="hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf"
qmd update && qmd embed
```

### 6. Obsidian Web Clipper (선택)

`90. Settings/Sharing/clipper-*.json` 18개 중 원하는 사이트 템플릿을 Web Clipper Settings → Templates → Import 에서 불러오기.

### 7. Codex 실행

```bash
cd my-llm-wiki
codex
```

첫 명령어 추천 순서:
1. `$status` 또는 `/status` — 현재 볼트 상태 확인
2. `$ingest <URL>` 또는 `/ingest <URL>` — 관심 기사 하나 ingest
3. `$query <질문>` 또는 `/query <질문>` — 쌓인 wiki 로 첫 질의
4. `$lint` 또는 `/lint` — 건강도 체크

Codex 는 repo 안의 `.agents/skills/*/SKILL.md` 를 repo-scoped skills 로 발견합니다. 즉, 이 저장소를 클론한 뒤 **repo 루트나 그 하위 폴더에서 Codex 를 실행하면** 이 skills 는 별도 설치 없이 사용할 수 있습니다.

---

## Codex skills 사용 방식

이 레포의 skills 는 다음 위치에 있습니다.

```text
.agents/skills/
├── ingest/SKILL.md
├── query/SKILL.md
├── lint/SKILL.md
├── status/SKILL.md
├── inbox/SKILL.md
├── capture-tabs/SKILL.md
├── reindex/SKILL.md
├── refresh-context/SKILL.md
├── verify/SKILL.md
└── audit/SKILL.md
```

Codex 에서 명시적으로 부를 수 있습니다.

```text
$ingest https://example.com/article
$query "이 위키의 핵심 패턴은 뭐야?"
$lint
```

명시 호출을 하지 않아도, 프롬프트가 skill description 과 맞으면 Codex 가 자동으로 해당 skill 을 선택할 수 있습니다.

### 다른 사람이 이 skills 를 쓰는 방법

목적에 따라 다릅니다.

| 목적 | 방법 | 설치 필요 여부 |
|---|---|---|
| 이 LLM Wiki 레포 안에서만 사용 | 레포 클론 후 repo 안에서 `codex` 실행 | 별도 설치 없음 |
| 다른 모든 repo 에서 개인적으로 사용 | `.agents/skills/{skill}` 폴더를 `$HOME/.agents/skills/` 로 복사 또는 symlink | 로컬 복사 필요 |
| 여러 사람에게 재사용 가능한 패키지로 배포 | Codex plugin 으로 패키징 | plugin 설치 필요 |

따라서 이 레포를 쓰는 사용자는 `.ps1` 같은 설치 스크립트를 실행할 필요가 없습니다. 단, 이 skills 를 **다른 repo 에서도 전역으로 쓰고 싶다면** 사용자 홈의 `.agents/skills` 로 복사하거나, 장기적으로는 plugin 으로 배포하는 것이 맞습니다.

---

## 구조

```
cmds-llm-wiki/
├── AGENTS.md                    # Schema (Codex) — LLM 행동 규칙
├── CLAUDE.md                    # Schema (Claude Code legacy mirror)
├── Core Context.md              # 사용자 맥락 (채워서 사용)
├── index.md                     # 마스터 인덱스
├── log.md                       # 변경 이력 (append-only)
├── README.md                    # 이 파일
├── CHANGELOG.md                 # 템플릿 버전 이력
├── LLM-Wiki-Starter-Kit.md      # 간이 공유용 킷
├── .codex/                      # Codex harness
│   ├── commands/                # 10 operation checklists
│   ├── hooks/                   # 2 hooks
│   └── hooks.json
├── .agents/
│   └── skills/                  # 10 Codex repo-scoped skills
├── .claude/
│   ├── commands/                # Claude Code legacy commands
│   ├── hooks/                   # Claude Code legacy hooks
│   └── settings.json
├── .obsidian/
│   └── hotkeys.json             # 73개 Obsidian hotkey 바인딩 (선택 — 마음에 안 들면 삭제)
├── 00. Inbox/                   # Web Clipper 수신 (02~05 서브폴더)
├── 10. Raw Sources/             # 불변 원본 (11~15 서브폴더)
│   └── 11. Articles/            # Karpathy 예시 2개 포함
├── 20. Wiki/                    # LLM 관리 위키
│   ├── 21. Concepts/            # 예시 (LLM Wiki Pattern 등)
│   ├── 22. Entities/            # 예시 (Karpathy, Bush, Memex)
│   ├── 23. Guides/              # 예시 가이드
│   └── 24. Maps/                # 예시 MOC
├── 30. Queries/                 # 합성된 질의 결과 (빈 폴더, /query 결과로 채워짐)
├── 80. References/Attachments/  # 모든 이미지 일원화
└── 90. Settings/
    ├── Templates/               # Obsidian 노트 템플릿 (4종)
    ├── Sharing/                 # 18 Web Clipper JSON + Setup Guide.md + CLAUDE-Template.md
    └── qmd-config-template.yml  # 로컬 검색 엔진 설정
```

---

## 핵심 규약

- **YAML 2 SPACES / Body TAB** (혼용 금지)
- **Wikilink in YAML quoted**: `"[[link]]"`
- **Mermaid 라벨 큰따옴표**: `A["label"]`
- **필수 7 프로퍼티**: `type`, `aliases`, `description` (English, LLM hint), `author`, `date created`, `date modified`, `tags`
- **ISO 8601 날짜**: `YYYY-MM-DD`
- **새 YAML 키는 camelCase**: `collectionPurpose`, `mainVaultRelated`, `mainVaultCmds`, `reusableFor`

자세한 Codex 운영 규칙은 `AGENTS.md` 참조. Claude Code 를 쓸 때만 `CLAUDE.md` 를 함께 보세요.

---

## 예시 컨텐츠 안내

`10. Raw Sources/` 와 `20. Wiki/` 에 Karpathy 의 LLM Wiki 원문을 ingest 한 결과 일부가 예시로 들어있습니다. 이는 **패턴이 어떻게 동작하는지 보여주기 위한** 샘플입니다:

- `10. Raw Sources/11. Articles/2026-04-12-Karpathy-LLM-Wiki.md`
- `10. Raw Sources/11. Articles/2026-04-02-Karpathy-LLM-Knowledge-Bases-X-Thread.md`
- `20. Wiki/` — 개념·엔티티·MOC 약 16개 (정확한 수는 `/lint` 가 재집계)

예시 wiki 페이지 일부에는 **orphan wikilinks** (존재하지 않는 페이지로의 링크) 가 포함되어 있습니다. 이는 의도된 것으로, `/ingest` 를 반복하면서 자연스럽게 채워지는 wiki 의 성장 방식을 보여줍니다.

완전히 빈 상태에서 시작하려면 `10. Raw Sources/11. Articles/*.md` 와 `20. Wiki/**/*.md` 를 삭제하세요.

---

## 라이선스 & 기여

- 본 레포는 **템플릿** 입니다. 자유롭게 fork·복제하여 본인 볼트로 사용하세요.
- 개선 PR 환영. 단 `Core Context.md`, `index.md`, `log.md` 같은 템플릿 파일은 placeholder 유지.

제작: [@YohanKoo](https://x.com/YohanKoo) · [CMDSPACE](https://litt.ly/cmds)
- Karpathy 의 LLM Wiki pattern
- kepano 의 contamination mitigation 개념
- cmds-system-files (자매 mothership pattern)
