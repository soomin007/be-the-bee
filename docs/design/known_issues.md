# Known Issues — 반복 방지 함정/오류 이력

> 세션 중 발견한 버그·설계 함정·작업 실수를 "증상 → 원인 → 재발 방지책"으로 남긴다.
> 게임 버그뿐 아니라 프로세스 실수(도구 오용, 커밋 누락 등)도 포함. 같은 실수를 두 번
> 겪지 않는 것이 목적. 세션 시작 루틴에서 이 파일을 먼저 읽는다.
>
> 최신 항목을 위에 추가.

## 2026-06-21

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
