// 복기 리모컨(game-ui 분해 5단계) — 복기 보기 상태 기계 + 하단 리모컨 렌더 + "이 판 분석" 카드.
// 복기는 보기 전용 오버레이다: state/history/moveLog 는 절대 건드리지 않고, 몇 수째를 보는지(index)만
// 이 모듈이 소유한다. 게임 상태를 만지는 효과(AI 타이머 정리·패널 접기/복원·턴 재시작)는 host 콜백.
import { ICON } from './icons'
import type { GameReview, GameState, Hex, Move, MoveNote, Player } from '../engine/index'

export interface ReplayHost {
  /** 둔 수의 순서(읽기 전용으로 취급). */
  moveLog(): Move[]
  /** timeline()[k] = k수째 둔 뒤의 국면(0 = 시작 국면). */
  timeline(): GameState[]
  /** 자동 재생 간격(관전 속도 설정 공유). */
  watchDelay(): number
  /** 진영 이름(테마에 따라 바뀌므로 콜백). */
  playerLabel(p: Player): string
  /** 수 해설 코드 → "✓/✗ 한 줄" (라이브 코칭과 공용이라 host 소유). */
  noteLine(note: MoveNote): string
  /** 한 수가 건드린 칸들("더 나은 수" 강조용). */
  moveCells(move: Move): Hex[]
  /** "이 판 분석"을 비동기 계산(워커 있으면 워커). */
  requestAnalysis(initial: GameState, mlog: Move[], cb: (r: { review?: GameReview; error?: string }) => void): void
  /** 늦게 오는 분석 워커 응답 무시(복기 종료 시). */
  cancelAnalysis(): void
  /** 복기 진입 부수효과: AI 타이머 정리·연출 제거·입력 초안 폐기·패널 접기·모바일 시트 닫기. */
  onEnter(): void
  /** 복기 종료 부수효과: 패널 복원·startTurn·render·AI 재개(이 순서 유지). */
  onExit(): void
  /** 리모컨 버튼 클릭을 공통 액션 경로(onPanelAction)로 돌린다. */
  onAction(act: string | null): void
  render(): void
}

export interface ReplayRemote {
  /** null = 실시간, 그 외 = timeline 의 그 국면을 본다. */
  index(): number | null
  active(): boolean
  /** 분석의 "더 나은 수"가 가리키는 칸(복기 보드에 초록 점선 강조). */
  recommended(): Hex[] | null
  /** 실시간 수·리셋·스냅샷 교체 시: 자동 재생을 멈추고 복기 보기를 끝낸다(종료 부수효과 없음). */
  deactivate(): void
  /** replay* 액션 처리. 복기 액션이 아니면 false. */
  handle(act: string): boolean
  /** 하단 리모컨(진행·내비·재생·슬라이더·분석 카드)을 행동 바에 그린다. */
  renderInto(bar: HTMLElement): void
}

