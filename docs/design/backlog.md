# 백로그 — 다음 작업 (진행 단일 소스)

> **앞으로 할 일·필요한 일만** 적는다. 이미 구현 완료됐거나 계획이 바뀐 항목은 지운다
> (무엇을 왜 했는지의 기록은 `session_logs/` 에만 남긴다). 큰 그림은 [`../ROADMAP.md`](../ROADMAP.md).
>
> 최종 갱신: 2026-06-24.

## 다음 마일스톤

> **다음 메인 = 멀티플레이어**(초대링크 온라인 대전). 그동안 "범위 밖"이었으나 사용자가 착수 결정.
> 엔진은 이미 직렬화·스냅샷·공유 코드(BTB1)가 준비돼 netcode 친화적이다. 방식·백엔드는 계획 문서에서
> 확정한다. (3D 보드는 정식 옵션으로 도입 완료 — 실험 딱지 제거, 실사 벌은 숨은 이스터에그.)

| # | 작업 | 메모 |
|---|---|---|
| 1 | **멀티플레이어 follow-up**(메인) | Phase 1~3 구현됨(Supabase 방·선공후공 협상·코인토스·이탈/재접속·재대국·온라인 무르기). 남은 일: **실기기 2대 검증**(협상 동기화·코인토스·온라인 무르기·만석 처리). '내 색 두 번' 데스크탑 해결, 모바일은 간헐적(known_issues 2026-06-26 참고). 계획: [`multiplayer_plan.md`](multiplayer_plan.md). |
| 2 | **전문가 AI 점검 + "성향" 개념 재정의** | 아래 §2 참고. ① 전문가(균형)가 허무하게 진 실제 기보 분석(버그/탐색깊이/평가 약점?). ② "전문가 = 항상 최선의 수"인데 전문가에도 성향(persona)이 있는 게 개념상 맞는지 재정의. AI 품질·설계 성격이라 멀티플레이와 분리. |

## §2. 전문가 AI 점검 + "성향" 개념 재정의 (사용자 제기 2026-06-26)

사용자가 **전문가(균형) AI** 상대로 두고 "허무하게 이겼다"며 두 가지를 제기. AI 품질·설계 성격이라
다음 세션에서 다룬다(이번 세션은 기록만).

**해결할 것**
1. **왜 전문가가 허무하게 졌나** — 아래 기보를 디코드/복기해 전문가의 실제 수를 검증한다.
   가능 원인 후보: 탐색 깊이/빔 폭 부족, 평가함수가 상대 5목 임박(다음 한 수 승리)을 못 막음,
   성향(balanced) 가중치가 방어를 약화, 또는 단순 버그. `npm run sim` 상성표도 참고.
2. **"전문가"와 "성향"의 개념 충돌** — 전문가는 "항상 최선의 수"라고 안내하는데 전문가별 성향
   (공격/균형/수비 등)이 따로 있는 건 모순처럼 보임. 정리 방향 후보:
   - (a) 전문가는 성향 선택을 없애고 단일 "최선 수" 엔진으로(성향은 하위 난이도 전용),
   - (b) 성향을 "동등하게 좋은 수들 중 취향"으로 재정의(최선 수 집합 안에서만 성향 적용),
   - (c) 라벨을 바꿔 오해 제거. → 사용자와 방향 합의 후 구현.

**분석용 기보(이번에 전문가가 진 판, mode=vsAi):** `scripts/decode-game.mjs`(또는 앱 "기보 코드
가져오기"로 복기)로 확인.

```
BTB1:eyJ2IjoxLCJtdiI6InQgLTEgMSAwIDA7MiAwIDEgMiAtMTt0IDEgLTEgMSAwO3QgMiAwIDIgMDsyIDIgLTIgMyAtMzt0IDEgMSAxIDE7dCAtMiAyIDEgLTE7dCAwIDIgMCAyO3QgLTEgMyAtMSAzO3QgMyAtMSAzIC0xO3QgNCAtMiA0IC0yO3QgMiAxIDIgMTt0IDMgLTIgMiAtMjt0IDQgLTEgNCAtMTt0IDUgLTIgMyAtMzt0IDQgLTQgNCAtNDt0IDEgLTIgLTEgMSIsImluZiI6MCwicW4iOjAsIm1vZGUiOiJ2c0FpIiwiYXQiOjE3ODI0NDMyMDQ1MTR9
```
