# Be the Bee — 문서 인덱스

이 프로젝트 문서의 단일 진입점. **무엇이 어디서 단일 진실인지의 지도.**
내용이 겹치면 담당 문서만 고치고 나머지는 링크한다.

> **코드가 항상 최종 진실.** 문서의 구체값(좌표·수치 등)이 코드와 어긋나면 코드를 따른다.
> 단, **게임 규칙**만은 `Be the Bee_게임 설명서.pdf`가 최종 권위이고 `design/rules.md`가
> 구현 기준이다 — 코드가 규칙과 어긋나면 코드가 버그다.

## 단일 소스 지도 (이 주제는 이 문서가 진실)

| 주제 | 단일 소스 |
|---|---|
| 게임 규칙 (최종 권위) | [`../Be the Bee_게임 설명서.pdf`](../) |
| 게임 규칙 명세 (구현 기준) | [`../design/rules.md`](../design/rules.md) |
| 프로젝트 개요·명령어 (공개용) | [`../README.md`](../README.md) |
| 아키텍처·코딩 규약·운영 규칙 | [`../CLAUDE.md`](../CLAUDE.md) |
| 단계별 큰 그림(로드맵) | [`ROADMAP.md`](ROADMAP.md) |
| **다음 작업·미착수 (진행 단일 소스)** | [`design/backlog.md`](design/backlog.md) |
| 반복 금지 함정·오류 이력 | [`design/known_issues.md`](design/known_issues.md) |
| 벌 컨셉 비주얼 테마 | [`design/bee_theme.md`](design/bee_theme.md) |
| AI 전략·난이도/성향 상성 분석 | [`design/ai_strategy.md`](design/ai_strategy.md) (재실행: `npm run sim`) |
| BGM 생성 프롬프트(Suno) | [`design/bgm_prompt.md`](design/bgm_prompt.md) |
| 세션별 변경 흐름 | [`../session_logs/`](../session_logs/) |
| 개발용 점검·미리보기 도구 | [`../scripts/README.md`](../scripts/README.md) (verify-* 회귀 / shot-* → `design/shots/`) |
| 배포(GitHub Pages 자동) | `.github/workflows/deploy.yml` · ▶ https://soomin007.github.io/be-the-bee/ |

## 원칙
- **진행/우선순위 = backlog**, 개요 = README, 규칙 = rules.md, 아키텍처·운영 = CLAUDE.md.
- 같은 내용이 두 문서에 생기면 위 지도의 담당 문서로 합치고 다른 쪽은 한 줄+링크로 바꾼다.
- 새 설계 문서는 `docs/design/<topic>.md`(snake_case).
