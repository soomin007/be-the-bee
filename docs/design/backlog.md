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
| 2 | **전문가 AI: 회랑 잠김 방지(허리 끊기)** | 아래 §2 참고. 성향 무시·열린3·4목 차단은 완료(세션 로그). 남은 핵심: 상대가 **타일 벌집(회랑)을 잠가 막을 수 없는 말 라인**을 만들기 전에 회랑을 끊는 것(CONTEST 상향 + 시딩, self-play 검증 필수). AI 품질·설계 성격이라 멀티플레이와 분리. |

## §2. 전문가 AI: 회랑(타일 벌집) 잠김 방지 — "허리 끊기"

> 이미 한 것(2026-06-26, 세션 로그 참고): ① 전문가 성향 무시(항상 최선) ② 상대 **열린 3·4목 말 라인**
> 차단 후보를 빔에 강제 시딩. self-play 로 expert 가 hard 10-0·medium 11-5 압도 확인.

**남은 일 = 사용자 패배 기보의 진짜 원인.** 그 판은 노랑이 **5수에 q+r=0 축에 타일 5개 벌집을 완성·잠가**
그 줄 위는 갈색이 영원히 못 두게 만든 뒤, 잠긴 칸에 자기 말만 채워 **막을 수 없는 5목**을 만들었다(14수는
이미 진 국면 — 위 ②의 말-라인 차단은 잠긴 칸이라 안 통함). 정석 대응은 설명서 TIP#1 **"허리 끊기"**:
**벌집이 잠기기 전에** 상대 회랑(발전 중인 3~4 타일선) 위에 **내 말을 선점**(잠금 후에도 내 말이 남아
상대 말 라인을 끊음).

- 구현 후보: 상대 타일선(길이 3~4, 미잠금)을 위협으로 보고 ① **회랑 칸에 내 말 두는 수를 빔에 강제 시딩**
  + ② `CONTEST`(상대 타일선 위 내 말 선점) 가중치를 **잠김 임박(길이 4, 또는 길이 3+빈 연장칸 2)** 에 한해
  상향. **반대칭·말 기반**이라 known_issues 의 "말 대신 타일 쫓기" 함정(hiveDef/tileDev)과는 다른 안전 레버
  (line 168 이 "허리 끊기"를 안전 방향으로 명시).
- ⚠️ **반드시 self-play 검증**(known_issues: 이 영역 평가 변경은 과거 여러 번 AI 를 약화시킴). expert 가
  hard/medium 을 계속 이기는지, 회랑 패턴 기보에서 급소 선점하는지 확인 후 채택.
- 곁들임(선택): 코칭/`reviewMove` 가 "열린 3목/회랑 잠김 임박"을 missBlock 류로 짚게 확장(지금은 "다음 한
  수 5목"만 잡아 이런 선제 위협은 사각).

**분석용 기보(전문가가 진 판, mode=vsAi):** `scripts/decode-game.mjs`(또는 앱 "기보 코드
가져오기"로 복기)로 확인.

```
BTB1:eyJ2IjoxLCJtdiI6InQgLTEgMSAwIDA7MiAwIDEgMiAtMTt0IDEgLTEgMSAwO3QgMiAwIDIgMDsyIDIgLTIgMyAtMzt0IDEgMSAxIDE7dCAtMiAyIDEgLTE7dCAwIDIgMCAyO3QgLTEgMyAtMSAzO3QgMyAtMSAzIC0xO3QgNCAtMiA0IC0yO3QgMiAxIDIgMTt0IDMgLTIgMiAtMjt0IDQgLTEgNCAtMTt0IDUgLTIgMyAtMzt0IDQgLTQgNCAtNDt0IDEgLTIgLTEgMSIsImluZiI6MCwicW4iOjAsIm1vZGUiOiJ2c0FpIiwiYXQiOjE3ODI0NDMyMDQ1MTR9
```
