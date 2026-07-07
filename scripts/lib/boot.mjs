// verify/shot 스크립트 공용 부트스트랩(Playwright).
// 첫 접속 오버레이(앱 사용법 온보딩·튜토리얼·테마 팁)와 "새 게임 설정 마법사"를 처리한다.
//
// 마법사(2026-06-30 도입)는 자동저장이 없으면 로드 직후 항상 뜬다. 안 닫으면 backdrop 이
// 이후 모든 클릭을 가로채 스크립트가 waitForSelector 타임아웃으로 죽는다(known_issues 참고).
// 모달 버튼은 locator.click 액셔너빌리티 검사가 간헐적으로 거부한 사례가 있어(세션로그
// 2026-06-30) 실제 마우스 좌표 클릭(page.mouse.click)을 쓴다.

const SEEN_FLAGS = [
  'be-the-bee/tutorial-seen', // 게임 규칙 튜토리얼
  'be-the-bee/onboarding-seen', // 앱 사용법 투어(스포트라이트)
  'be-the-bee/theme-told', // 테마 변경 팁(notice 한 줄)
]

/** 요소 중심 픽셀을 실제 마우스로 클릭(모달/오버레이 버튼용). */
export async function clickXY(page, locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('clickXY: no bounding box (요소가 안 보임)')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

/** 새 게임 마법사가 떠 있으면 '취소'로 닫는다(게임 상태는 유지 — 마법사 도입 전과 동일).
 *  닫았으면 true, 애초에 없었으면 false. */
export async function dismissWizard(page, timeout = 2500) {
  const cancel = page.locator('.ng-card button[data-act="ngCancel"]')
  try {
    await cancel.waitFor({ state: 'visible', timeout })
  } catch {
    return false // 마법사 없음(자동저장 복원 등)
  }
  await clickXY(page, cancel)
  await page.locator('.ng-card').waitFor({ state: 'detached', timeout: 5000 })
  return true
}

/** 새 게임 마법사를 연다(단축키 N). 이미 떠 있으면 그대로 둔다. */
export async function openWizard(page) {
  if ((await page.locator('.ng-card').count()) === 0) await page.keyboard.press('n')
  await page.locator('.ng-card').waitFor({ state: 'visible', timeout: 5000 })
}

/** 마법사 단계 버튼을 순서대로 클릭. 예: ['ngOpp:ai', 'ngDiff:hard', 'ngStartAi'] */
export async function wizardPick(page, acts) {
  for (const act of acts) {
    const btn = page.locator(`.ng-card button[data-act="${act}"]`)
    await btn.waitFor({ state: 'visible', timeout: 5000 })
    await clickXY(page, btn)
    await page.waitForTimeout(80)
  }
}

/**
 * goto 직후 호출하는 표준 준비 절차:
 *  1) 첫 접속 오버레이 seen 플래그 세팅 (+ opts.extra 로 스크립트 고유 localStorage 작업)
 *  2) reload  3) 새 게임 마법사 닫기(opts.keepWizard 면 유지)
 */
export async function prepPage(page, opts = {}) {
  await page.evaluate((flags) => {
    for (const k of flags) localStorage.setItem(k, '1')
  }, SEEN_FLAGS)
  if (opts.extra) await page.evaluate(opts.extra)
  await page.reload({ waitUntil: 'networkidle' })
  if (!opts.keepWizard) await dismissWizard(page)
}
