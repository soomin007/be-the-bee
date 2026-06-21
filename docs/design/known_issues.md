# Known Issues — 반복 방지 함정/오류 이력

> 세션 중 발견한 버그·설계 함정·작업 실수를 "증상 → 원인 → 재발 방지책"으로 남긴다.
> 게임 버그뿐 아니라 프로세스 실수(도구 오용, 커밋 누락 등)도 포함. 같은 실수를 두 번
> 겪지 않는 것이 목적. 세션 시작 루틴에서 이 파일을 먼저 읽는다.
>
> 최신 항목을 위에 추가.

## 2026-06-21

### 배포: 무료 플랜은 비공개 레포 GitHub Pages 미지원
- **증상**: `gh api POST .../pages` 가 HTTP 422 "Your current plan does not support GitHub Pages".
- **원인**: GitHub Pages 무료는 **public 레포만**. private 은 Pro 이상 필요.
- **재발 방지**: 배포 전 레포 가시성 확인. private 유지가 필요하면 Cloudflare Pages/Netlify 등
  대안. 공개 전환은 되돌리기 어려운 외부 노출이므로 반드시 사용자 확인 후 진행.

### AI: 빔 서치가 무작위 흩뿌림 보드에서 타임아웃
- **증상**: 퍼즈 테스트(무작위 120수)에서 depth-3 서치가 5s 테스트 한계 초과.
- **원인**: 무작위 플레이가 타일을 넓게 흩뿌려 프론티어·후보가 폭증. 실제 AI 플레이(집중)는 빠름.
- **재발 방지**: 알파-베타 + 노드당 후보 상한(MAX_CANDIDATES). 합법성 퍼즈는 깊이와 무관하므로
  빠른 easy(1수)로 검증하고, 깊은 서치는 self-play(집중 보드)로 검증.

### 빌드: 누락 import 가 try/catch 폴백에 가려짐
- **증상**: ai.ts 에 `applyMove` import 누락인데 테스트가 통과(서치가 실제로 안 돌고 폴백됨).
- **원인**: `chooseMove` 의 try/catch 가 ReferenceError 를 삼켜 폴백수로 대체.
- **재발 방지**: `check:engine`(tsc)로 미사용/미정의 잡기 + 동작 검증(예: medium>easy 승률)으로
  "실제로 그 경로가 도는지" 확인. catch 가 버그를 가릴 수 있음을 유념.

### 테스트: 대칭 위치에서 특정 승리/차단 칸을 단정하면 깨짐
- **증상**: AI 즉시승리 테스트가 4목의 한쪽 끝(4,0)만 정답으로 단정 → 실패.
- **원인**: 4목의 양끝이 모두 빈 칸이면 어느 쪽에 둬도 5목(대칭). AI가 반대편 끝을 선택.
- **재발 방지**: 정답 칸이 여럿일 수 있는 위치는 "결과가 승리/차단인가"로 단정하거나
  유효한 끝 집합 중 하나인지로 검사. 단일 정답이 필요하면 반대편 끝을 미리 막아 둔다.

### 프로세스: 새 테스트 파일이 커밋에서 누락됨
- **증상**: UI 커밋(`092be30`)에 `tests/ui.test.ts`가 빠짐(다음 커밋 후 `?? tests/ui.test.ts`로 발견).
- **원인**: `git add src package.json ...`처럼 경로를 콕 집어 add하면서 새 파일을 빠뜨림.
- **재발 방지**: 커밋 전 `git status`로 untracked/staged를 눈으로 확인. 새 파일이 포함된
  작업은 관련 디렉터리 전체(`git add src tests`)를 add하거나 `git add -A` 후 status 검토.

### 환경: winget 설치 후 PATH가 현재 셸에 반영 안 됨
- **증상**: `winget install`로 Node/gh 설치 직후 `node`/`npm`/`gh`가 "not recognized".
- **원인**: winget은 레지스트리 PATH를 갱신하지만, 이미 떠 있는 셸/프로세스는 재시작 전까지
  새 PATH를 못 본다. Claude Code의 셸은 설치 전에 떠 있었음.
- **재발 방지**: 도구 호출 시 PATH 앞에 직접 추가해서 쓴다 —
  `$env:Path = "$env:ProgramFiles\nodejs;$env:ProgramFiles\GitHub CLI;" + $env:Path`.
  사용자에게는 "새 터미널을 열면 자동 인식됨"을 안내.

### 환경: winget MSI 설치가 UAC 승인 대기로 멈춤
- **증상**: 설치 명령이 끝나지 않고 스피너만 도는 것처럼 보임.
- **원인**: MSI가 관리자 권한 승격(UAC)을 요청하며 사용자의 "예" 클릭을 기다림.
- **재발 방지**: 설치는 백그라운드로 돌리고, 사용자에게 UAC 팝업("예") 클릭을 명시적으로 안내.
  완료 알림을 받은 뒤 진행.

### 빌드: CSS side-effect import 타입 에러(TS2882)
- **증상**: `npm run build`의 `tsc`에서 `Cannot find module ... './style.css'`.
- **원인**: Vite의 `*.css` 등 에셋 모듈 타입 선언이 없으면 strict TS가 거부.
- **재발 방지**: `src/vite-env.d.ts`에 `/// <reference types="vite/client" />` 유지.

### 테스트: 버전 상수를 하드코딩한 스모크 테스트가 깨짐
- **증상**: `ENGINE_VERSION`을 `0.1.0`으로 올리자 `toBe('0.0.0')` 테스트 실패.
- **원인**: 자주 바뀌는 값을 정확히 일치 비교.
- **재발 방지**: 형식(정규식 `^\d+\.\d+\.\d+$`)·존재만 검증하고 정확값 단언은 피한다.
