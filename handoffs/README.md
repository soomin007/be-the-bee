# Handoffs — Be the Bee 디자인 핸드오프 모음

외부 디자인 도구(주로 **Claude Design**)에 넣어 비주얼 에셋·홍보물을 만들기 위한 **사양서(핸드오프)** 모음이다.
게임의 기획 문서는 [`../docs/`](../docs/INDEX.md), 게임 규칙 스펙은 [`../docs/design/rules.md`](../docs/design/rules.md)에 있다(여긴 아님).

## 원칙
- **코드가 단일 출처.** 여기 문서의 좌표·색이 코드와 어긋나면 코드를 따른다. 대부분 이미 게임에 구현돼 있고,
  이 문서들은 "왜 이렇게 생겼나"의 사양·재현 가이드다.
- 한 핸드오프 = 한 폴더. 비주얼 결과물·미리보기·SVG 에셋을 그 폴더 안에 둔다.
- 새 핸드오프는 `handoffs/<주제>/README.md`로 추가하고 아래 표에 한 줄 더한다.

## 목록
| 핸드오프 | 무엇 | 구현 단일 출처 |
|---|---|---|
| [bee_pieces/](bee_pieces/README.md) | 게임 말(벌+원판) SVG 에셋 + 3D·실사 부록. `svg/` 4종 포함 | `src/ui/piece-art.ts`(2D) · `src/ui/board3d.ts`(3D) |
| [hive/](hive/README.md) | 벌집(입체 밀랍 셀) 그래픽. 캐러셀용. 미리보기 PNG 포함 | `src/ui/game-ui.ts` · `src/ui/themes.ts` · `src/style.css` |
| [mini_player/](mini_player/README.md) | 코너 배경음악 미니 플레이어(펼침 카드/접힘 알약) | `src/ui/game-ui.ts` |
| [carousel/](carousel/README.md) | 인스타그램 캐러셀 핸드오프 (두 버전 + 결과물) | `scripts/shot-carousel.mjs` |

### carousel/ 안 구성
- [`README.md`](carousel/README.md) — **특징·후킹 버전**(메인 홍보용, 7장).
- [`rules-version.md`](carousel/rules-version.md) — **규칙·소개 버전**(자세히 후속용, 9장).
- `export/` — Claude Design이 만든 실제 인스타 결과물 PNG(미추적, 결과물 보관용).

## 참고
- 말·벌집·미니 플레이어는 모두 게임에 구현 완료. 원본 파라미터화 프로토타입(`.dc.html`)은 정리하고
  스펙·SVG·미리보기만 남겼다.
- UI 한국어 문구 규칙, 색 테마 등 공통 규칙은 [`../CLAUDE.md`](../CLAUDE.md) · [`../src/ui/themes.ts`](../src/ui/themes.ts) 참고.
