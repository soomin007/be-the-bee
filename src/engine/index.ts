// src/engine — 순수 TypeScript 규칙 엔진.
//
// 규칙(non-negotiable):
//   - DOM/브라우저 전역(window, document) 금지
//   - src/ui 를 import 하지 않는다
//   - 상태는 JSON 직렬화 가능해야 한다 (undo/replay/save/netcode 대비)
//   - 순수 함수 지향: (state, move) => newState, 입력을 변형(mutate)하지 않는다
//
// 실제 모듈(types, hex, board, rules, ai ...)은 다음 단계에서 추가한다.
// 이 배럴 파일은 셋업 검증용 자리표시자다.
export const ENGINE_VERSION = '0.0.0'
