// 새 게임 설정 마법사 — 상태 기계 + 모달 HTML + ng* 액션 처리.
// game-ui.ts 에서 분리(2026-07-07, 모놀리스 점진 분해 2단계).
//
// 경계: 마법사는 "고르는 UI"만 담당한다. 임시 선택값을 들고 있다가 "시작" 때 값을 넘길 뿐,
// 실제 효과(설정 반영·게임 리셋·온라인 방 생성/입장·재대결)는 host 콜백으로 game-ui 가 수행한다.
// 취소하면 settings 는 안 바뀐다(임시 상태만 버림).

import type { Difficulty, Persona, Player } from '../engine/index'
import { DIFFS, DIFF_LABEL, PERSONAS, PERSONA_LABEL, PERSONA_DESC, type RoomSettings } from './settings'
import { ICON } from './icons'

/** "시작" 때 game-ui 로 넘기는 마법사 선택값. */
export interface WizardValues {
  diff: Difficulty // vs AI 난이도
  persona: Persona // vs AI 성향
  aiSide: Player // vs AI: AI 색(brown=내가 선공/노랑, yellow=내가 후공/갈색)
  diffY: Difficulty // 관전: 노랑
  personaY: Persona
  diffB: Difficulty // 관전: 갈색
  personaB: Persona
}
type WizStep = 'opponent' | 'humanWhere' | 'online' | 'ai' | 'watch'

/** 마법사 밖 실제 효과 — game-ui 가 구현해 넘긴다. */
export interface WizardHost {
  startLocal(): void
  startAi(v: WizardValues): void
  startWatch(v: WizardValues): void
  hostOnline(): void
  joinOnline(code: string): void
  rematch(): void
  /** 온라인 경기를 마친 직후인가(첫 화면에 '재대결' 버튼 추가). */
  showRematch(): boolean
  /** 온라인 기능 사용 가능 여부(꺼져 있으면 온라인 버튼 비활성). */
  mpEnabled: boolean
  /** 마법사 상태가 바뀌어 다시 그려야 할 때 호출(게임 전체 render). */
  render(): void
}

export interface NewGameWizard {
  isOpen(): boolean
  /** 마법사를 연다. 임시 선택값은 현재 설정에서 복사(취소하면 버려짐). */
  open(settings: RoomSettings): void
  close(): void
  /** renderModal 의 "같은 모달 다시 안 그림" 가드 키. 닫혀 있으면 null. */
  modalKey(): string | null
  /** 모달 레이어 innerHTML(backdrop 포함). 닫혀 있으면 null. */
  html(): string | null
  /** ng* 액션 처리. 소비했으면 true(호출 측은 그대로 return). */
  handle(act: string): boolean
}

