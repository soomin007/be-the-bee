# Handoff: Be the Bee — 게임 말(벌+원판) SVG 에셋

## Overview
`Be the Bee` 보드게임 말(실물: 갈색/노랑 원판 위에 꿀벌)을 디지털 게임 에셋용 SVG로 옮긴 디자인입니다.
진영은 **원판 색**으로 구분(갈색 vs 노랑), 그 위의 **꿀벌은 두 진영 공통**입니다. 여왕벌 변형(머리 위 왕관 + 원판 빨간 링)과
일반 말 두 종을 포함합니다. 기존 코드의 절차적 렌더러(`src/ui/game-ui.ts`)를 정리·고도화한 버전입니다.

## About the Design Files
이 번들의 HTML/SVG는 **디자인 레퍼런스**입니다 — 의도한 모양을 보여주는 산출물이지, 그대로 제품에 붙여 넣을 코드가 아닙니다.
다만 이 에셋은 본질적으로 **순수 SVG 도형**이므로 거의 그대로 이식 가능합니다. 대상 코드베이스
(`soomin007/be-the-bee`, TypeScript + Vite, `document.createElementNS`로 SVG를 그림)의 기존 패턴에 맞춰
재현하세요. 가장 자연스러운 통합 지점은 `src/ui/game-ui.ts`의 말 렌더 루프(현재 `circle.piece` + `ellipse` 조합으로
벌을 그리는 부분)를 아래 스펙으로 교체하는 것입니다.

## Fidelity
**High-fidelity (hifi).** 모든 좌표·색상·반지름·각도가 최종값입니다. viewBox `0 0 200 210` 기준 좌표를 그대로 쓰면 됩니다.

## 좌표계 / 빌드 블록 (viewBox `0 0 200 210`)
원판 중심 = (100, 100), 원판 반지름 = 80. 벌은 원판 위에 얹힘. 모든 도형은 **아래→위 순서(z 순서)** 로 그립니다.

### 1) 원판 (회전 안 함)
| 요소 | 도형 | 값 |
|---|---|---|
| 바닥 그림자 | ellipse | cx100 cy122 rx80 ry68 · `#000000` opacity 0.16 |
| 원판 두께(옆면) | circle | cx100 cy109 r80 · fill = **discSide** |
| 원판 윗면 | circle | cx100 cy100 r80 · fill = `radial-gradient(disc)` |
| 안쪽 림 하이라이트 | circle | cx100 cy100 r79 · stroke = **discRim** sw2.2 opacity0.5, fill none |
| 좌상단 광택(domed only) | ellipse | cx74 cy72 rx44 ry31 · `#ffffff` opacity 0.06 |
| 빨간 링(여왕벌/특수) | circle | cx100 cy100 **r71** · stroke = **ring** sw2.8, fill none |

`radial-gradient(disc)`: `cx38% cy30% r80%` → stop 0% **discLight**, 60% **discTop**, 100% **discDark**.

### 2) 벌 (그룹, `tilt`도 적용 시 `rotate(tilt 100 100)`)
| 요소 | 도형 | 값 |
|---|---|---|
| 더듬이 줄기 ×2 | path | `M94 53 Q88 44 84 41` / `M106 53 Q112 44 116 41` · stroke `#15100a` sw3.6 round |
| 더듬이 마디 ×2 | circle | (83,40) r3.4 / (117,40) r3.4 · `#15100a` |
| 몸통 | ellipse | cx100 cy111 **rx32 ry46** · fill `radial-gradient(body)` · stroke `#9a6406` sw1.6 |
| 줄무늬 1 (클립) | path | `M26 100 Q100 109 174 100` · stroke `#1d150b` **sw11** |
| 줄무늬 2 (클립) | path | `M28 119 Q100 128 172 119` · stroke `#1d150b` **sw11** |
| 꼬리(통검정, 클립) | path | `M56 162 L56 129 Q100 138 144 129 L144 162 Z` · fill `#1d150b` |
| 몸통 광택(domed only) | ellipse | cx86 cy92 rx10 ry15 · `#ffffff` opacity 0.42 |
| 왼쪽 날개 | ellipse | cx73 cy105 rx29 ry12 · `#fbfaf6` op0.82 · stroke `#d8c79a` sw1.4 · **transform rotate(-40 73 105)** |
| 오른쪽 날개 | ellipse | cx127 cy105 rx29 ry12 · `#fbfaf6` op0.82 · stroke `#d8c79a` sw1.4 · **transform rotate(40 127 105)** |
| 날개맥 ×2 | path | `M95 88 Q75 101 53 120` / `M105 88 Q125 101 147 120` · stroke `#cdb988` sw1 op0.6 |
| 머리 | ellipse | cx100 cy65 rx20.5 ry17.5 · `#15100a` |
| 머리 광택 | ellipse | cx93 cy58 rx7 ry5 · `#ffffff` op0.14 |
| 눈 ×2 | circle | (91,59) r3.9 / (109,59) r3.9 · `#ffffff` |
| 왕관(여왕벌) | text | x100 y44, anchor middle, central, font-size30, fill `#ffe07a`, stroke `#7a5410` sw0.6, glyph `♛` |