export function createReplayRemote(host: ReplayHost): ReplayRemote {
  let index: number | null = null // null = 실시간
  let timer: number | null = null // 자동 재생 타이머
  let analysisOpen = false // "이 판 분석" 펼침 여부
  let cachedReview: GameReview | null = null // 1회 계산한 분석 캐시(매 렌더 재계산 방지 + 점수 손해)
  let analysisLoading = false // 워커에서 계산 중이면 분석 카드에 "계산 중" 표시
  let recommendedCells: Hex[] | null = null // "더 나은 수"가 가리키는 칸

  function stopTimer(): void {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  // 복기 자동 재생, watchDelay 간격으로 한 수씩 앞으로.
  function tick(): void {
    if (index === null) return
    if (index >= host.moveLog().length) {
      stopTimer()
      host.render()
      return
    }
    index += 1
    host.render()
    if (index >= host.moveLog().length) {
      stopTimer()
      host.render()
      return
    }
    timer = window.setTimeout(tick, host.watchDelay())
  }

  // 복기 컨트롤(보기 전용). 복기 액션이 아니면 false 를 돌려 호출자가 계속 처리하게 한다.
  function handle(act: string): boolean {
    if (!act.startsWith('replay')) return false
    const n = host.moveLog().length
    if (act !== 'replayToggleAnalysis') recommendedCells = null // 네비/종료는 "더 나은 수" 강조 해제
    switch (act) {
      case 'replayEnter':
        if (n === 0) return true
        stopTimer()
        index = 0
        analysisOpen = false
        cachedReview = null // 분석은 무거우니(hard 탐색) 진입이 아니라 "이 판 분석"을 펼칠 때 워커에서 계산
        analysisLoading = false
        host.onEnter()
        break
      case 'replayToggleAnalysis':
        analysisOpen = !analysisOpen
        // 펼칠 때 아직 분석이 없으면 워커에 비동기 요청(hard 탐색이라 무거울 수 있어 화면 안 멈춤).
        // 결과가 오면 캐싱하고 다시 그린다. 이후 슬라이더/재생에도 재계산 없음.
        if (analysisOpen && cachedReview === null && !analysisLoading) {
          analysisLoading = true
          const tl0 = host.timeline()[0]!
          const mlog = host.moveLog().slice()
          host.requestAnalysis(tl0, mlog, (r) => {
            analysisLoading = false
            if (r.review) cachedReview = r.review
            if (index !== null) host.render() // 아직 복기 중이면 분석 카드 갱신
          })
        }
        break
      case 'replayExit':
        stopTimer()
        index = null
        cachedReview = null
        analysisLoading = false
        host.cancelAnalysis() // 늦게 오는 워커 응답 무시(복기 종료)
        host.onExit() // 패널 복원 → startTurn → render → AI 재개
        return true
      case 'replayFirst':
        stopTimer()
        index = 0
        break
      case 'replayPrev':
        stopTimer()
        index = Math.max(0, (index ?? 0) - 1)
        break
      case 'replayNext':
        stopTimer()
        index = Math.min(n, (index ?? 0) + 1)
        break
      case 'replayLast':
        stopTimer()
        index = n
        break
      case 'replayPlay':
        if (timer !== null) {
          stopTimer()
        } else {
          if ((index ?? 0) >= n) index = 0
          timer = window.setTimeout(tick, host.watchDelay())
        }
        break
      default:
        return true
    }
    host.render()
    return true
  }

  // "이 판 분석" 요약 HTML. 결정적 순간 리스트(클릭=그 수로 점프, 실수면 직전 국면+추천 칸 강조).
  function analysisHtml(currentIdx: number): string {
    if (host.moveLog().length === 0) return ''
    // 분석은 워커에서 비동기로 계산된다(replayToggleAnalysis). 아직 결과 전이면 "계산 중" 카드.
    if (cachedReview === null) {
      return `<div class="replay-analysis"><div class="ra-title">이 판 분석</div><div class="ra-empty">${analysisLoading ? '분석을 계산하고 있어요…' : '분석을 준비 중이에요…'}</div></div>`
    }
    const review = cachedReview
    const decisive = [...review.blunders, ...review.highlights].sort((a, b) => a.index - b.index)
    const cy = review.counts.yellow
    const cb = review.counts.brown
    const list =
      decisive.length === 0
        ? `<div class="ra-empty">눈에 띄는 결정적 순간은 없었어요.</div>`
        : `<div class="ra-list">${decisive
            .map((r) => {
              // 실수에 점수 손해와 "더 나은 수"(추천)가 붙어 있으면 함께 보여준다(클릭=직전 국면+추천 칸 강조).
              const loss = r.lossCp !== undefined && r.lossCp > 0 ? ` <span class="ra-loss">−${r.lossCp}</span>` : ''
              const bestAttr = r.bestMove ? ` data-best="${host.moveCells(r.bestMove).map((h) => `${h.q},${h.r}`).join('|')}"` : ''
              const bestHint = r.bestMove ? ` <span class="ra-best">더 나은 수 보기</span>` : ''
              return (
                `<button class="ra-item ${r.polarity} ${r.index === currentIdx ? 'cur' : ''}" data-jump="${r.index}"${bestAttr}>` +
                `<span class="ra-idx">${r.index}수</span> ${host.playerLabel(r.player)} ${host.noteLine(r.note)}${loss}${bestHint}</button>`
              )
            })
            .join('')}</div>`
    return `
      <div class="replay-analysis">
        <div class="ra-title">이 판 분석</div>
        <div class="ra-counts">
          <span>🟡 노랑 <b class="good">좋은 수 ${cy.good}</b> · <b class="bad">실수 ${cy.bad}</b></span>
          <span>🟤 갈색 <b class="good">좋은 수 ${cb.good}</b> · <b class="bad">실수 ${cb.bad}</b></span>
        </div>
        ${list}
      </div>`
  }

  // 하단 리모컨(데스크탑·모바일 공통): 진행 표시 + 처음/이전/재생·멈춤/다음/끝 + 진행 슬라이더
  // + 이 판 분석(접이식) + 종료. 복기 진입 때 설정 패널/시트를 닫아 보드를 보며 조작한다.
  function renderInto(bar: HTMLElement): void {
    const n = host.moveLog().length
    const idx = index!
    const playing = timer !== null
    const disPrev = idx <= 0 ? 'disabled' : ''
    const disNext = idx >= n ? 'disabled' : ''
    const analysis = analysisOpen ? `<div class="rr-analysis">${analysisHtml(idx)}</div>` : ''
    bar.innerHTML = `
      <div class="replay-remote">
        ${analysis}
        <div class="rr-bar">
          <span class="rr-progress">${idx}<i>/${n}수</i></span>
          <div class="rr-nav">
            <button class="rr-btn" data-act="replayFirst" ${disPrev} title="처음으로" aria-label="처음으로">⏮</button>
            <button class="rr-btn" data-act="replayPrev" ${disPrev} title="이전 수" aria-label="이전 수">◀</button>
            <button class="rr-btn rr-play ${playing ? 'active' : ''}" data-act="replayPlay" title="${playing ? '멈춤' : '재생'}" aria-label="${playing ? '멈춤' : '재생'}">${playing ? '⏸' : '▶'}</button>
            <button class="rr-btn" data-act="replayNext" ${disNext} title="다음 수" aria-label="다음 수">▶</button>
            <button class="rr-btn" data-act="replayLast" ${disNext} title="마지막으로" aria-label="마지막으로">⏭</button>
          </div>
          <button class="rr-btn rr-extra ${analysisOpen ? 'active' : ''}" data-act="replayToggleAnalysis" title="이 판 분석" aria-label="이 판 분석">${ICON.analysis}</button>
          <button class="rr-btn rr-extra rr-exit" data-act="replayExit" title="복기 종료" aria-label="복기 종료">✕</button>
        </div>
        <div class="rr-seek">
          <input type="range" data-ctl="replaySeek" min="0" max="${n}" step="1" value="${idx}" aria-label="복기 진행">
          <span class="rr-seek-val">${idx}/${n}</span>
        </div>
      </div>`
    for (const btn of Array.from(bar.querySelectorAll('button'))) {
      if (btn.hasAttribute('data-jump')) continue // 분석 항목은 아래에서 별도 처리
      if (btn.hasAttribute('disabled')) continue
      btn.addEventListener('click', () => host.onAction(btn.getAttribute('data-act')))
    }
    // 분석 요약 항목 클릭 → 그 수로 점프(보기 전용). 실수(data-best)면 직전 국면 + 추천 칸 강조.
    for (const el of Array.from(bar.querySelectorAll('[data-jump]'))) {
      el.addEventListener('click', () => {
        stopTimer()
        const jidx = Number(el.getAttribute('data-jump'))
        const bestAttr = el.getAttribute('data-best')
        if (bestAttr) {
          index = Math.max(0, jidx - 1) // 그 실수를 두기 직전(둘 차례) 국면
          recommendedCells = bestAttr.split('|').map((p) => {
            const [q, r] = p.split(',').map(Number)
            return { q: q!, r: r!, s: -q! - r! } as Hex
          })
        } else {
          index = jidx
          recommendedCells = null
        }
        host.render()
      })
    }
    const seek = bar.querySelector('input[data-ctl="replaySeek"]') as HTMLInputElement | null
    if (seek) {
      const val = bar.querySelector('.rr-seek-val') as HTMLElement | null
      seek.addEventListener('input', () => {
        if (val) val.textContent = `${Number(seek.value)}/${n}` // 드래그 중엔 숫자만 미리보기
      })
      seek.addEventListener('change', () => {
        stopTimer()
        index = Number(seek.value)
        host.render()
      })
    }
  }

  return {
    index: () => index,
    active: () => index !== null,
    recommended: () => recommendedCells,
    deactivate: () => {
      stopTimer()
      index = null
    },
    handle,
    renderInto,
  }
}
