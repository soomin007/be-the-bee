// src/engine, 순수 TypeScript 규칙 엔진 (공개 API 배럴).
//
// 규칙(non-negotiable):
//   - DOM/브라우저 전역 금지, src/ui import 금지
//   - 상태는 JSON 직렬화 가능, 순수 함수 (state, move) => newState, 입력 불변
//
// 구현 기준: docs/design/rules.md

export const ENGINE_VERSION = '0.1.0'

export * from './hex'
export * from './types'
export * from './state'
export * from './lines'
export * from './hive'
export * from './victory'
export * from './moves'
export * from './ai'
