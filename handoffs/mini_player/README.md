# Handoff: 코너 음악 미니 플레이어 (Be the Bee)

## Overview
게임 화면 귀퉁이(기본 우하단)에 상시 떠 있는 배경음악(BGM) 미니 플레이어. 두 가지 상태를 가진다:
- **펼침(expanded)** — 아트워크 + 곡 정보 + 진행바 + 트랜스포트 + 볼륨까지 갖춘 카드.
- **접힘(collapsed)** — 곡명과 재생/정지만 보여주는 알약(pill). 게임 화면을 가리지 않게 최소화한 형태.

`Be the Bee` 의 호박/꿀빛 테마(설정 패널과 동일 언어)를 그대로 따른다.

## About the Design Files
이 문서는 미니 플레이어의 **디자인 사양(토큰·컴포넌트·상태·동작)** 이다. 게임에는 이미 구현돼 있고
**코드가 단일 출처**다(`src/ui/game-ui.ts` 의 미니 플레이어 렌더, TypeScript + 순수 DOM). 실제 `<audio>`/
오디오 엔진, 곡 목록, 기존 사운드 설정(BGM 볼륨/음소거)과 연결돼 있다. 색·간격을 바꿀 때는 이 문서와
그 코드를 함께 고치면 된다. 원본 HTML 프로토타입(`mini_player_reference.dc.html`)은 구현 완료 후 정리했다.

## Fidelity
**High-fidelity (hifi).** 색·타이포·간격·라운드·그림자·상호작용이 최종값이다. 아래 디자인 토큰과 컴포넌트 스펙대로 픽셀에 가깝게 재현하되, 마크업/스타일은 코드베이스의 기존 패턴(현재는 인라인 스타일 + `style.css`)에 맞춰도 된다.

## Screens / Views

### 1. 펼침 카드 (expanded)
- **Purpose**: 현재 곡 확인 + 재생 제어 + 볼륨 조절.
- **Layout**: `position: absolute; bottom: 26px; right: 26px;` 코너 고정. 너비 **300px**, 라운드 **18px**, 배경 `linear-gradient(180deg,#fffdf7,#fdf6e6)`, 보더 `1px solid #e6dcc3`, 그림자 `0 14px 44px rgba(120,90,20,.2)`, `overflow:hidden`.
- **Components**:
  1. **상단 바(헤더)**: 패딩 `.6rem .8rem`, 배경 `linear-gradient(180deg,#fdeecb,#f6dfa3)`, 하단 보더 `1px solid #ecd9a6`, `box-shadow: inset 0 1px 0 #fffdf8`. 좌측 music 라인 아이콘(16px, stroke `#b8860b`) + 라벨 "지금 재생 중"(`.74rem/800/letter-spacing .1em`, 색 `#7a560a`). 우측 **접기 버튼**(24px, 라운드 7px, 배경 `rgba(122,86,10,.12)`, hover `.22`) 안에 chevron-down 아이콘.
  2. **아트워크**: 60×66px 육각형(honeycomb) SVG. 채움 `linear-gradient #f9d666→#e0a92a`, 보더 `#c2982f 2px`, 안쪽에 옅은(`#fff7df` opacity .7) 작은 육각 + 중앙 벌 글리프(stroke `#7a560a`). `drop-shadow(0 4px 8px rgba(150,110,30,.28))`. 재생 중에는 `spinhex 9s linear infinite`(transform-origin 중심)로 천천히 회전.
  3. **곡 메타**: 제목 `1rem/700`, 색 `#3a2c0c`, 한 줄 ellipsis. 아티스트 `.8rem`, 색 `#9a7a3a`. 재생 중이면 아래에 **이퀄라이저** 4개 바(폭 3px, 높이 13px, 라운드 2px, 색 `#e0a92a`, `bardance .9s ease-in-out infinite` 를 0/.15/.3/.45s 지연, `transform-origin:bottom`).
  4. **진행바(seek)**: 높이 6px, 트랙 `#ece0c2`(inset shadow), 채움 `linear-gradient(90deg,#f3c34a,#e0a92a)`, 너비 = 진행률%. 핸들 13px 흰 원 + `#e0a92a` 2px 보더, 채움 끝에 위치. 클릭 위치로 seek. 아래 시간 라벨 좌(현재)/우(전체) `.7rem`, 색 `#9a7a3a`, `font-variant-numeric: tabular-nums`, `m:ss` 형식.
  5. **트랜스포트 행** (가운데 정렬, gap `.6rem`):
     - 셔플(34px, 라운드 10px): off `transparent/#b89a55`, on `linear-gradient(180deg,#f3c34a,#e0a92a)/#5a3a14`.
     - 이전(38px, 라운드 11px, 카드 배경 `linear-gradient(180deg,#fffdf7,#fdf5e4)`, 보더 `#ecdfbe`, hover 보더 `#d9c89a`) — prev 아이콘(fill).
     - **재생/정지 (메인)** 54px, 라운드 16px, 배경 `linear-gradient(180deg,#fde68a,#f3c34a)`, 보더 `#eab308`, 색 `#7a560a`, 그림자 `0 5px 14px rgba(200,150,20,.34)`, hover `brightness(1.04)`. 재생 중엔 ⏸(두 막대), 정지 상태엔 ▶(삼각형, `margin-left:2px`).
     - 다음(38px) — next 아이콘.
     - 반복(34px) — 셔플과 동일한 on/off 토큰.
  6. **볼륨 행**: 상단 `border-top:1px solid #efe3c6`, 패딩탑 `.85rem`. 좌측 **음소거 버튼**(30px, 라운드 9px, 보더 `#ecdfbe`, 배경 `#fffdf7`, 색 `#c2982f`): 음소거면 speaker-x(stroke `#b89a55`), 아니면 speaker-on. 가운데 볼륨 슬라이더(높이 5px, 진행바와 동일 토큰). 우측 라벨 `.7rem`(`{n}%` 또는 "음소거"), 폭 2.1rem 우측정렬, tabular-nums.