export function createNewGameWizard(host: WizardHost): NewGameWizard {
  let wiz: ({ step: WizStep } & WizardValues) | null = null

  function html(): string | null {
    const w = wiz
    if (!w) return null
    const optRow = (prefix: string, items: readonly string[], label: (v: string) => string, sel: string): string =>
      `<div class="ng-opts">${items
        .map((v) => `<button data-act="${prefix}:${v}" class="${v === sel ? 'active' : ''}">${label(v)}</button>`)
        .join('')}</div>`
    const diffRow = (prefix: string, sel: Difficulty): string => optRow(prefix, DIFFS, (v) => DIFF_LABEL[v as Difficulty], sel)
    const personaRow = (prefix: string, sel: Persona): string =>
      `${optRow(prefix, PERSONAS, (v) => PERSONA_LABEL[v as Persona], sel)}<div class="ng-desc">${PERSONA_DESC[sel]}</div>`
    let inner = ''
    if (w.step === 'opponent') {
      const rematch = host.showRematch()
        ? `<button class="ng-rematch" data-act="ngRematch">🔄 방금 상대와 재대결(한 판 더)</button>`
        : ''
      inner = `
        <div class="modal-title">🐝 새 게임</div>
        <div class="modal-sub">누구와 둘까요?</div>
        ${rematch}
        <div class="ng-choices">
          <button data-act="ngOpp:human">${ICON.people} 사람과</button>
          <button data-act="ngOpp:ai">${ICON.ai} AI와 대결</button>
          <button data-act="ngOpp:watch">${ICON.view} AI 관전</button>
        </div>
        <div class="modal-actions"><button data-act="ngCancel">${ICON.close} 취소</button></div>`
    } else if (w.step === 'humanWhere') {
      inner = `
        <div class="modal-title">👥 사람과</div>
        <div class="modal-sub">어디서 둘까요?</div>
        <div class="ng-choices">
          <button data-act="ngWhere:local">📱 한 기기에서 번갈아</button>
          <button data-act="ngWhere:online" ${host.mpEnabled ? '' : 'disabled title="온라인 기능이 설정되지 않았어요"'}>🔗 온라인으로</button>
        </div>
        <div class="modal-actions"><button data-act="ngBack">← 뒤로</button></div>`
    } else if (w.step === 'online') {
      inner = `
        <div class="modal-title">🔗 온라인 대전</div>
        <div class="modal-sub">방을 만들어 초대하거나, 받은 코드로 입장해요.</div>
        <div class="ng-choices">
          <button data-act="ngHost">${ICON.plus} 방 만들기 (초대 링크 복사)</button>
          <button data-act="ngJoin">${ICON.enter} 초대 코드 입력</button>
        </div>
        <div class="modal-actions"><button data-act="ngBack">← 뒤로</button></div>`
    } else if (w.step === 'ai') {
      // 내 색 = AI 색의 반대. brown=AI 면 내가 노랑(선공), yellow=AI 면 내가 갈색(후공·연습).
      const myColorRow = `<div class="ng-opts">
        <button data-act="ngSide:brown" class="${w.aiSide === 'brown' ? 'active' : ''}">🟡 노랑 · 선공</button>
        <button data-act="ngSide:yellow" class="${w.aiSide === 'yellow' ? 'active' : ''}">🟤 갈색 · 후공</button>
      </div>`
      // 전문가는 성향을 무시(항상 최선)하므로 성향 선택을 숨기고 안내만 보여준다.
      const personaBlock =
        w.diff === 'expert'
          ? `<div class="ng-desc">전문가는 늘 최선의 수를 둬서 성향(공격형·수비형 등)을 따르지 않아요.</div>`
          : `<div class="ng-label">성향</div>${personaRow('ngPersona', w.persona)}`
      inner = `
        <div class="modal-title">🤖 AI와 대결</div>
        <div class="modal-sub">내 색과 난이도를 골라요. (갈색을 고르면 후공 연습)</div>
        <div class="ng-label">내 색</div>${myColorRow}
        <div class="ng-label">난이도</div>${diffRow('ngDiff', w.diff)}
        ${personaBlock}
        <div class="modal-actions"><button data-act="ngBack">← 뒤로</button><button class="ng-start" data-act="ngStartAi">시작 🐝</button></div>`
    } else {
      // 전문가는 성향을 무시(항상 최선)하므로, 그 색은 성향 선택을 숨기고 안내만(vsAi 단계와 동일 규칙).
      const watchPersona = (diff: Difficulty, prefix: string, sel: Persona): string =>
        diff === 'expert'
          ? `<div class="ng-desc">전문가는 늘 최선의 수를 둬서 성향(공격형·수비형 등)을 따르지 않아요.</div>`
          : `<div class="ng-label">성향</div>${personaRow(prefix, sel)}`
      inner = `
        <div class="modal-title">👀 AI 관전</div>
        <div class="modal-sub">두 AI의 난이도와 성향을 골라요.</div>
        <div class="ng-side-label">🟡 노랑</div>
        <div class="ng-label">난이도</div>${diffRow('ngDiffY', w.diffY)}
        ${watchPersona(w.diffY, 'ngPersonaY', w.personaY)}
        <div class="ng-side-label">🟤 갈색</div>
        <div class="ng-label">난이도</div>${diffRow('ngDiffB', w.diffB)}
        ${watchPersona(w.diffB, 'ngPersonaB', w.personaB)}
        <div class="modal-actions"><button data-act="ngBack">← 뒤로</button><button class="ng-start" data-act="ngStartWatch">시작 🐝</button></div>`
    }
    return `<div class="modal-backdrop"><div class="modal-card ng-card">${inner}</div></div>`
  }

  // 상대 선택·난이도/성향 고르기(임시 상태만 바꾸고 다시 그림). "시작"류는 값을 넘기고 닫는다.
  function handle(act: string): boolean {
    if (!wiz || !act.startsWith('ng')) return false
    if (act === 'ngOpp:human') wiz.step = 'humanWhere'
    else if (act === 'ngOpp:ai') wiz.step = 'ai'
    else if (act === 'ngOpp:watch') wiz.step = 'watch'
    else if (act === 'ngWhere:online') wiz.step = 'online'
    else if (act === 'ngWhere:local') {
      wiz = null
      host.startLocal()
      return true
    } else if (act.startsWith('ngDiffY:')) wiz.diffY = act.slice('ngDiffY:'.length) as Difficulty
    else if (act.startsWith('ngDiffB:')) wiz.diffB = act.slice('ngDiffB:'.length) as Difficulty
    else if (act.startsWith('ngDiff:')) wiz.diff = act.slice('ngDiff:'.length) as Difficulty
    else if (act.startsWith('ngPersonaY:')) wiz.personaY = act.slice('ngPersonaY:'.length) as Persona
    else if (act.startsWith('ngPersonaB:')) wiz.personaB = act.slice('ngPersonaB:'.length) as Persona
    else if (act.startsWith('ngPersona:')) wiz.persona = act.slice('ngPersona:'.length) as Persona
    else if (act.startsWith('ngSide:')) wiz.aiSide = act.slice('ngSide:'.length) as Player
    else if (act === 'ngBack') wiz.step = wiz.step === 'online' ? 'humanWhere' : 'opponent'
    else if (act === 'ngCancel') wiz = null
    else if (act === 'ngRematch') {
      wiz = null
      host.rematch()
      return true
    } else if (act === 'ngHost') {
      wiz = null
      host.hostOnline()
      return true
    } else if (act === 'ngJoin') {
      const code = window.prompt('받은 방 코드를 입력하세요 (예: ABC234)')
      if (code && code.trim()) {
        wiz = null // 입력했을 때만 마법사 닫고 입장(취소면 온라인 화면 유지)
        host.joinOnline(code)
      } else host.render()
      return true
    } else if (act === 'ngStartAi') {
      const v: WizardValues = { ...wiz }
      wiz = null
      host.startAi(v)
      return true
    } else if (act === 'ngStartWatch') {
      const v: WizardValues = { ...wiz }
      wiz = null
      host.startWatch(v)
      return true
    }
    host.render()
    return true
  }

  return {
    isOpen: () => wiz !== null,
    open(settings: RoomSettings): void {
      wiz = {
        step: 'opponent',
        diff: settings.aiDifficulty,
        persona: settings.personaBrown,
        aiSide: settings.aiSide,
        diffY: settings.difficultyYellow,
        personaY: settings.personaYellow,
        diffB: settings.difficultyBrown,
        personaB: settings.personaBrown,
      }
    },
    close(): void {
      wiz = null
    },
    modalKey(): string | null {
      const w = wiz
      if (!w) return null
      return `wiz:${w.step}:${w.diff}:${w.persona}:${w.aiSide}:${w.diffY}:${w.personaY}:${w.diffB}:${w.personaB}`
    },
    html,
    handle,
  }
}
