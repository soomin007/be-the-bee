# AI 벌집-잠금 방어 — 다음 세션 착수 준비

> backlog #2. 이 문서 하나만 읽고 바로 시작할 수 있게 정리했다. 큰 작업 + known_issues 가 경고하는
> "타일 쫓기 = 약화" 영역이라 **self-play 재검증을 동반해 신중히**. (이전 시도 2026-06-27 세션 로그 참고.)

## 1. 문제 (사용자가 반복해 지는 패턴)

vsAi 에서 **사람 = 노랑(선공), AI = 갈색(후공)** 고정이다. 사람이 다음 정석으로 AI 를 반복해 이긴다:

1. 타일을 한 줄로 깔아 **타일 벌집(같은 색 5+ 연속)** 을 만들어 **잠근다**(§5: 잠긴 칸엔 주인만 말 배치).
2. 잠긴 칸엔 상대(AI)가 보통 말을 못 두므로, 그 칸들을 **자기 말로 채워 "막을 수 없는 5목"** 을 만든다.

AI 는 **막을 수 있는 위협은 다 막지만**(findBlock 등), 승리칸이 잠긴 벌집 안이면 사후 차단이 불가능하다.
정석 대응은 설명서 TIP#1 **"허리 끊기"**: 벌집이 잠기기 **전에** 그 회랑(발전 중 타일선) 위 급소에
**내 말을 선점**(잠금 후에도 §5 소급 적용 없음으로 남아 상대 5목을 끊음).

