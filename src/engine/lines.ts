// "한 번 스캔, 두 곳에 사용"의 그 한 곳.
//
// 3개 축을 따라 같은 값이 연속된 최대 직선(run)을 모두 찾는다. 이 함수 하나를
//  - 타일 색으로 호출 → 벌집(hive) 탐지 (hive.ts)
//  - 말 소유자로 호출 → 승리(말 5목) 탐지 (victory.ts)
// 두 곳에서 재사용한다. 절대 복제하지 않는다(design/rules.md "한 스캔 두 용도").

import { HEX_AXES, hexAdd, hexFromKey, hexKey, hexSubtract } from './hex'

export interface Line<T> {
  readonly value: T
  /** HEX_AXES 의 인덱스(0..2). */
  readonly axis: number
  /** 직선을 이루는 칸들의 hexKey, 축 정방향으로 정렬됨. */
  readonly cells: readonly string[]
}

/**
 * cells: hexKey → 비교 가능한 값(예: 진영 색)의 맵. 값이 없는 칸은 넣지 않는다.
 * 같은 값이 한 축으로 minLen 개 이상 연속된 모든 최대 직선을 반환한다.
 *
 * 값 비교는 `===`(원시값) 기준. 중복 없이 각 직선을 정확히 한 번만 보고하려고
 * "직선의 시작 칸"(축 역방향 이웃이 다른 값)에서만 정방향으로 훑는다.
 */
export function findLines<T>(cells: ReadonlyMap<string, T>, minLen: number): Line<T>[] {
  const result: Line<T>[] = []

  for (const [key, value] of cells) {
    const h = hexFromKey(key)
    for (let axis = 0; axis < HEX_AXES.length; axis++) {
      const dir = HEX_AXES[axis]!
      // 시작 칸이 아니면(역방향 이웃이 같은 값) 건너뛴다 — 중복 방지.
      if (cells.get(hexKey(hexSubtract(h, dir))) === value) continue

      const run: string[] = [key]
      let cur = hexAdd(h, dir)
      let curKey = hexKey(cur)
      while (cells.get(curKey) === value) {
        run.push(curKey)
        cur = hexAdd(cur, dir)
        curKey = hexKey(cur)
      }

      if (run.length >= minLen) result.push({ value, axis, cells: run })
    }
  }

  return result
}
