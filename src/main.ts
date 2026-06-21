// UI 진입점. 엔진(src/engine)에 의존할 수 있지만, 엔진은 이 계층을 import 하지 않는다.
import './style.css'
import { mountGame } from './ui/index'

const app = document.querySelector<HTMLDivElement>('#app')
if (!app) throw new Error('#app element not found')

mountGame(app)
