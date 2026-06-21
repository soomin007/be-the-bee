// UI 진입점. 여기서부터 src/ui 의 렌더링/입력 계층이 시작된다.
// 엔진(src/engine)에 의존할 수 있지만, 엔진은 절대 이 계층을 import 하지 않는다.
import './style.css'
import { ENGINE_VERSION } from './engine/index'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app element not found')

app.innerHTML = `
  <main class="placeholder">
    <h1>🐝 Be the Bee</h1>
    <p>0단계 셋업 완료. 엔진 버전 <code>${ENGINE_VERSION}</code></p>
    <p>게임 보드 렌더링은 다음 단계에서 구현됩니다.</p>
  </main>
`
