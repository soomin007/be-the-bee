// 온라인 대전 UI(game-ui 분해 6단계) — Supabase 방 세션의 오케스트레이션 + 온라인 전용 화면.
// 방 수명주기(만들기/입장/재접속/나감), 선공·후공 협상(제안/수락/거절/코인토스), 재대국, 온라인
// 무르기 신호, 그리고 온라인 전용 모달(협상·알림·무르기 대기)과 상태줄/설정 버튼 HTML 을 소유한다.
// 게임 상태를 만지는 효과(스냅샷 적용·새 판 리셋·무르기 수행·infoModal 전환)는 host 콜백으로 위임.
// 넷코드 원시 계층(Supabase CRUD·실시간 구독)은 ../mp/room 이 담당 — 여기는 그 위의 조립층이다.
import { ICON } from './icons'
import { mpEnabled } from '../mp/supabase'
import { encodeSnapshot, decodeSnapshot, type GameSnapshot } from './game-save'
import {
  createRoom,
  joinRoom,
  getRoom,
  leaveRoom,
  deleteRoom,
  cleanupOldRooms,
  pushState,
  connectRoom,
  agreeStart,
  opposite,
  clientId,
  type Room,
  type RoomStatus,
  type RoomConn,
  type Side,
} from '../mp/room'
import type { GameState, Player } from '../engine/index'

export interface OnlineHost {
  /** 현재 판의 스냅샷(방에 올릴 때). */
  snapshot(): GameSnapshot
  /** 상대 수/모드 변경 스냅샷을 현재 판에 적용. */
  applySnapshot(s: GameSnapshot): void
  /** 현재 게임 상태(차례·모드 플래그 비교용, 읽기 전용으로 취급). */
  gameState(): GameState
  /** 새 판으로 리셋(방 만들기·재대국·나가기). */
  resetToFreshGame(): void
  /** 온라인은 로컬 AI 없이 사람 둘 — mode='hotseat' + AI 재구성. */
  enterHotseatMode(): void
  /** 상대의 모드 변경을 설정 토글 상태에도 반영. */
  setModeFlags(queen: boolean, infinite: boolean): void
  /** 무르기 사용권(각자 1회) 조회/사용 처리. */
  undoUsedFor(p: Player): boolean
  markUndoUsed(p: Player): void
  /** 한 수 되돌리기 실행(요청자 측에서 수행 후 스냅샷 push). */
  doUndo(): void
  /** 상대가 무르기를 요청 → 동의/거절 모달을 연다(undoAsk=side). */
  openUndoAsk(side: Player): void
  /** 요청자가 무르기 요청을 취소 → 열려 있던 동의 모달을 닫는다. */
  closeUndoAsk(): void
  /** 상대가 "한 판 더" 요청 → 예/아니오 모달. */
  openRematchAsk(): void
  /** infoModal 닫기(재대국 시작·나가기). */
  closeInfoModal(): void
  /** 결과 모달 닫기(재대국 요청 후 대기 화면으로). */
  dismissResultModal(): void
  /** 긍정 피드백 한 줄(✓ 초록). */
  setNotice(t: string): void
  /** 공유 코드/링크를 클립보드에 복사(실패 시 프롬프트). */
  shareCode(code: string): void
  /** 모달 마스코트(인라인 SVG). */
  beeSvg(): string
  render(): void
}