- 줄무늬·꼬리는 **몸통 실루엣에 클립**합니다: `clipPath = ellipse(cx100 cy111 rx32 ry46)`. 덕분에 줄무늬가
  몸 가장자리까지 이어지고(끊기지 않고), 꼬리는 줄무늬에서 이어지는 통검정으로 채워집니다.
- 날개는 **머리 아래 노란 어깨 칸에서 뿌리내려 뒤쪽 약 45°(rotate ±40)** 로 펼쳐지며, 몸통 위(z축 위)에 얹힙니다.
- `radial-gradient(body)`(진영 공통): `cx38% cy26% r78%` → 0% `#ffd456`, 52% `#f4b70e`, 100% `#c8870a`.

## Design Tokens — 진영별 원판 색
| 토큰 | 갈색(brown) | 노랑(gold) |
|---|---|---|
| discTop | `#6f3529` | `#d2a230` |
| discSide | `#3f1f17` | `#967216` |
| discRim | `#9a5847` | `#ecc659` |
| discLight (자동) | `#8f6158` | `#dcb65e` |
| discDark (자동) | `#50261e` | `#977523` |

`discLight = lighten(discTop, +0.22)`, `discDark = lighten(discTop, −0.28)`.
```js
function lighten(hex, amt){
  const h=hex.replace('#','');
  let r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);
  const f=c=>Math.max(0,Math.min(255,Math.round(amt>=0?c+(255-c)*amt:c*(1+amt))));
  return '#'+[f(r),f(g),f(b)].map(c=>c.toString(16).padStart(2,'0')).join('');
}
```

### 벌 공통 색
- 몸통 그라데이션 `#ffd456 → #f4b70e → #c8870a`, 몸통 외곽선 `#9a6406`
- 줄무늬·꼬리·머리·더듬이 `#1d150b` / 머리 `#15100a`
- 날개 `#fbfaf6` (opacity 0.82) · 날개 외곽선 `#d8c79a` · 날개맥 `#cdb988`
- 눈 `#ffffff` · 왕관 `#ffe07a`(stroke `#7a5410`) · 빨간 링 `#cf2a1c`

## Variants & Props
부모(`Be the Bee 게임 말.dc.html`)가 `BeePiece`에 넘기는 prop = 그대로 컴포넌트 API로 쓰면 됩니다.

| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `discTop` / `discSide` / `discRim` | color | 갈색값 | 원판 3색. `discLight/Dark` 미지정 시 `discTop`에서 자동 산출 |
| `discLight` / `discDark` | color | null→자동 | 원판 그라데이션 상/하 색 (override용) |
| `ring` | color | `''`(없음) | 값 있으면 원판 안쪽 빨간 링(r71) 표시. 여왕벌/특수 말 마커 |
| `queen` | boolean | false | 머리 위 왕관 표시 |
| `pieceStyle` | enum `domed`/`matte` | domed | `matte`면 광택 2개(원판/몸통) opacity = 0 |
| `tilt` | number(°) | 0 | 벌 전체 회전(실물 흩뿌린 느낌). 원판은 회전 안 함 |

조합: 일반 말 = `{queen:false, ring:''}`, 여왕벌 = `{queen:true, ring:'#cf2a1c'}`.

## Interactions & Behavior
이 에셋 자체는 정적입니다. 게임 통합 시 기존 동작을 유지하세요:
- **직전 둔 말** 강조(현재 코드: 원판 둘레 파란 링 `#2563eb`) — 빨간 여왕벌 링과 색이 겹치지 않게 유지.
- **놓기 팝(pop)** 애니메이션은 원판 그룹에 적용(현재 `.piece.pop`).
- `tilt`로 실물처럼 미세하게 흩뿌리려면 말마다 셀 좌표 해시 기반 ±25° 정도 결정값을 주면 됨(랜덤 아님 → 재렌더 안정).

## Assets
외부 이미지/폰트 0개 — 순수 SVG 도형 + 인라인 그라데이션. 왕관은 유니코드 글리프 `♛`(U+265B).

## Files (이 번들)
- `svg/piece-brown.svg`, `svg/piece-gold.svg` — 일반 말(해상 완료, 바로 사용 가능)
- `svg/piece-brown-queen.svg`, `svg/piece-gold-queen.svg` — 여왕벌(왕관+빨간 링)
- `BeePiece.dc.html` — 파라미터화된 원본 컴포넌트(템플릿 + 로직). 좌표/색 단일 출처.
- `Be the Bee 게임 말.dc.html` — 4종을 배치한 쇼케이스(부모가 prop 넘기는 예시).
- `support.js` — 위 .dc.html을 브라우저에서 바로 열기 위한 런타임(참고용, 제품엔 불필요).

> matte로 내보내려면 광택 두 ellipse(`cx74 cy72…`, `cx86 cy92…`)의 opacity를 0으로 두거나 제거하세요.
