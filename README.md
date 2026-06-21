# Be the Bee 🐝

**▶ 플레이: https://soomin007.github.io/be-the-bee/** (핫시트 2인 · vs AI · AI 관전)

2인용 육각(hex) 그리드 추상 전략 보드게임 "Be the Bee"의 웹 디지털 구현.

웹 우선(TypeScript)이며, 핵심은 나중에 네이티브(예: Capacitor)로 감싸도 재작성이
필요 없는 **이식 가능한 규칙 엔진**입니다.

## 구조

| 경로            | 설명                                                              |
| --------------- | ----------------------------------------------------------------- |
| `src/engine/`   | **순수 TypeScript** 규칙 엔진. DOM·브라우저 전역 없음. 단위 테스트 대상. |
| `src/ui/`       | 렌더링(SVG) + 입력 처리. 엔진에 의존. **엔진은 ui를 import하지 않음.** |
| `tests/`        | Vitest 단위 테스트.                                                |
| `design/`       | `rules.md` — 게임 규칙의 단일 진실 공급원(source of truth).          |

게임 규칙의 최종 권위는 `Be the Bee_게임 설명서.pdf` 이며, `design/rules.md` 가
구현 기준 명세입니다.

## 명령어

| 명령              | 설명                                       |
| ----------------- | ------------------------------------------ |
| `npm run dev`     | 로컬 개발 서버                             |
| `npm test`        | 엔진 테스트 1회 실행                       |
| `npm run test:watch` | 테스트 watch 모드                       |
| `npm run build`   | 타입체크 + 프로덕션 빌드 (`dist/`)         |
| `npm run preview` | 빌드 결과 미리보기                         |
| `npm run check:engine` | 엔진 순수성 검사 (DOM/Node API 사용 시 실패) |

## 기술 스택

Vite · TypeScript(strict) · Vitest · SVG 렌더링. 상태 관리 라이브러리 없음 —
엔진 상태는 JSON 직렬화 가능한 순수 객체입니다.