> **2026-06-29 추가 — 양방향 맹점**: AI 는 회랑을 **막지 못할 뿐 아니라 활용도 못 한다**. watch
> (expert vs expert) 기보에서 갈색이 50수에 ①(2,5)(2,6)으로 q=2 줄을 잠그면 노랑 최선(expert)으로도
> 못 막고 **54수 확정승**(엔진 시뮬로 검증: 50수 직전 노랑 즉승 0 → 51·53수 expert 도 손 못 씀 →
> 52·54수 (2,5)(2,6) 채워 5목)인데, 실제 expert 갈색은 그 수를 놓치고 (-5,2)를 뒀다. 즉 평가가 "잠긴
> 벌집 안 5목"을 **위협으로도 기회로도** 인식 못 하는 게 근본이라, 세 번의 강화 시도(평가·규칙·공격
> 배율)가 다 실패/역효과였다. 휴리스틱+빔의 한계 — 넘으려면 MCTS/학습 재설계. (사용자 제보, mode=watch.)
>
> **2026-06-29 후속 — 공격 절반 해결(lockedRun)**: "기회로도 인식 못 함"(자기 회랑을 잠가 막을 수
> 없는 5목을 노림)은 수정했다. `hiveCountdowns` 를 leaf 평가에 끌어온 `lockedRun` 평가 항(전문가
> 전용) + 루트 잠금-시딩(`lockingMoves`)으로, "잠금→채움→채움"(depth-5)의 지평 너머 승리를 탐색이
> 인식한다. 합성 위치 통과 + 필드 self-play(vs hard) 약화 없음(ON 4-0, OFF 2-0-2). 상세:
> `ai_strategy.md` "잠긴 회랑 공격 인식(lockedRun)" · `session_logs/2026-06-29.md`.
> **남은 건 방어 절반**(아래 §1·§5 #1): 회랑이 잠기기 **전에 끊는 예방**은 보상이 10수+ 뒤라 여전히
> depth-4 밖이다 — 이쪽이 MCTS/학습 재설계가 필요한 본체다. 단, 공격 강화로 AI 가 주도권을 쥐면
> 상대가 회랑을 못 쌓는 간접 효과는 기대 가능(§5 #2).
>
> **2026-06-29 후속2 — 방어 절반도 MCTS 로 다룸(실험 엔진)**: 휴리스틱+MCTS-Solver MCTS(`engine:'mcts'`,
> 기본 OFF)가 잠김 직전에 회랑 칸을 갈색 말로 **선점**한다 — 게임1 4수 `(-1,1)`·게임2 8수 `(2,1)`(둘 다
> expert search 는 회랑 밖). expert(빔+depth-4) 대비 self-play **15승 3패(18판, sims=800)** 로 일반 강도도
> 우위. 학습 네트워크 없이(잘 튜닝된 `evaluate` 를 leaf/롤아웃 + Solver) 풀려, 이 문서가 가정한 "큰 재설계"
> 보다 가벼웠다. **단 부분적·느리다**: ① **긴 회랑**(게임3 q=4, 20수+ 형성)은 못 막음(지평 한계 — 이른·
> 짧은 회랑만 예방), ② **~10~11s/수**(sims↓하면 약해짐 → sims=400 은 2-4 패). 블로커는 속도 → 최적화 후
> UI. 상세: `ai_strategy.md` "MCTS 엔진(실험)" · `session_logs/2026-06-29.md` 세션 2.

## 2. 테스트 기보 (분석·검증 픽스처) — `scripts/decode-game.mjs` 로 디코드

`scripts/code.txt` 에 코드를 넣고 `node scripts/decode-game.mjs`. 셋 다 동일 패턴, 노랑(사람) 승.

- **게임1** (17수, s=0 축 타일 벌집 5수에 잠금 → 그 위 말 5목):
  `BTB1:eyJ2IjoxLCJtdiI6InQgLTEgMSAwIDA7MiAwIDEgMiAtMTt0IDEgLTEgMSAwO3QgMiAwIDIgMDsyIDIgLTIgMyAtMzt0IDEgMSAxIDE7dCAtMiAyIDEgLTE7dCAwIDIgMCAyO3QgLTEgMyAtMSAzO3QgMyAtMSAzIC0xO3QgNCAtMiA0IC0yO3QgMiAxIDIgMTt0IDMgLTIgMiAtMjt0IDQgLTEgNCAtMTt0IDUgLTIgMyAtMzt0IDQgLTQgNCAtNDt0IDEgLTIgLTEgMSIsImluZiI6MCwicW4iOjAsIm1vZGUiOiJ2c0FpIiwiYXQiOjE3ODI0NDMyMDQ1MTR9`
  - 잠김: q+r=0(s=0) 축 (-1,1)(0,0)(1,-1)(2,-2)(3,-3) — **5수에 잠김**. 갈색 마지막 예방 기회 = **4수**(그때 회랑 길이 3).

- **게임2** (23수, (1,-1)축 대각선 벌집 11수에 잠금 → 키스톤 (3,0)으로 q=3 세로 말 5목):
  `BTB1:eyJ2IjoxLCJtdiI6InQgMCAxIDEgMDsyIDIgMCAyIC0xO3QgMyAwIDIgMDt0IDIgLTIgMCAwO3QgMiAxIDIgLTE7dCAzIC0yIDAgMTt0IDQgLTEgMyAtMjt0IDAgLTEgMCAtMTt0IDAgLTIgMCAtMjt0IDEgLTIgMiAtMjsyIDEgMiAwIDM7dCAxIC0xIDEgLTE7dCAzIC0zIDMgLTM7dCAtMSAxIC0xIDE7dCAtMiAyIC0yIDI7dCAtMiAxIC0yIDE7dCAtMyAxIC0zIDE7dCAxIDEgMSAxO3QgMyAtMSAzIC0xO3QgMyAtNCAzIC00O3QgMyAxIDMgMTt0IC0xIC0xIC0xIC0xO3QgMCAyIDMgMCIsImluZiI6MCwicW4iOjAsIm1vZGUiOiJ2c0FpIiwiYXQiOjE3ODI0ODY5NDAzNjJ9`
  - 잠김 대각선 (0,3)(1,2)(2,1)(3,0)(4,-1) — **11수에 잠김**. 키스톤 **(3,0)** 이 잠긴 벌집이자 세로 5목의 급소.
  - 갈색 예방 기회 = 4~10수. **(3,0) 선점이 핵심**(세로 5목·대각선 채우기 둘 다 끊음).

- **게임3** (41수, q=4 열 타일 벌집 잠금 → 그 위 5목):
  `BTB1:eyJ2IjoxLCJtdiI6InQgMiAwIDEgMDt0IDEgLTEgMiAwO3QgMSAxIDEgMTt0IDEgMiAxIDI7dCAzIC0xIDEgLTE7dCAxIC0yIDEgLTI7MiA0IC0yIDAgMjt0IDIgMSAyIDE7dCAyIDIgMiAyO3QgMyAwIDMgMDt0IDAgMyAwIDM7dCAyIC0zIDIgLTM7dCAyIC0xIDIgLTE7dCAwIC0xIDAgLTE7dCAtMSAwIC0xIDA7dCAzIC00IDMgLTQ7dCA0IC01IDQgLTU7dCA0IC0xIDQgLTE7dCA1IC0yIDUgLTI7dCAzIC0yIDMgLTI7MiAwIDQgMCAxO3QgMiAtMiAyIC0yO3QgMCAtMiAwIC0yO3QgMyAtMyAzIC0zO3QgMyAtNSAzIC01O3QgMSAtMyAxIC0zO3QgNCAtMyA0IC0zO3QgMCAtMyAwIC0zO3QgLTEgLTMgLTEgLTM7dCAyIC01IDIgLTU7MiA0IC00IDQgLTY7dCAtMSAtMiAtMSAtMjt0IDEgLTQgMSAtNDt0IDIgLTQgMiAtNDt0IDIgLTYgMiAtNjt0IDMgMiAzIDI7dCA0IC03IDQgLTQ7dCA1IC01IDUgLTU7dCAtMSAzIDQgLTY7dCAxIC01IDEgLTU7dCA1IC0zIDQgLTciLCJpbmYiOjAsInFuIjowLCJtb2RlIjoidnNBaSIsImF0IjoxNzgyNDg3Mjg4NzgyfQ==`
  - 승리 라인 (4,-7)~(4,-3) 전부 노랑 잠긴 벌집. 40수 갈색 막을 승리칸 [4,-2],[4,-7] **둘 다 잠김**.

- **게임4** (54수, **AI=노랑/선공이 패** — 이전 "후공이라 수동적" 가설의 반례): 사람(갈색)이 q+r=1
  회랑을 **8수에 ①로 6칸 조기 잠금** → 그 잠긴 안에서 말 5목(3,-2~7,-6) 완성. 급소 (4,-3)은 7수엔
  맨 타일(상대 말 실리기 33수 전)이라 규칙·평가 어느 것도 그 시점 위험을 못 본다. AI 가 선공으로
  템포 우위였는데도 같은 패턴에 짐 → 패인은 "후공"이 아니라 "회랑 잠김 진행을 위협으로 인식 못 함".
  픽스처: `tests/review.test.ts` 의 사용자 54수 기보(reviewMove 오진 — 53수 missBlock — 수정에 같이 씀).

## 3. 무엇을 시도했고 왜 실패했나 (★ 다시 하지 말 것)

2026-06-27 시도(되돌림, commit `5505d8a` 에 코드 — `git show 5505d8a`): 전문가에 `CONTEST_CUT`
(잠길 임박 회랑 + 잠긴 벌집 위 내 말 보상) 평가 + 끊기수 루트 강제 시딩.

- 합성 위치(상대 말이 **이미 실린** 회랑)는 끊었지만 **실제 기보의 결정적 순간엔 안 끊었다.**
- **계측(핵심)**: 게임2 8수에서 끊기 후보의 깊이 탐색값 = **−11000 ~ −20000(완패)**. 끊을 시점엔 회랑이
  **말 안 실린 맨 타일**이라 끊으면 **템포를 잃고**(AI 는 후공이라 이미 뒤짐) 상대가 즉시 위협을 만든다.
  악용은 **10수+ 뒤**라 **depth-4 가 보상을 못 본다**. `CONTEST_CUT` 을 4000 까지 올려도 깊이값 불변.
- **결론**: **정적 평가/얕은 탐색으로는 못 잡는다.** 가중치를 키우면 탐색이 "지금 끊으면 진다"를 정확히
  계산해 무시하거나, known_issues 의 "타일 쫓기 = 약화" 함정에 빠진다.

2026-06-28 시도(되돌림): `corridorPreemptMoves` — 평가가 아니라 **규칙으로 강제**(접근 #1 의 첫 구현).
"잠길 임박(타일선 길이4·한 수면 5칸) + 5칸 단색 윈도우에 상대 말 ≥1 실림 + 내 말 0" 인 활주로의 빈
급소를 `findBlock` 처럼 즉시 승리·차단 다음 우선순위로 **강제 선점**(전문가만).
- **됨**: 게임1 4수에 급소 (1,-1) 선점(이전엔 못 하던 것). 합성 발동/오발방지 단위 테스트 통과.
- **안 됨**: 게임2((3,0) 대각선+세로 교차 잠금)·게임4(회랑 8수 조기 잠금, 상대 말 실리기 전)는 트리거
  타이밍/형태가 안 맞아 못 잡음.
- **self-play 약화(결정타)**: 전문가(preempt) vs hard = **1-5**, 같은 seed 로 preempt 만 끄면 **5-0**(무1)
  — A/B 로 preempt 단독 약화 확정(이전 expert vs hard 10-0 과도 일치). 정상 AI 대국엔 "상대 말
  실린 길이4 타일선"이 흔해 강제 선점이 자주 발동 → 진짜 말 5목 위협 대응 템포를 뺏겨 무너진다. 발동은
  사람-회랑 기보에선 드물어 보였으나(게임당 0~1) AI 대국에선 빈번했다. → **되돌림**(코드 미커밋).
- **결론**: 규칙 강제도 같은 벽이다. 게임1류는 잡지만 정상 대국이 무너지고, 트리거를 더 좁히면 게임1도
  놓친다. **평가/탐색 재설계 없이는 안 된다**(2026-06-27 결론 재확인). 다음 시도는 섹션 5 #2(주도권
  강화, 말-위협으로 상대가 타일 못 쌓게)나 #3(선택적 심화)을 우선 — 타일-기반 강제는 막다른 길로 보인다.

### 2026-06-30 측정: MCTS 파라미터 스케일업은 게임3 를 못 막는다 (그리드 프로브)

게임3(q=4 회랑 `(4,-3)~(4,-7)`)을 재구성해 결정적 갈색 차례(28·32·36수)에서 MCTS 를 depth/sims
그리드로 측정 — **모든 설정이 회랑 칸 선점 0건**:

| 수 | d2 n1000 | d3 n1000 | d5 n1000 | d5 n2000 | d5 n4000 |
|----|----------|----------|----------|----------|----------|
| 28 | none | none | none | none | none |
| 32 | (3,2) | (2,-4) | (2,-4) | (3,1) | (3,1) |
| 36 | (2,3) | (3,1) | (-2,1) | (6,-2) | (-1,4) |
| 비용 | ~12s | ~16s | ~20s | ~45s | **76~102s** |

- **결론**: depth/sims 를 끝까지(d5·n4000, **호출당 76~102초**) 올려도 회랑을 못 막는다. "올려도 안 됨"
  (2026-06-29 비체계 관찰)이 **데이터로 확정** — 지평 한계. 파라미터 스케일업은 **효과 0 + 비용 폭증**이라
  막다른 길(전체 depth↑인 §5 #3 의 무차별판도 무효 시사 — #3 은 "특정 라인만" 심화라 따로 검증 필요).
- **함의**: 남은 길은 ① §5 #2 **주도권 강화**(말-위협으로 상대가 회랑을 못 쌓게 — 타일-쫓기 위험 없음, 유력)
  또는 ② 학습 가치함수(AlphaZero-lite, 큰 작업). 정적/규칙(§3, 이미 약화)·파라미터(이번 측정)는 모두 막힘.
- **재현**: 게임3 BTB1(§2) 를 `applyMove` 로 재구성 → 그 상태에 `createAi({difficulty:'expert',
  mctsRolloutDepth, mctsSims})` → 둔 말 칸이 회랑(`4,-3`~`4,-7`)인지. 일회성 프로브는 측정 후 삭제(8분 소요).

## 4. 제약 (known_issues, 반드시 지킬 것)

- 평가에 타일/벌집 발전 보상을 넣으면 AI 가 **말 대신 타일을 쫓아 약해진다**(여러 번 재현). 안전 레버는
  **말-우선·반대칭**만(상대 발전 타일선 위 내 말 선점 등).
- 강도 검증은 **필드(vs hard/medium)** 로. **전문가 vs 전문가(거울)는 거짓 신호**이자 너무 느리다.
- 전문가 depth-4 는 후반 수당 10~29초로 느리다(자원 소진 ~80~90수에 종료, 200수 불가). self-play 는
  medium(depth-2)을 우선·소표본으로. 백그라운드 vitest 중단 시 node worker 가 안 죽으니 PowerShell 로 확인.

## 5. 다음에 탐색할 접근 (search-horizon 를 우회하는 쪽 우선)

정적 가중·얕은 탐색이 막혔으니, **탐색이 보상을 못 봐도 동작하는** 방향을 먼저:

1. **(유력) 강제 오버라이드 — findBlock 의 전략판.** `findBlock` 이 즉시 5목을 평가와 무관하게 막듯,
   "상대가 곧 잠글 벌집의 급소(키스톤)를 선점"하는 수를 **규칙 기반으로 강제**한다(평가 우회). 핵심 난점은
   **오발(over-cut) 없이 "그 결정적 순간"만** 트리거하는 것. 후보 조건: 상대 타일선이 **한 수면 잠김**(길이4
   +연장칸, 또는 길이3+twoTiles 여력) **AND** 그 줄/인접에 상대 말이 이미 있어 채울 의도가 보임 **AND** 내
   즉시 승리·차단이 없음. (게임2 처럼 길이3→twoTiles 로 한 번에 잠그는 경우를 놓치지 말 것.)
2. **(다른 각도) AI 의 주도권 강화.** 세 판 모두 노랑이 **10수+ 동안 자유롭게** 벌집을 쌓았다 — AI 가 후공
   이라 수동적이기 때문. AI 가 자기 말 위협을 지속적으로 만들면 상대가 응수하느라 벌집을 못 쌓는다. "말 5목이
   전부" 원칙과 맞고 타일-쫓기 위험이 없다. 후공일 때 공격 배율을 약간 올리는 실험부터.
3. **(비쌈) 선택적 심화.** 상대 타일선이 길이4(잠김 임박)면 그 줄을 잠그고/채우는 수에 한해 탐색 깊이를
   연장해 잠긴-런웨이 보상을 보게 한다. 되돌린 fix 의 "잠긴 벌집 위 내 말 = 영구 차단" 보상(commit 5505d8a)을
   재활용하면 깊은 탐색이 끊기를 가치 있게 볼 수 있다. 단 전문가가 더 느려진다.

각 접근은 **반드시** ① 게임1~3 재구성으로 갈색이 결정적 수(예: 게임2 (3,0) 선점)를 두는지 + ② 필드
self-play 로 강도 회귀(전문가 vs hard/medium) 없는지 둘 다 확인 후 채택.

## 6. 검증 레시피 (재사용)

- **기보 재구성 + 진단**: `MV` 문자열(decode 의 수 목록)을 파싱해 `applyMove` 로 재생, 각 수에서
  `reviewMove`(missBlock/block)·`winningCells`·`lockedTiles` 로 "막을 승리칸이 잠겼나" 표시. (이번 세션의
  임시 분석 스크립트 패턴 참고 — `tests/` 에 `_analyze.test.ts` 로 임시 작성 후 삭제했다.)
- **끊기 후보 깊이값 진단**: `createAi` 내부를 임시 export 해(`__dbg`) 루트 후보별 1수/깊이값을 찍어
  "끊기수가 시딩됐는지·왜 안 골랐는지"를 본다.
- **self-play**: `tests/` 에 임시 테스트(파일명 `_` 접두)로 new vs hard/medium 소표본(N=3~4, PLY_CAP~140),
  `--no-file-parallelism` + 단일 프로세스. 끝나면 PowerShell 로 node worker 정리.
