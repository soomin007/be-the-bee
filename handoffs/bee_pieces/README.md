# Handoff: Be the Bee — 게임 말(벌+원판) SVG 에셋

## Overview
`Be the Bee` 보드게임 말(실물: 갈색/노랑 원판 위에 꿀벌)을 디지털 게임 에셋용 SVG로 옮긴 디자인입니다.
진영은 **원판 색**으로 구분(갈색 vs 노랑), 그 위의 **꿀벌은 두 진영 공통**입니다. 여왕벌 변형(머리 위 왕관 + 원판 빨간 링)과
일반 말 두 종을 포함합니다. 기존 코드의 절차적 렌더러(`src/ui/game-ui.ts`)를 정리·고도화한 버전입니다.

## About the Design Files
말의 정답 모양은 이 폴더의 **`svg/` 4종**(일반·여왕벌 × 갈색·노랑)과 아래 hifi 스펙입니다. 게임에는 이미
이식돼 있고 **코드가 단일 출처**입니다: 2D 는 `src/ui/piece-art.ts`(`pieceMarkup`, `document.createElementNS`
로 SVG 생성), 3D 는 `src/ui/board3d.ts`. 색·좌표를 바꿀 때는 이 문서와 해당 코드를 함께 고치세요.
원본 파라미터화 프로토타입(`.dc.html` 들)은 구현 완료 후 정리했고, 스펙·SVG 만 남겼습니다.

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
다음 prop 으로 4종을 만듭니다(현재 코드 `pieceMarkup` 의 인자에 대응).

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

## Files (이 폴더)
- `svg/piece-brown.svg`, `svg/piece-gold.svg` — 일반 말(해상 완료, 바로 사용 가능)
- `svg/piece-brown-queen.svg`, `svg/piece-gold-queen.svg` — 여왕벌(왕관+빨간 링)
- `REALISTIC_BEE_BRIEF.md` — 사실적(실사) 3D 벌 제작 브리프(아래 3D 부록의 자매 문서)

> 구현 단일 출처는 코드입니다: 2D `src/ui/piece-art.ts`, 3D `src/ui/board3d.ts`.
> matte로 내보내려면 광택 두 ellipse(`cx74 cy72…`, `cx86 cy92…`)의 opacity를 0으로 두거나 제거하세요.

---

# 부록: 3D 버전 (`src/ui/board3d.ts` 에 구현)

위 2D SVG 말을 **three.js 메시**로 옮긴 3D 버전입니다. 같은 비례(SVG의 회전체)와 색을 따릅니다.
(실사 변형은 [`REALISTIC_BEE_BRIEF.md`](REALISTIC_BEE_BRIEF.md) 참고.)

## 의존성 & 컨트롤
- **three.js r0.149.0** UMD 빌드 하나만 사용(`unpkg.com/three@0.149.0/build/three.min.js`). OrbitControls 등 추가 모듈 없음.
- 카메라 회전/줌은 **자체 구현**(포인터 드래그 → 구면좌표 `theta/phi`, 휠 → `radius`). 코드베이스에 OrbitControls가 이미 있으면 교체해도 됨.
- `requestAnimationFrame` 루프에서 `autoRotate` 시 `theta` 증가.

## 씬 구성
- **원판**: `CylinderGeometry(2, 2, 0.6, 72)` + 가장자리 `TorusGeometry(1.93, 0.09)`(상단 y=0.3). 색은 2D와 동일하되 3D 조명 보정으로 갈색은 **`#542514`**(더 진하게), 노랑은 `#d2a230`.
- **벌**: SVG 벌의 **회전체**. body `SphereGeometry(1)` → `scale(0.8, 0.8, 1.15)`(장축 = z, 머리 +z / 꼬리 −z). 그룹 y=0.62라 몸통이 원판에 **~30% 매몰**.
- **줄무늬·꼬리**: 입체 없이 **캔버스 텍스처로 몸통에 칠함**(`makeBodyTexture()`). 64×512 캔버스, 노랑 `#f4b70e` 바탕에 검정 `#1d150b` — 두꺼운 띠 2개(v≈0.63, 0.45, 두께 48px) + 꼬리(v 0~0.28 솔리드). 구를 `rotateX(π/2)` 해 UV 극을 z축에 맞춤.
- **머리**: `SphereGeometry` → `scale(0.55,0.55,0.5)`, 중심 (0, 0.24, 0.98).
- **눈(평면)**: 머리 표면에 얹는 **평면 원반 스택**(릴리프 없음) — 검은 테두리 / 흰자 / 큰 검은 동공 / 작은 하이라이트. 그룹을 `scale(0.78,1,1)` 해 세로로 살짝 긴 타원. 표면 법선 방향으로 정렬(`setFromUnitVectors`).
- **더듬이**: 줄기 `CylinderGeometry`를 실제 방향 벡터로 정렬(`quaternion.setFromUnitVectors`)하고, 끝 공을 그 끝점에 배치(분리 방지).
- **날개**: 납작한 반투명 타원체(`SphereGeometry`→`scale(0.46,0.05,0.95)`, opacity 0.42). 뿌리는 머리쪽(+z)에 모이고 꼬리쪽(−z)으로 퍼지게 root→tip 벡터로 정렬.
- **여왕벌**: 머리 위 금색 띠 + 뿔(테두리 안쪽 radius 0.17) + 원판 빨간 링 `#cf2a1c`.

## Props (Tweaks)
| prop | 타입 | 기본 | 설명 |
|---|---|---|---|
| `faction` | enum `brown`/`gold` | brown | 원판 색 |
| `queen` | boolean | false | 왕관 + 빨간 링 |
| `autoRotate` | boolean | true | 자동 회전 |

> 주의: `data-props`의 `default`는 **에디터(Tweaks)용**이며 런타임 prop으로 자동 주입되지 않음 — 로직은 `this.props.x ?? 기본값`으로 폴백함.
> 실제 엔진 통합 시엔 메시를 한 번 만들고 진영/여왕벌만 머티리얼·자식 토글로 바꾸는 방식을 권장(매 변경마다 `buildPiece()` 재생성은 뷰어용).
