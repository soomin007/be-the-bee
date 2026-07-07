// 저장 보관함 — 모달 HTML + 보관함/공유 액션 처리.
// game-ui.ts 에서 분리(2026-07-07, 모놀리스 점진 분해 3단계). new-game-wizard 와 같은 host 콜백
// 패턴: 저장소 접근(game-save.ts)은 여기서 직접, 게임 상태를 만지는 효과(스냅샷 생성/복원·복기
// 진입·알림·모달 열림 상태)는 host 콜백으로 game-ui 가 수행한다.
//
// 열림/닫힘 상태(infoModal==='saves')는 game-ui 소유 그대로 — 이 모듈은 "열렸을 때 그릴 내용"과
// "보관함 계열 액션"만 안다. saveGame(패널의 저장 버튼)처럼 모달 밖에서도 오는 액션도 여기서 처리.

import {
  addSlot,
  decodeSnapshot,
  deleteSlot,
  encodeSnapshot,
  getSlot,
  listSlots,
  type GameSnapshot,
} from './game-save'
import { ICON } from './icons'

export interface SavesHost {
  /** 현재 판의 스냅샷(저장·공유용). */
  snapshot(): GameSnapshot
  /** 새 슬롯 이름(모드·날짜 등으로 game-ui 가 작명). */
  slotName(): string
  /** 공유 코드를 클립보드에 복사하고 안내(notice)까지 처리. */
  shareCode(code: string): void
  /** 스냅샷을 현재 게임으로 복원(타이머 정리 + 적용 + 자동저장). */
  loadSnapshot(s: GameSnapshot): void
  /** 가져온 기보로 복기(해설) 진입 — 자체적으로 render 까지 한다. */
  enterReplay(): void
  /** 보관함 모달 닫기(infoModal 해제). */
  close(): void
  setNotice(text: string): void
  setMessage(text: string): void
  render(): void
}

export interface SavesModal {
  /** 보관함 모달 innerHTML(backdrop 포함). 슬롯 목록이 동적이라 매번 새로 만든다. */
  html(): string
  /** 보관함 계열 액션 처리. 소비했으면 true(호출 측은 그대로 return). */
  handle(act: string): boolean
}

export function createSavesModal(host: SavesHost): SavesModal {
  function html(): string {
    const slots = listSlots()
    const rows =
      slots.length === 0
        ? '<div class="saves-empty">저장된 기보가 없어요. “현재 판 저장”을 눌러 보세요.</div>'
        : slots
            .map(
              (s) => `<div class="save-row">
                <span class="save-name">${s.name}</span>
                <button data-act="loadSlot:${s.id}" title="이 기보 불러오기">${ICON.download} 불러오기</button>
                <button class="save-icon" data-act="exportSlot:${s.id}" title="공유 코드 복사">📋</button>
                <button class="save-icon" data-act="delSlot:${s.id}" title="삭제">🗑</button>
              </div>`,
            )
            .join('')
    return `
      <div class="modal-backdrop">
        <div class="modal-card saves-card">
          <button class="tut-skip" data-act="closeSaves" title="닫기">닫기 ✕</button>
          <div class="modal-title">💾 저장 보관함</div>
          <div class="saves-top">
            <button data-act="saveGame">＋ 현재 판 저장</button>
            <button data-act="exportCurrent" title="현재 판 공유 코드 복사">📤 현재 판 복사</button>
            <button data-act="importGame" title="코드를 붙여넣어 불러오기">📥 코드로 가져오기</button>
          </div>
          <div class="saves-list">${rows}</div>
          <p class="saves-hint">📋 = 공유 코드 복사. 그 코드를 붙여넣어 다른 사람과 기보를 주고받거나 분석을 맡길 수 있어요.</p>
        </div>
      </div>
    `
  }

  function handle(act: string): boolean {
    // 슬롯 불러오기/삭제/공유코드 복사
    if (act.startsWith('loadSlot:')) {
      const s = getSlot(act.slice('loadSlot:'.length))
      if (s) {
        host.loadSnapshot(s.snap)
        host.close()
        host.setNotice('기보를 불러왔어요.')
      }
      host.render()
      return true
    }
    if (act.startsWith('delSlot:')) {
      deleteSlot(act.slice('delSlot:'.length))
      host.render() // 보관함 모달 갱신
      return true
    }
    if (act.startsWith('exportSlot:')) {
      const s = getSlot(act.slice('exportSlot:'.length))
      if (s) host.shareCode(encodeSnapshot(s.snap))
      return true
    }
    switch (act) {
      case 'saveGame':
        addSlot(host.slotName(), host.snapshot())
        host.setNotice('보관함에 저장했어요.')
        break
      case 'closeSaves':
        host.close()
        break
      case 'exportCurrent':
        host.shareCode(encodeSnapshot(host.snapshot()))
        break
      case 'importGame': {
        const code = window.prompt('기보 코드를 붙여넣으세요 (BTB1:... )')
        const s = code ? decodeSnapshot(code) : null
        if (code && !s) {
          host.setNotice('')
          host.setMessage('코드를 알아볼 수 없어요. 전체를 정확히 붙여넣었는지 확인하세요.')
        } else if (s) {
          host.loadSnapshot(s)
          host.close()
          // 받은 기보는 분석이 목적 — 바로 복기(해설)로 진입해 한 수씩 평가를 볼 수 있게.
          // (복기 종료를 누르면 마지막 국면으로 가 이어서 둘 수도 있다.)
          if (s.moveLog.length > 0) {
            host.enterReplay()
            return true
          }
          host.setNotice('기보를 불러왔어요.')
        }
        break
      }
      default:
        return false
    }
    host.render()
    return true
  }

  return { html, handle }
}