export interface OnlineUi {
  /** 방에 참가 중인가. */
  active(): boolean
  roomId(): string | null
  phase(): 'waiting' | 'negotiating' | 'playing' | null
  mySide(): Side | null
  /** 내가 무르기를 요청해 상대 동의를 기다리는 중인가(대기 모달). */
  undoReqPending(): boolean
  /** 지금이 "내 차례"인가(방 밖이면 항상 true). 대국 중 + 내 진영 차례여야 둘 수 있다. */
  myOnlineTurn(): boolean
  /** 내가 둔 수/모드 변경을 방에 반영(방 밖이면 무시). */
  pushCurrent(): void
  /** 방장: 새 판으로 방을 만든다(진영은 협상으로). */
  createRoom(): Promise<void>
  /** 상대: 코드로 입장(재접속이면 저장된 진영으로 바로 재개). */
  join(code: string): Promise<void>
  /** 선공/후공 제안: first(내가 선공)/second(내가 후공)/toss(코인토스). */
  proposeSide(choice: 'first' | 'second' | 'toss'): void
  acceptProposal(): void
  rejectProposal(): void
  /** "한 판 더" 요청(상대 수락 대기). */
  requestRematch(): void
  /** 상대의 재대국 요청 수락(신호 + 진영 교대 시작). */
  acceptRematch(): void
  /** 상대의 재대국 요청 거절(신호만, 모달 닫기는 호출자). */
  declineRematch(): void
  /** 온라인 무르기 요청(내가 방금 둔 수만, 각자 1회, 상대 동의 필요). */
  requestUndo(): void
  /** 상대의 무르기 요청에 동의(신호만 — 되돌리기는 요청자가 수행, 나는 구독으로 동기화). */
  grantUndo(): void
  /** 상대의 무르기 요청 거절(신호만). */
  denyUndo(): void
  /** 내 무르기 요청 취소(상대 모달도 닫게 신호). */
  cancelUndoReq(): void
  /** 나가기 확정: 상대에게 알리고 내 화면은 새 판으로 리셋. */
  leave(): void
  /** 로컬/AI/관전 새 판으로 가기 전 조용히 방을 떠난다(리셋은 호출자). */
  leaveForNew(): void
  /** 초대 링크를 클립보드에 복사. */
  copyInviteLink(): void
  /** 알림 팝업 닫기(확인 버튼). */
  clearMsg(): void
  /** 온라인 전용 모달(무르기 대기 > 알림 > 협상) HTML. 없으면 null. */
  modalHtml(): string | null
  /** 위 모달의 재렌더 가드 키(같으면 안 그림). 없으면 null. */
  modalKey(): string | null
  /** 보드 좌상단 상태줄의 온라인 한 줄(방 밖이면 ''). */
  statusLineHtml(): string
  /** 설정 패널의 온라인 대전 컨트롤(키 없으면 ''). */
  settingsCtlHtml(): string
  /** infoModal 이 여는 온라인 정적 모달 HTML. */
  staticModalHtml(kind: 'rematchAsk' | 'leaveConfirm' | 'newOnlineWarn'): string
}