### 2. 접힘 알약 (collapsed)
- **Purpose**: 최소화. 곡명과 재생 토글만.
- **Layout**: 같은 코너(`bottom:26px; right:26px`). `display:flex; align-items:center; gap:.6rem;` 패딩 `.5rem .85rem .5rem .5rem`, 라운드 **99px(알약)**, 배경 `linear-gradient(180deg,#fffdf7,#fdf6e6)`, 보더 `#e6dcc3`, 그림자 `0 10px 30px rgba(120,90,20,.2)`(hover 시 강화). 클릭하면 펼침으로 전환.
- **Components**: 좌측 **회전 디스크** 38px 원(배경 `linear-gradient(180deg,#f9d666,#e0a92a)`, 재생 중 `spinhex` 회전) + 벌 글리프(stroke `#7a560a`). 가운데 곡명(`.82rem/700/#3a2c0c`, max 120px ellipsis)과 그 아래 재생 중이면 미니 이퀄라이저 3바(높이 9px), 정지면 "일시정지"(`.68rem/#9a7a3a`). 우측 작은 재생/정지 원(30px, 배경 `#fde68a`, 색 `#7a560a`) — 이 버튼 클릭은 `stopPropagation` 으로 알약 펼침과 분리.

## Interactions & Behavior
- **접기/펼치기**: 헤더 chevron → 접힘. 알약 본체 클릭 → 펼침. 알약의 재생버튼 클릭은 펼침 안 됨(이벤트 버블 차단).
- **재생/정지**: `playing` 토글. 메인/알약 버튼 공유.
- **이전·다음**: 트랙 인덱스 순환(`(idx ± 1 + n) % n`), `cur` 0으로 리셋.
- **진행/볼륨 스크럽**: 트랙 바 클릭 → `clientX` 와 `getBoundingClientRect()` 로 0~1 비율 계산. 진행바는 `cur = f * dur`, 볼륨은 `vol = f` 이며 동시에 음소거 해제.
- **음소거**: `muted` 토글. 아이콘과 라벨 전환.
- **셔플/반복**: 토글 상태에 따라 골드 채움(active) ↔ 투명(off). 반복 on이면 곡 끝에서 같은 곡 0초로, off면 다음 곡으로.
- **타이머(데모)**: 1초마다 `cur += 1`(재생 중일 때만). `cur >= dur` 도달 시 반복/다음 처리. → **실제 구현에선 `<audio>` 의 `timeupdate`/`ended` 이벤트로 대체.**
- **애니메이션**: `bardance`(이퀄라이저, scaleY .35↔1, .9s ease-in-out 무한, 바별 지연), `spinhex`(아트워크/디스크, 9s linear 무한, 재생 중에만). 전환 효과는 transition `.12~.18s`.

