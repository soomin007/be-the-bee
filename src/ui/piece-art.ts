// 게임 말(벌+원판) SVG 마크업 — design_handoff_bee_pieces 스펙(viewBox 0 0 200 210, 원판 중심 100,100 r80).
// game-ui.ts 의 보드 렌더러(절차적 DOM)와 "같은 도형"을 문자열로 만들어, 튜토리얼 등 정적 일러스트에서
// 재사용한다. 보드 렌더는 상호작용 훅(클래스·링·tilt) 때문에 imperative 를 유지 — 두 경로가 같은 스펙 공유.

export type PieceOwner = 'yellow' | 'brown'

// 한 SVG 안에 한 번만 넣으면 되는 그라데이션·클립 정의(벌 몸통/클립은 진영 공통, 원판색만 진영별).
export const PIECE_DEFS = `
  <radialGradient id="pa-disc-gold" cx="36%" cy="30%" r="80%">
    <stop offset="0%" stop-color="#dcb65e"/><stop offset="60%" stop-color="#d2a230"/><stop offset="100%" stop-color="#977523"/>
  </radialGradient>
  <radialGradient id="pa-disc-brown" cx="36%" cy="30%" r="80%">
    <stop offset="0%" stop-color="#8f6158"/><stop offset="60%" stop-color="#6f3529"/><stop offset="100%" stop-color="#50261e"/>
  </radialGradient>
  <radialGradient id="pa-body" cx="38%" cy="26%" r="78%">
    <stop offset="0%" stop-color="#ffd456"/><stop offset="52%" stop-color="#f4b70e"/><stop offset="100%" stop-color="#c8870a"/>
  </radialGradient>
  <clipPath id="pa-bodyclip" clipPathUnits="userSpaceOnUse"><ellipse cx="100" cy="111" rx="32" ry="46"/></clipPath>`

interface PieceOpt {
  queen?: boolean
  delay?: number // 등장 지연(ms). 지정하면 .tut-pop 팝인 애니메이션을 건다.
}

// 진영별 원판 옆면(두께)·림 색(테마 무관, game-ui 보드 렌더와 동일 값).
const DISC: Record<PieceOwner, { grad: string; side: string; rim: string }> = {
  yellow: { grad: 'pa-disc-gold', side: '#967216', rim: '#ecc659' },
  brown: { grad: 'pa-disc-brown', side: '#3f1f17', rim: '#9a5847' },
}

// 벌 본체(스펙 좌표). 원판 위에 공통으로 얹히는 부분 — 일반/여왕벌 공유.
const BEE_BODY = `
  <path d="M94 53 Q88 44 84 41" fill="none" stroke="#15100a" stroke-width="3.6" stroke-linecap="round"/>
  <path d="M106 53 Q112 44 116 41" fill="none" stroke="#15100a" stroke-width="3.6" stroke-linecap="round"/>
  <circle cx="83" cy="40" r="3.4" fill="#15100a"/>
  <circle cx="117" cy="40" r="3.4" fill="#15100a"/>
  <ellipse cx="100" cy="111" rx="32" ry="46" fill="url(#pa-body)" stroke="#9a6406" stroke-width="1.6"/>
  <g clip-path="url(#pa-bodyclip)">
    <path d="M26 100 Q100 109 174 100" fill="none" stroke="#1d150b" stroke-width="11"/>
    <path d="M28 119 Q100 128 172 119" fill="none" stroke="#1d150b" stroke-width="11"/>
    <path d="M56 162 L56 129 Q100 138 144 129 L144 162 Z" fill="#1d150b"/>
  </g>
  <ellipse cx="86" cy="92" rx="10" ry="15" fill="#ffffff" opacity="0.42"/>
  <ellipse cx="73" cy="105" rx="29" ry="12" fill="#fbfaf6" opacity="0.82" stroke="#d8c79a" stroke-width="1.4" transform="rotate(-40 73 105)"/>
  <ellipse cx="127" cy="105" rx="29" ry="12" fill="#fbfaf6" opacity="0.82" stroke="#d8c79a" stroke-width="1.4" transform="rotate(40 127 105)"/>
  <path d="M95 88 Q75 101 53 120" fill="none" stroke="#cdb988" stroke-width="1" opacity="0.6"/>
  <path d="M105 88 Q125 101 147 120" fill="none" stroke="#cdb988" stroke-width="1" opacity="0.6"/>
  <ellipse cx="100" cy="65" rx="20.5" ry="17.5" fill="#15100a"/>
  <ellipse cx="93" cy="58" rx="7" ry="5" fill="#ffffff" opacity="0.14"/>
  <circle cx="91" cy="59" r="3.9" fill="#ffffff"/>
  <circle cx="109" cy="59" r="3.9" fill="#ffffff"/>`

// 말 하나(원판+벌)를 (cx, cy) 에 그린다. discR = 원판 반지름(px, 게임은 HEX_SIZE*0.6).
// 스펙 좌표(100,109)→(cx,cy) 매핑(게임 렌더와 동일 — 원판이 타일에 얹힌 느낌, 벌은 위로 솟음).
// 위치는 바깥 <g> transform(속성)으로, 팝인은 안쪽 <g class="tut-pop">(CSS transform)으로 분리 —
// 둘 다 transform 이라 같은 노드에 두면 충돌(애니메이션이 위치 transform 을 덮어씀).
export function pieceMarkup(cx: number, cy: number, discR: number, owner: PieceOwner, opt: PieceOpt = {}): string {
  const s = discR / 80
  const tx = (cx - 100 * s).toFixed(2)
  const ty = (cy - 109 * s).toFixed(2)
  const d = DISC[owner]
  const queenRing = opt.queen ? `<circle cx="100" cy="100" r="71" fill="none" stroke="#cf2a1c" stroke-width="2.8"/>` : ''
  const crown = opt.queen
    ? `<text x="100" y="44" text-anchor="middle" dominant-baseline="central" font-size="30" fill="#ffe07a" stroke="#7a5410" stroke-width="0.6">♛</text>`
    : ''
  const popOpen = opt.delay !== undefined ? `<g class="tut-pop" style="animation-delay:${opt.delay}ms">` : '<g>'
  return `<g transform="translate(${tx} ${ty}) scale(${s.toFixed(4)})">${popOpen}
    <ellipse cx="100" cy="122" rx="80" ry="68" fill="#000000" opacity="0.16"/>
    <circle cx="100" cy="109" r="80" fill="${d.side}"/>
    <circle cx="100" cy="100" r="80" fill="url(#${d.grad})"/>
    <circle cx="100" cy="100" r="79" fill="none" stroke="${d.rim}" stroke-width="2.2" opacity="0.5"/>
    <ellipse cx="74" cy="72" rx="44" ry="31" fill="#ffffff" opacity="0.06"/>
    ${queenRing}
    <g>${BEE_BODY}${crown}</g>
  </g></g>`
}