export function createOnlineUi(host: OnlineHost): OnlineUi {
  // 온라인 대전 세션(방에 참가 중이면, 아니면 null).
  //  - phase: 'waiting'(상대 대기) → 'negotiating'(선공/후공 합의 중) → 'playing'(대국).
  //  - mySide: 합의로 정해진 내 진영(playing 부터 유효). 그 외 차례/협상 중엔 입력 잠금.
  //  - proposal: 진행 중인 선공/후공 제안(mine=내가 제안 / false=상대 제안받음).
  let online:
    | {
        roomId: string
        isHost: boolean
        phase: 'waiting' | 'negotiating' | 'playing'
        mySide: Side
        proposal: { hostSide: Side; mine: boolean; toss?: boolean } | null
        undoReq: boolean // 내가 무르기를 요청해 상대 동의를 기다리는 중(true 면 대기 모달).
        peerConnected: boolean // 상대가 지금 접속 중인지(presence). false 면 끊김 표시.
        status: RoomStatus
        conn: RoomConn
      }
    | null = null
  let onlineMsg: string | null = null // 알림 팝업(매칭 성공·상대 모드 변경·상대 나감). 확인 누르면 사라짐
  let lastSyncedSnapshot = '' // 방과 마지막으로 주고받은 스냅샷 코드 — 내 push 의 에코·중복 적용 방지
  let waitPollTimer: number | null = null // 방장 대기 중 상대 입장 폴링(실시간을 놓쳐도 잡는 안전망)

  // 초대 링크: 같은 주소 + #room=코드. 상대가 열면 자동 입장(mountGame 끝 해시 처리).
  function inviteUrl(roomId: string): string {
    if (typeof location === 'undefined') return roomId
    return `${location.origin}${location.pathname}#room=${roomId}`
  }
  // 진영 라벨(노랑=선공, 갈색=후공). 노랑이 항상 먼저 둔다.
  function sideLabel(side: Side): string {
    return side === 'yellow' ? '노랑(선공)' : '갈색(후공)'
  }
  function dayAgoIso(): string {
    return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  }
  function clearHash(): void {
    if (typeof location !== 'undefined' && location.hash) location.hash = ''
  }

  // 방장이 상대를 기다리는 동안, 실시간 입장 이벤트를 놓쳐도 잡도록 주기적으로 방을 확인한다.
  function startWaitPoll(roomId: string): void {
    stopWaitPoll()
    waitPollTimer = window.setInterval(() => {
      if (!online || online.phase !== 'waiting') {
        stopWaitPoll()
        return
      }
      void getRoom(roomId).then((room) => {
        if (room && room.status === 'negotiating' && online && online.phase === 'waiting') {
          stopWaitPoll()
          onRoomUpdate(room) // 매칭 처리(waiting→negotiating) 재사용
        }
      })
    }, 2500)
  }
  function stopWaitPoll(): void {
    if (waitPollTimer !== null) {
      clearInterval(waitPollTimer)
      waitPollTimer = null
    }
  }

  // 내가 둔 뒤 새 스냅샷을 방에 올린다. lastSyncedSnapshot 으로 내 push 의 에코를 무시한다.
  function pushCurrent(): void {
    if (!online) return
    const s = host.snapshot()
    const code = encodeSnapshot(s)
    lastSyncedSnapshot = code
    const status: RoomStatus = s.state.phase === 'finished' ? 'finished' : 'playing'
    online.status = status
    void pushState(online.roomId, code, status)
  }

  // 방 행이 바뀌면(상대 입장·수·모드 변경·나감) 호출.
  function onRoomUpdate(room: Room): void {
    if (!online) return
    // 상대가 나감: 알림 + 내 온라인 세션 종료(보드는 그대로 둬 마지막 국면을 본다). 방은 정리(삭제).
    if (room.status === 'left') {
      stopWaitPoll()
      void deleteRoom(online.roomId) // 둘 다 떠난 방이니 정리
      online.conn.close()
      online = null
      clearHash()
      onlineMsg = '상대가 방에서 나갔어요. 온라인 대전을 종료합니다.'
      host.render()
      return
    }
    // 매칭 성공: 대기 중이던 방에 상대가 들어옴(waiting → negotiating) → 선공/후공 협상 시작.
    if (online.status === 'waiting' && room.status === 'negotiating') {
      stopWaitPoll()
      online.phase = 'negotiating'
      onlineMsg = '상대가 들어왔어요! 이제 선공·후공을 정해요.'
    }
    // 합의가 DB 에 반영됨(상대가 수락) → 협상 신호를 놓쳤어도 여기서 안전하게 시작(동기화 복구).
    if (room.status === 'playing' && online.phase !== 'playing') {
      finalizeAgreement(room.host_side)
      return
    }
    online.status = room.status
    // 상대 수/모드 변경: 스냅샷이 내가 올린 것과 다르면 적용. 모드가 바뀌었으면 팝업으로 알림.
    if (room.snapshot && room.snapshot !== lastSyncedSnapshot) {
      lastSyncedSnapshot = room.snapshot
      const s = decodeSnapshot(room.snapshot)
      if (s) {
        const cur = host.gameState()
        if (s.state.queenEnabled !== cur.queenEnabled) {
          onlineMsg = `상대가 여왕벌 모드를 ${s.state.queenEnabled ? '켰어요' : '껐어요'}.`
        } else if (s.state.infiniteTiles !== cur.infiniteTiles) {
          onlineMsg = `상대가 무한 모드를 ${s.state.infiniteTiles ? '켰어요' : '껐어요'}.`
        }
        host.applySnapshot(s)
        host.setModeFlags(s.state.queenEnabled === true, s.state.infiniteTiles === true) // 토글 버튼 상태도 상대 변경에 맞춤
      }
    }
    host.render()
  }

  // 선공/후공 협상 신호(broadcast). DB 가 아니라 즉석 메시지로 주고받는다.
  function onSignal(event: string, payload: Record<string, unknown>): void {
    if (!online) return
    if (event === 'propose') {
      online.proposal = { hostSide: payload.hostSide as Side, mine: false, toss: payload.toss === true }
      host.render() // 협상 모달이 예/아니오 표시
    } else if (event === 'accept') {
      finalizeAgreement(payload.hostSide as Side)
    } else if (event === 'reject') {
      if (online.phase === 'playing') return // 이미 합의·시작됨 → 늦게 도착한 거절은 무시(동기화 깨짐 방지)
      online.proposal = null
      onlineMsg = '상대가 거절했어요. 다시 정해 주세요.'
      host.render()
    } else if (event === 'cancel') {
      if (online.phase === 'playing') return // 이미 합의·시작됨 → 늦은 취소 무시
      online.proposal = null // 상대가 자기 제안을 취소함
      host.render()
    } else if (event === 'rematchReq') {
      host.openRematchAsk() // 상대가 한 판 더 요청 → 예/아니오
      host.render()
    } else if (event === 'rematchOk') {
      startRematch()
    } else if (event === 'rematchNo') {
      onlineMsg = '상대가 한 판 더를 거절했어요.'
      host.render()
    } else if (event === 'undoReq') {
      // 상대가 무르기를 요청 → 동의/거절 모달(되돌릴 진영 = payload.side).
      if (online.phase !== 'playing') return
      host.openUndoAsk(payload.side as Player)
      host.render()
    } else if (event === 'undoOk') {
      // 내 무르기 요청을 상대가 동의 → 내가 한 수 되돌리고 스냅샷을 방에 반영(상대는 구독으로 동기화).
      if (!online.undoReq) return // 요청 중이 아니면 무시(지연/중복)
      online.undoReq = false
      host.markUndoUsed(online.mySide)
      host.doUndo()
      pushCurrent()
      host.setNotice('상대가 동의했어요. 한 수 물렀습니다.')
      host.render()
    } else if (event === 'undoNo') {
      if (!online.undoReq) return
      online.undoReq = false
      onlineMsg = '상대가 무르기를 거절했어요.'
      host.render()
    } else if (event === 'undoCancel') {
      // 요청자가 취소 → 내 동의 모달을 닫는다(열려 있을 때만 — host 가 확인).
      host.closeUndoAsk()
    }
  }

  function enterOnline(roomId: string, isHost: boolean, phase: 'waiting' | 'negotiating' | 'playing', mySide: Side): void {
    host.enterHotseatMode() // 온라인은 로컬 AI 없이 사람 둘. aiControls=false 가 되게.
    online = {
      roomId,
      isHost,
      phase,
      mySide,
      proposal: null,
      undoReq: false,
      peerConnected: phase !== 'waiting', // 협상/대국 단계면 상대가 방금 있었음(presence 가 곧 갱신)
      status: phase === 'waiting' ? 'waiting' : phase === 'negotiating' ? 'negotiating' : 'playing',
      conn: connectRoom(roomId, onRoomUpdate, onSignal, onPeer),
    }
    if (online.phase === 'waiting') startWaitPoll(roomId) // 상대 입장 폴링 안전망
    if (typeof location !== 'undefined') location.hash = `room=${roomId}`
  }

  // 상대 presence 변화(접속/끊김). 탭 닫힘·네트워크 끊김을 자동 감지한다.
  // 팝업은 새로고침 등으로 깜빡일 수 있어 안 띄우고, 보드 HUD 의 '상대 연결 끊김' 표시로만 반영한다.
  function onPeer(present: boolean): void {
    if (!online) return
    online.peerConnected = present
    host.render()
  }

  // 방장: 새 판으로 방을 만든다. 진영은 상대 입장 후 협상으로 정한다(host_side 는 임시 yellow).
  async function createOnlineRoom(): Promise<void> {
    if (!mpEnabled) {
      onlineMsg = '온라인 기능이 아직 설정되지 않았어요.'
      host.render()
      return
    }
    host.resetToFreshGame()
    const code0 = encodeSnapshot(host.snapshot())
    lastSyncedSnapshot = code0
    try {
      void cleanupOldRooms(dayAgoIso()) // 오래된 방 정리(테이블 가볍게)
      const room = await createRoom(code0, 'yellow')
      enterOnline(room.id, true, 'waiting', 'yellow')
      const url = inviteUrl(room.id)
      // 자동 복사(따로 복사 버튼 찾을 필요 없이 바로 붙여넣기). writeText 는 Promise 라 권한 거부 시
      // catch 가 아닌 rejection 으로 새므로 .catch 로도 막는다(불가 환경은 아래 팝업 링크로 직접 복사).
      try {
        void navigator.clipboard?.writeText(url).catch(() => {})
      } catch {
        /* navigator.clipboard 자체가 없는 환경 */
      }
      onlineMsg = `방을 만들고 초대 링크를 복사했어요!\n${url}\n상대에게 붙여넣어 보내세요. 들어오면 선공·후공을 정해요.\n\n두 명이 같이 접속해 있지 않아도 돼요. 이 기기에서 같은 링크로 다시 들어오면 이어서 둘 수 있고, 방은 마지막으로 둔 뒤 24시간 동안 유지돼요.`
      host.render()
    } catch (e) {
      onlineMsg = '방 만들기 실패: ' + (e as Error).message
      host.render()
    }
  }

  // 상대: 코드로 입장 → 방장의 현재 판으로 맞추고 협상 단계로.
  async function join(code: string): Promise<void> {
    if (!mpEnabled) {
      onlineMsg = '온라인 기능이 아직 설정되지 않았어요(서버 키 없음).'
      host.render()
      return
    }
    try {
      const room = await joinRoom(code.trim().toUpperCase())
      if (!room) {
        onlineMsg = '그 방을 찾지 못했어요. 코드를 다시 확인하세요.'
        clearHash()
        host.render()
        return
      }
      // 만석: 이미 두 명(방장+상대)이 들어찼고 내가 그중 하나가 아니면 입장 거절(관전 미지원).
      // 코드를 여러 곳에 뿌려 3명+가 들어와도 두 사람만 두고 desync 안 나게.
      const me = clientId()
      if (room.host_id !== me && room.guest_id !== me && room.guest_id != null) {
        onlineMsg = '이 방은 이미 두 명이 들어차 있어요.\n두 명까지만 둘 수 있어요(관전은 아직 없어요).'
        clearHash() // 새로고침 재시도 방지
        host.render()
        return
      }
      lastSyncedSnapshot = room.snapshot
      const s = decodeSnapshot(room.snapshot)
      if (s) {
        host.applySnapshot(s)
        host.setModeFlags(s.state.queenEnabled === true, s.state.infiniteTiles === true)
      }
      const isHost = room.host_id === clientId() // 보통 false(게스트), 방장 재접속이면 true
      if (room.status === 'playing' || room.status === 'finished') {
        // 이미 합의된 방에 재접속 → 협상 건너뛰고 저장된 진영으로 바로 재개.
        const side: Side = isHost ? room.host_side : opposite(room.host_side)
        enterOnline(room.id, isHost, 'playing', side)
        onlineMsg = `다시 연결됐어요. 당신은 ${sideLabel(side)}. 이어서 둬요.`
      } else {
        // 신규 매칭(또는 협상 중 재접속) → 선공·후공부터.
        enterOnline(room.id, isHost, 'negotiating', 'yellow')
        onlineMsg = '방에 입장했어요! 매칭 성공. 이제 선공·후공을 정해요.'
      }
      host.render()
    } catch (e) {
      onlineMsg = '입장 실패: ' + (e as Error).message
      host.render()
    }
  }

  // 선공/후공 제안: choice = first(내가 선공)/second(내가 후공)/toss(코인토스).
  function proposeSide(choice: 'first' | 'second' | 'toss'): void {
    if (!online) return
    const iAmFirst = choice === 'toss' ? Math.random() < 0.5 : choice === 'first'
    const myColor: Side = iAmFirst ? 'yellow' : 'brown' // 노랑=선공
    const hostSide: Side = online.isHost ? myColor : opposite(myColor)
    const toss = choice === 'toss'
    online.proposal = { hostSide, mine: true, toss }
    online.conn.signal('propose', { hostSide, toss }) // 상대도 코인토스였음을 알도록 플래그 동기화
    host.render()
  }

  function acceptProposal(): void {
    if (!online || !online.proposal) return
    const hostSide = online.proposal.hostSide
    online.conn.signal('accept', { hostSide })
    finalizeAgreement(hostSide)
  }

  function rejectProposal(): void {
    if (!online || !online.proposal) return
    const wasMine = online.proposal.mine
    online.proposal = null
    online.conn.signal(wasMine ? 'cancel' : 'reject') // 내 제안 취소 vs 상대 제안 거절
    host.render()
  }

  // 합의 완료: 내 진영 확정 + 대국 시작. 방장은 host_side+status=playing 을 방에 저장(재접속 대비).
  function finalizeAgreement(hostSide: Side): void {
    if (!online) return
    const wasToss = online.proposal?.toss === true // 동의 시점에 결과 공개(코인토스였으면)
    online.mySide = online.isHost ? hostSide : opposite(hostSide)
    online.proposal = null
    online.phase = 'playing'
    online.status = 'playing'
    // 양쪽 다 DB 에 합의를 기록 → DB(room.status=playing+host_side)가 합의의 단일 진실.
    // 신호(broadcast)가 유실돼도 상대는 onRoomUpdate 에서 이걸 보고 안전하게 시작한다.
    void agreeStart(online.roomId, hostSide)
    onlineMsg = wasToss
      ? `🪙 코인토스 결과 — 당신은 ${sideLabel(online.mySide)}! 시작합니다!`
      : `선공·후공이 정해졌어요. 당신은 ${sideLabel(online.mySide)}. 시작합니다!`
    host.render()
  }

  // 재대국 요청("한 판 더"): 상대에게 신호 + 대기.
  function requestRematch(): void {
    if (!online) return
    online.conn.signal('rematchReq')
    host.dismissResultModal() // 결과 모달은 닫고
    onlineMsg = '한 판 더를 요청했어요. 상대 수락을 기다려요.'
    host.render()
  }
  // 재대국 시작: 새 판 + 진영 스왑. 방장이 방에 새 스냅샷·host_side 반영.
  function startRematch(): void {
    if (!online) return
    const curHostSide: Side = online.isHost ? online.mySide : opposite(online.mySide)
    const newHostSide = opposite(curHostSide) // 진영 교대
    host.resetToFreshGame()
    online.mySide = online.isHost ? newHostSide : opposite(newHostSide)
    online.phase = 'playing'
    online.status = 'playing'
    online.proposal = null
    online.undoReq = false
    host.closeInfoModal()
    lastSyncedSnapshot = encodeSnapshot(host.snapshot())
    if (online.isHost) {
      void agreeStart(online.roomId, newHostSide)
      pushCurrent()
    }
    onlineMsg = `한 판 더! 진영을 바꿔서 당신은 ${sideLabel(online.mySide)}. 시작합니다!`
    host.render()
  }

  // 나가기 확정: 상대에게 알리고(방 status=left) 내 화면은 완전히 새 판으로 리셋.
  function leave(): void {
    stopWaitPoll()
    if (online) {
      void leaveRoom(online.roomId)
      online.conn.close()
    }
    online = null
    host.closeInfoModal()
    clearHash()
    host.resetToFreshGame()
    host.setNotice('온라인 방에서 나왔어요.')
    host.render()
  }

  // 로컬/AI/관전 새 판으로 가기 전, 온라인 방에 있으면 떠난다(상대에게 알리고 세션 종료).
  function leaveForNew(): void {
    if (!online) return
    stopWaitPoll()
    void leaveRoom(online.roomId)
    online.conn.close()
    online = null
    clearHash()
  }

  // ---- 온라인 전용 화면(HTML) ----------------------------------------------

  // 매칭 후 선공·후공 합의. 제안 전이면 버튼, 내가 제안했으면 대기, 상대가 제안했으면 예/아니오.
  function negotiateHtml(): string {
    if (!online) return ''
    const p = online.proposal
    // 코인토스는 "둘이 동의하면 결과 무조건 수용". 그래서 동의 전에는 결과를 양쪽 다 보여주지 않는다
    // (결과를 보고 무르는 것을 원천 차단). 동의하면 finalizeAgreement 가 결과를 알려준다.
    let body: string
    if (p === null) {
      body = `
        <div class="modal-sub">매칭 성공! 선공·후공을 정해요. 누가 먼저 둘까요?</div>
        <div class="modal-actions online-side">
          <button data-act="proposeFirst">🟡 내가 선공 · 노랑</button>
          <button data-act="proposeSecond">🟤 내가 후공 · 갈색</button>
          <button class="modal-share" data-act="proposeToss">🪙 코인토스(무작위)</button>
        </div>
        <div class="nego-hint">또는 상대가 정할 때까지 기다려요.</div>`
    } else if (p.mine) {
      const myColor = online.isHost ? p.hostSide : opposite(p.hostSide)
      body = p.toss
        ? `
        <div class="modal-sub">🪙 코인토스를 제안했어요. 상대가 동의하면 무작위로 정해지고, 그 결과는 그대로 시작돼요.<br>상대의 응답을 기다리는 중…</div>
        <div class="modal-actions">
          <button data-act="rejectSide">${ICON.close} 제안 취소</button>
        </div>`
        : `
        <div class="modal-sub">내 제안: <b>내가 ${sideLabel(myColor)}</b><br>상대의 응답을 기다리는 중…</div>
        <div class="modal-actions">
          <button data-act="rejectSide">${ICON.close} 제안 취소</button>
        </div>`
    } else {
      const myColor = online.isHost ? p.hostSide : opposite(p.hostSide)
      body = p.toss
        ? `
        <div class="modal-sub">🪙 상대가 코인토스를 제안했어요. 동의하면 무작위로 정해지고, <b>그 결과는 그대로 시작</b>돼요.</div>
        <div class="modal-actions">
          <button data-act="acceptSide">${ICON.check} 코인토스 동의</button>
          <button data-act="rejectSide">${ICON.close} 다른 방식</button>
        </div>`
        : `
        <div class="modal-sub">상대가 제안했어요. <b>당신은 ${sideLabel(myColor)}</b>.<br>이대로 시작할까요?</div>
        <div class="modal-actions">
          <button data-act="acceptSide">${ICON.check} 예, 시작</button>
          <button data-act="rejectSide">${ICON.close} 아니오</button>
        </div>`
    }
    return `
      <div class="modal-backdrop">
        <div class="modal-card">
          ${host.beeSvg()}
          <div class="modal-title">🐝 선공·후공 정하기</div>
          ${body}
        </div>
      </div>`
  }

  // 온라인: 내가 무르기를 요청하고 상대 동의를 기다리는 대기 모달(취소 가능).
  function undoWaitHtml(): string {
    return `
      <div class="modal-backdrop">
        <div class="modal-card">
          ${host.beeSvg()}
          <div class="modal-title">↩ 무르기 요청함</div>
          <div class="modal-sub">상대에게 무르기를 요청했어요.<br>상대가 동의하면 한 수 물러요. 잠시 기다려 주세요.</div>
          <div class="modal-actions">
            <button data-act="undoCancelReq">${ICON.close} 요청 취소</button>
          </div>
        </div>
      </div>`
  }

  // 온라인 알림 팝업(매칭 성공·상대 모드 변경·상대 나감).
  function msgHtml(msg: string): string {
    return `
      <div class="modal-backdrop">
        <div class="modal-card">
          ${host.beeSvg()}
          <div class="modal-sub">${msg.replace(/\n/g, '<br>')}</div>
          <div class="modal-actions">
            <button data-act="onlineMsgOk">${ICON.check} 확인</button>
          </div>
        </div>
      </div>`
  }

  function myOnlineTurn(): boolean {
    return online === null || (online.phase === 'playing' && host.gameState().turn === online.mySide)
  }

  return {
    active: () => online !== null,
    roomId: () => online?.roomId ?? null,
    phase: () => online?.phase ?? null,
    mySide: () => online?.mySide ?? null,
    undoReqPending: () => online?.undoReq === true,
    myOnlineTurn,
    pushCurrent,
    createRoom: createOnlineRoom,
    join,
    proposeSide,
    acceptProposal,
    rejectProposal,
    requestRematch,
    acceptRematch: () => {
      if (online) online.conn.signal('rematchOk')
      startRematch()
    },
    declineRematch: () => {
      if (online) online.conn.signal('rematchNo')
    },
    requestUndo: () => {
      // 온라인: 내가 방금 둔 수(=지금 상대 차례)만 무를 수 있다. 상대 동의 필요, 각자 1회.
      if (!online || online.phase !== 'playing') return
      if (host.gameState().turn === online.mySide) {
        host.setNotice('내 차례에는 무를 수 없어요. 내가 둔 직후(상대 차례)에 무르기를 요청하세요.')
        return
      }
      if (host.undoUsedFor(online.mySide)) {
        host.setNotice('무르기를 이미 썼어요(각자 한 번만).')
        return
      }
      if (online.undoReq) return // 이미 요청 중
      online.undoReq = true
      online.conn.signal('undoReq', { side: online.mySide }) // 상대 화면에 동의 모달
    },
    grantUndo: () => {
      // 온라인 동의: 되돌리기는 요청자가 수행+스냅샷 push 하고, 나는 구독으로 동기화된다(이중 되돌리기 방지).
      if (online) online.conn.signal('undoOk')
    },
    denyUndo: () => {
      if (online) online.conn.signal('undoNo')
    },
    cancelUndoReq: () => {
      // 요청자가 대기 중 취소 → 상대 모달도 닫게 신호.
      if (online && online.undoReq) {
        online.undoReq = false
        online.conn.signal('undoCancel')
        host.setNotice('무르기 요청을 취소했어요.')
      }
    },
    leave,
    leaveForNew,
    copyInviteLink: () => {
      if (online) host.shareCode(inviteUrl(online.roomId))
    },
    clearMsg: () => {
      onlineMsg = null
    },
    modalHtml: () => {
      if (online && online.undoReq) return undoWaitHtml()
      if (onlineMsg !== null) return msgHtml(onlineMsg)
      // 매칭 후 선공/후공 협상 중이면(알림 팝업 닫은 뒤) 협상 모달을 띄운다.
      if (online && online.phase === 'negotiating') return negotiateHtml()
      return null
    },
    modalKey: () => {
      if (online && online.undoReq) return 'undoWait'
      if (onlineMsg) return `msg:${onlineMsg}`
      if (online && online.phase === 'negotiating')
        return `nego:${online.proposal ? `${online.proposal.hostSide}:${online.proposal.mine}:${online.proposal.toss ?? ''}` : 'none'}`
      return null
    },
    statusLineHtml: () => {
      if (!online) return ''
      if (online.phase !== 'waiting' && !online.peerConnected)
        return `<div class="online-status wait-turn">⚠️ 상대 연결 끊김 · 방 ${online.roomId}</div>`
      return `<div class="online-status ${myOnlineTurn() && online.phase === 'playing' ? 'my-turn' : 'wait-turn'}">${
        online.phase === 'waiting'
          ? `🔗 방 ${online.roomId} · 상대를 기다리는 중…<div class="online-hint">지금 창을 닫아도 괜찮아요. 이 기기에서 같은 링크로 다시 오면 이어서 둘 수 있어요.</div>`
          : online.phase === 'negotiating'
            ? `🤝 방 ${online.roomId} · 선공·후공 정하는 중`
            : myOnlineTurn()
              ? `🟢 내 차례 · 방 ${online.roomId}`
              : `⏳ 상대 차례 · 방 ${online.roomId}`
      }</div>`
    },
    settingsCtlHtml: () => {
      // 온라인 대전 컨트롤: 키가 설정돼 있을 때만(mpEnabled). 방 안이면 초대 링크/나가기, 밖이면 만들기/입장.
      if (!mpEnabled) return ''
      return online
        ? `<div class="settings-divider"></div>
        <div class="settings-group-label">온라인 대전 · 방 ${online.roomId}</div>
        <button data-act="onlineCopyLink" title="초대 링크를 복사해 상대에게 보내기">${ICON.share} 초대 링크 복사</button>
        <button data-act="onlineLeave">${ICON.exit} 나가기</button>`
        : `<div class="settings-divider"></div>
        <div class="settings-group-label">온라인 대전</div>
        <button data-act="onlineHost" title="방을 만들어 초대 링크로 친구를 부르기">${ICON.plus} 방 만들기</button>
        <button data-act="onlineJoin" title="받은 방 코드로 입장">${ICON.enter} 코드로 입장</button>`
    },
    staticModalHtml: (kind) => {
      // 상대가 "한 판 더" 요청 → 진영 바꿔 다시 시작 동의.
      if (kind === 'rematchAsk')
        return `
      <div class="modal-backdrop">
        <div class="modal-card">
          ${host.beeSvg()}
          <div class="modal-title">🔄 한 판 더?</div>
          <div class="modal-sub">상대가 한 판 더 두고 싶어해요. 진영을 바꿔 다시 시작할까요?</div>
          <div class="modal-actions">
            <button data-act="rematchYes">${ICON.refresh} 예, 한 판 더</button>
            <button data-act="rematchNo">${ICON.close} 아니오</button>
          </div>
        </div>
      </div>`
      // 나가기 전 확인.
      if (kind === 'leaveConfirm')
        return `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-title">방에서 나갈까요?</div>
          <div class="modal-sub">나가면 진행 중인 온라인 게임이 끝나고 상대에게도 알려져요. 내 화면은 새 게임으로 초기화됩니다.</div>
          <div class="modal-actions">
            <button data-act="leaveYes">${ICON.exit} 나가기</button>
            <button data-act="leaveNo">${ICON.check} 계속하기</button>
          </div>
        </div>
      </div>`
      // 온라인 대전 중 "새 게임"을 누르면 방에서 나가게 되므로 먼저 경고.
      return `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-title">새 게임을 시작할까요?</div>
          <div class="modal-sub">지금 온라인 대전 중이에요. 새 게임을 시작하면 이 방에서 나가게 되고 상대에게도 알려져요.<br>다시 두려면 같은 초대 링크가 필요해요.</div>
          <div class="modal-actions">
            <button data-act="newWarnYes">${ICON.refresh} 새 게임 시작</button>
            <button data-act="newWarnNo">${ICON.check} 계속 두기</button>
          </div>
        </div>
      </div>`
    },
  }
}