## State Management
| 상태 | 타입 | 설명 |
|---|---|---|
| `expanded` | bool | 펼침/접힘 |
| `playing` | bool | 재생 여부 |
| `muted` | bool | 음소거 |
| `vol` | 0~1 | 볼륨 |
| `cur` | number(초) | 현재 재생 위치 |
| `idx` | number | 현재 곡 인덱스 |
| `shuffle` | bool | 셔플 |
| `repeat` | bool | 한 곡 반복 |

- 곡 목록: `{ title, artist, dur(초) }[]`. 프로토타입은 3곡(꿀벌의 춤 / 벌집 자장가 / 황금 들판, "Be the Bee OST").
- **연결 지점**: `vol`/`muted` 는 기존 사운드 설정의 BGM 볼륨과 단일 소스로 묶을 것. `playing` 은 실제 오디오 엘리먼트와 동기화. 위치 영속화가 필요하면 `localStorage`(직접 쓴 키만).
- **포맷터**: `fmt(s) → "m:ss"` (`Math.floor(s/60)` + `:` + `String(s%60).padStart(2,'0')`).

## Design Tokens
**색**
- 카드 배경: `#fffdf7`, 그라데이션 `#fdf6e6` / `#fdf5e4`
- 헤더 그라데이션: `#fdeecb → #f6dfa3`, 보더 `#ecd9a6`
- 주 강조(채움/핸들): `#e0a92a`, 그라데이션 `#f3c34a → #e0a92a`, 밝은 `#f9d666`
- 메인 버튼: `#fde68a → #f3c34a`, 보더 `#eab308`, 텍스트 `#7a560a`
- 라인 아이콘: `#c2982f` (헤더 아이콘 `#b8860b`)
- 트랙(빈 슬라이더): `#ece0c2`
- 보더: `#e6dcc3`(외곽), `#ecdfbe`(버튼), `#efe3c6`(구분선)
- 텍스트: 제목 `#3a2c0c`, 본문/강조 `#5c4f33`·`#5a3a14`, 보조 `#9a7a3a`, 비활성 `#b89a55`
- 배경 점무늬: `radial-gradient(circle at 1px 1px,#e6dcc3 1.4px,transparent 0)` 34px

**라운드**: 카드 18px · 알약/슬라이더 99px · 메인버튼 16px · 보조버튼 10~11px · 작은버튼 7~9px
**그림자**: 카드 `0 14px 44px rgba(120,90,20,.2)` · 알약 `0 10px 30px rgba(120,90,20,.2)` · 메인버튼 `0 5px 14px rgba(200,150,20,.34)` · 슬라이더 트랙 `inset 0 1px 2px rgba(120,90,20,.18)`
**타이포**: system-ui 스택. 제목 1rem/700 · 라벨 .7~.74rem · 시간/볼륨 tabular-nums
**아이콘 규격**: 24×24 viewBox, `fill=none`, `stroke=currentColor`, `stroke-width 1.8`, round cap/join (프로젝트 `src/ui/icons.ts` 의 music/soundOn/soundOff/bee 와 동일 계열)

## Assets
- 외부 이미지 없음. 모든 그래픽은 인라인 SVG(육각 아트워크·벌 글리프·트랜스포트/사운드 아이콘).
- 아이콘 path 는 `src/ui/icons.ts` 의 `music / soundOn / soundOff / bee` 와 동일 스타일. 재사용 권장.
- **실제 음원 파일**(BGM 트랙)은 코드베이스 자산으로 별도 준비 필요.

## Files
- 이 `README.md` (사양 단일 문서). 구현은 `src/ui/game-ui.ts` 의 미니 플레이어 렌더가 단일 출처.
