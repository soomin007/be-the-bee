# probes/ — 연구용 프로브·데이터 생성 (정규 테스트 아님)

AI 연구(value-net·회랑 등)에 쓰는 일회성 측정/데이터 생성 코드를 모아 둔다.
`npm test` 와 CI typecheck(`tsc`)에서 **의도적으로 제외**돼 있다 — 프로브의 타입 에러가
배포를 깨뜨린 사고(known_issues 2026-06-30)의 재발을 구조로 막기 위함이다.

## 실행

```powershell
# 전부 실행(환경변수 없는 프로브만 실제로 돈다, 나머지는 스킵)
npm run probe

# 특정 프로브만 + 파라미터
$env:SIM_N='5'; npm run probe -- probes/_vnet-strength.test.ts; Remove-Item Env:SIM_N
$env:GEN_N='120'; npm run probe -- probes/_gen-training.test.ts; Remove-Item Env:GEN_N
```

## 주의

- 여기 파일은 typecheck 를 안 받는다. 수정했으면 `npm run probe` 로 직접 돌려 확인할 것.
- 데이터 생성 프로브의 출력 기본값은 `probes/.out/`(git 제외). `GEN_OUT` 으로 바꿀 수 있다.
- 측정 방법·결과의 기록은 `docs/design/ai_hive_lock_defense.md` 와 `session_logs/` 에 남긴다.
