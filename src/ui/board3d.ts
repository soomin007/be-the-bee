// 3D 보드 렌더러(읽기 전용 + 셀 클릭 emit). game-ui.ts 의 SVG 보드와 교체 가능한 대체 렌더러.
// 엔진 GameState 를 받아 three.js 로 타일·말·벌집 글로우를 그린다. 입력은 레이캐스팅으로 셀을
// 찾아 onCellClick(hex) 로 넘긴다(실제 수 적용·턴 로직은 호출 측 game-ui 가 SVG 와 동일하게 처리).
//
// CLAUDE.md 아키텍처: 이 파일은 ui/ 라 engine 을 import 해도 되지만 engine 은 이걸 import 하면 안 된다.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { GameState, Player } from '../engine/types'
import { hexFromKey, type Hex } from '../engine/hex'
import { detectHives } from '../engine/hive'

const TILE_COLOR: Record<Player, number> = { yellow: 0xf0c531, brown: 0x97581d }
const DISC_COLOR: Record<Player, number> = { yellow: 0xd2a230, brown: 0x542514 }
const SIZE = 1 // 3D 헥스 크기(중심→꼭짓점)
const TILE_TOP = 0.22 // 타일 윗면 y
const PIECE_K = 0.33 // 핸드오프 말(원판 r2)을 타일에 맞게 축소

export interface Board3DOptions {
  /** 셀(헥스) 클릭 시 호출. 실제 수 적용은 호출 측이 SVG 와 동일하게 처리. */
  onCellClick?: (h: Hex) => void
  autoRotate?: boolean
}

/** 게임 오버레이 힌트(SVG 보드와 동일). 좌표는 엔진 Hex. */
export interface BoardHints {
  frontier?: readonly Hex[] // 타일 놓을 수 있는 빈 칸(초록 고스트 헥스, 클릭 가능)
  pieceTargets?: readonly Hex[] // 말 놓을 수 있는 타일(초록 링)
  provisional?: readonly Hex[] // 드래프트 진행 중 잠정 타일(고스트, 클릭 가능)
  lastPiece?: Hex | null // 직전에 놓인 말(파란 링)
}

export interface Board3D {
  /** 엔진 상태(+선택 힌트)로 보드를 다시 그린다(타일/말/벌집 글로우/오버레이). */
  update(state: GameState, hints?: BoardHints): void
  /** 리소스 해제 + 캔버스 제거. */
  dispose(): void
}

function hexToXZ(h: Hex): { x: number; z: number } {
  return { x: SIZE * (Math.sqrt(3) * h.q + (Math.sqrt(3) / 2) * h.r), z: SIZE * (1.5 * h.r) }
}

// ---- 말(원판+벌) = Claude Design 핸드오프 3D 스타일 토큰 ----
function makeBodyTexture(): THREE.Texture {
  const w = 64
  const h = 512
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  const x = cv.getContext('2d')!
  x.fillStyle = '#f4b70e'
  x.fillRect(0, 0, w, h)
  const black = '#1d150b'
  const yToV = (v: number): number => (1 - v) * h
  x.fillStyle = black
  x.fillRect(0, yToV(0.28), w, h - yToV(0.28))
  for (const v of [0.63, 0.45]) {
    x.fillStyle = black
    x.fillRect(0, yToV(v) - 24, w, 48)
  }
  const t = new THREE.CanvasTexture(cv)
  t.anisotropy = 4
  t.wrapS = THREE.RepeatWrapping
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function buildPiece(owner: Player, queen: boolean): THREE.Group {
  const discColor = DISC_COLOR[owner]
  const g = new THREE.Group()
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.6, 72), new THREE.MeshStandardMaterial({ color: discColor, roughness: 0.82 }))
  disc.castShadow = disc.receiveShadow = true
  g.add(disc)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.93, 0.09, 14, 80), new THREE.MeshStandardMaterial({ color: discColor, roughness: 0.7 }))
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.3
  g.add(rim)
  const black = new THREE.MeshStandardMaterial({ color: 0x1d150b, roughness: 0.55 })
  const bee = new THREE.Group()
  bee.position.y = 0.62
  const bodyGeo = new THREE.SphereGeometry(1, 64, 48)
  bodyGeo.rotateX(Math.PI / 2)
  const body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({ map: makeBodyTexture(), roughness: 0.5 }))
  body.scale.set(0.8, 0.8, 1.15)
  body.castShadow = true
  bee.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 30), black)
  head.scale.set(0.55, 0.55, 0.5)
  head.position.set(0, 0.24, 0.98)
  head.castShadow = true
  bee.add(head)
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x444444, side: THREE.DoubleSide })
  const eyeDark = new THREE.MeshStandardMaterial({ color: 0x15100a, side: THREE.DoubleSide })
  const zAxis = new THREE.Vector3(0, 0, 1)
  const C = new THREE.Vector3(0, 0.24, 0.98)
  const rxh = 0.55
  const ryh = 0.55
  const rzh = 0.5
  for (const s of [-1, 1]) {
    const u = new THREE.Vector3(s * 0.33, 0.33, 0.86).normalize()
    const P = new THREE.Vector3(C.x + rxh * u.x, C.y + ryh * u.y, C.z + rzh * u.z)
    const nrm = new THREE.Vector3(u.x / rxh, u.y / ryh, u.z / rzh).normalize()
    const eye = new THREE.Group()
    eye.position.copy(P)
    eye.quaternion.setFromUnitVectors(zAxis, nrm)
    eye.scale.set(0.78, 1, 1)
    const erim = new THREE.Mesh(new THREE.CircleGeometry(0.144, 30), eyeDark)
    erim.position.z = 0.002
    eye.add(erim)
    const wht = new THREE.Mesh(new THREE.CircleGeometry(0.123, 30), eyeWhite)
    wht.position.z = 0.006
    eye.add(wht)
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.075, 26), eyeDark)
    iris.position.set(0, -0.005, 0.01)
    eye.add(iris)
    const hi = new THREE.Mesh(new THREE.CircleGeometry(0.025, 18), eyeWhite)
    hi.position.set(0.02, 0.038, 0.014)
    eye.add(hi)
    bee.add(eye)
  }
  const up = new THREE.Vector3(0, 1, 0)
  for (const s of [-1, 1]) {
    const base = new THREE.Vector3(s * 0.14, 0.62, 1.06)
    const dir = new THREE.Vector3(s * 0.45, 1.0, 0.5).normalize()
    const len = 0.42
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 12), black)
    stem.position.copy(base.clone().addScaledVector(dir, len / 2))
    stem.quaternion.setFromUnitVectors(up, dir)
    bee.add(stem)
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.062, 16, 16), black)
    knob.position.copy(base.clone().addScaledVector(dir, len))
    bee.add(knob)
  }
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, roughness: 0.2, side: THREE.DoubleSide, depthWrite: false })
  for (const s of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), wingMat)
    wing.scale.set(0.46, 0.05, 0.95)
    const root = new THREE.Vector3(s * 0.18, 0.6, 0.46)
    const tip = new THREE.Vector3(s * 1.02, 0.48, -0.66)
    wing.position.copy(root.clone().add(tip).multiplyScalar(0.5))
    wing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tip.clone().sub(root).normalize())
    bee.add(wing)
  }
  g.add(bee)
  if (queen) {
    const gold = new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.32, metalness: 0.55 })
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.29, 0.16, 16), gold)
    band.position.set(0, 0.82, 0.98)
    bee.add(band)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.12, 8), gold)
      sp.position.set(Math.sin(a) * 0.17, 0.94, 0.98 + Math.cos(a) * 0.17)
      bee.add(sp)
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.05, 12, 90), new THREE.MeshStandardMaterial({ color: 0xcf2a1c, roughness: 0.5 }))
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.31
    g.add(ring)
  }
  return g
}

function hexTile(owner: Player, isHive: boolean): THREE.Mesh {
  const m = isHive
    ? new THREE.MeshStandardMaterial({ color: TILE_COLOR[owner], roughness: 0.6, emissive: 0xf59e0b, emissiveIntensity: 0.35 })
    : new THREE.MeshStandardMaterial({ color: TILE_COLOR[owner], roughness: 0.7, metalness: 0.04 })
  // 회전 없음 = pointy-top: CylinderGeometry(6) 기본 꼭짓점이 ±z 라 엔진 layout 과 맞물린다.
  const tile = new THREE.Mesh(new THREE.CylinderGeometry(SIZE * 0.98, SIZE * 0.98, TILE_TOP, 6), m)
  tile.position.y = TILE_TOP / 2
  tile.castShadow = tile.receiveShadow = true
  return tile
}

function disposeObject(o: THREE.Object3D): void {
  o.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((mm) => mm.dispose())
    else if (mat) mat.dispose()
  })
}

export function createBoard3D(container: HTMLElement, opts: Board3DOptions = {}): Board3D {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
  camera.position.set(2.5, 9, 9.5)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.touchAction = 'none'
  container.appendChild(renderer.domElement)

  scene.add(new THREE.AmbientLight(0xfff4d8, 0.8))
  const key = new THREE.DirectionalLight(0xfff1c0, 1.25)
  key.position.set(-6, 12, 6)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.near = 1
  key.shadow.camera.far = 40
  key.shadow.camera.left = -12
  key.shadow.camera.right = 12
  key.shadow.camera.top = 12
  key.shadow.camera.bottom = -12
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xffffff, 0.32)
  fill.position.set(7, 4, -5)
  scene.add(fill)
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.ShadowMaterial({ opacity: 0.16 }))
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.001
  ground.receiveShadow = true
  scene.add(ground)

  const boardGroup = new THREE.Group()
  scene.add(boardGroup)
  // 클릭 가능한 칸(보드 타일 + 프론티어/잠정 고스트). 레이캐스팅 대상.
  const clickable: { mesh: THREE.Mesh; hex: Hex }[] = []

  // 호버/선택 링(게임 색: 초록=둘 수 있음, 파랑=직전/선택)
  const ringGeo = new THREE.TorusGeometry(SIZE * 0.84, 0.05, 10, 6)
  const hoverRing = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0x16a34a, emissive: 0x16a34a, emissiveIntensity: 0.7 }))
  hoverRing.rotation.x = Math.PI / 2
  hoverRing.visible = false
  scene.add(hoverRing)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 0.4, 0)
  controls.enableDamping = true
  controls.autoRotate = opts.autoRotate ?? false
  controls.autoRotateSpeed = 0.7
  controls.minDistance = 4
  controls.maxDistance = 40

  // ---- 입력: 레이캐스팅으로 헥스 찾기 ----
  const raycaster = new THREE.Raycaster()
  const ndc = new THREE.Vector2()
  function pickTile(clientX: number, clientY: number): { mesh: THREE.Mesh; hex: Hex } | null {
    const rect = renderer.domElement.getBoundingClientRect()
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(ndc, camera)
    const hit = raycaster.intersectObjects(clickable.map((t) => t.mesh), false)[0]
    return hit ? clickable.find((t) => t.mesh === hit.object) ?? null : null
  }
  const onMove = (ev: PointerEvent): void => {
    const t = pickTile(ev.clientX, ev.clientY)
    if (t) {
      const w = new THREE.Vector3()
      t.mesh.getWorldPosition(w)
      hoverRing.position.set(w.x, TILE_TOP + 0.02, w.z)
      hoverRing.visible = true
      renderer.domElement.style.cursor = 'pointer'
    } else {
      hoverRing.visible = false
      renderer.domElement.style.cursor = 'grab'
    }
  }
  let downPos: { x: number; y: number } | null = null
  const onDown = (ev: PointerEvent): void => {
    downPos = { x: ev.clientX, y: ev.clientY }
  }
  const onUp = (ev: PointerEvent): void => {
    if (!downPos) return
    const moved = Math.hypot(ev.clientX - downPos.x, ev.clientY - downPos.y)
    downPos = null
    if (moved > 6) return // 드래그(카메라 회전)는 클릭 아님
    const t = pickTile(ev.clientX, ev.clientY)
    if (t && opts.onCellClick) opts.onCellClick(t.hex)
  }
  renderer.domElement.addEventListener('pointermove', onMove)
  renderer.domElement.addEventListener('pointerdown', onDown)
  renderer.domElement.addEventListener('pointerup', onUp)

  function resize(): void {
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  const ro = new ResizeObserver(resize)
  ro.observe(container)
  resize()

  let raf = 0
  function loop(): void {
    raf = requestAnimationFrame(loop)
    controls.update()
    renderer.render(scene, camera)
  }
  loop()

  function ringAt(x: number, z: number, color: number, y: number): THREE.Mesh {
    const ring = new THREE.Mesh(ringGeo.clone(), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }))
    ring.rotation.x = Math.PI / 2
    ring.position.set(x, y, z)
    return ring
  }
  function update(state: GameState, hints: BoardHints = {}): void {
    for (const child of [...boardGroup.children]) disposeObject(child)
    boardGroup.clear()
    clickable.length = 0
    const keys = Object.keys(state.board)
    const hiveCells = new Set<string>()
    for (const hv of detectHives(state.board)) for (const c of hv.cells) hiveCells.add(c)
    // 보드 중심(센트로이드)으로 정렬 — 빈 보드면 원점.
    let cx = 0
    let cz = 0
    for (const k of keys) {
      const p = hexToXZ(hexFromKey(k))
      cx += p.x
      cz += p.z
    }
    if (keys.length > 0) {
      cx /= keys.length
      cz /= keys.length
    }
    const at = (h: Hex): { x: number; z: number } => {
      const p = hexToXZ(h)
      return { x: p.x - cx, z: p.z - cz }
    }
    // 타일 + 말
    for (const k of keys) {
      const cell = state.board[k]!
      const hex = hexFromKey(k)
      const { x, z } = at(hex)
      const tile = hexTile(cell.tile.owner, hiveCells.has(k))
      tile.position.set(x, 0, z)
      boardGroup.add(tile)
      clickable.push({ mesh: tile, hex })
      if (cell.piece) {
        const tk = buildPiece(cell.piece.owner, cell.piece.kind === 'queen')
        tk.scale.setScalar(PIECE_K)
        // 원판 바닥을 타일 윗면에 닿게(+0.3*K) 두되, 살짝(-0.06) 박아 넣어 떠 보이지 않게.
        tk.position.set(x, TILE_TOP + 0.3 * PIECE_K - 0.06, z)
        boardGroup.add(tk)
      }
    }
    // 프론티어(타일 놓을 빈 칸) — 초록 고스트 헥스, 클릭 가능
    for (const h of hints.frontier ?? []) {
      const { x, z } = at(h)
      const g = new THREE.Mesh(new THREE.CylinderGeometry(SIZE * 0.9, SIZE * 0.9, 0.06, 6), new THREE.MeshStandardMaterial({ color: 0x16a34a, transparent: true, opacity: 0.3, emissive: 0x16a34a, emissiveIntensity: 0.25 }))
      g.position.set(x, 0.03, z)
      boardGroup.add(g)
      clickable.push({ mesh: g, hex: h })
    }
    // 잠정 타일(드래프트) — 옅은 고스트 헥스, 클릭 가능
    for (const h of hints.provisional ?? []) {
      const { x, z } = at(h)
      const g = new THREE.Mesh(new THREE.CylinderGeometry(SIZE * 0.92, SIZE * 0.92, 0.18, 6), new THREE.MeshStandardMaterial({ color: 0xeac56a, transparent: true, opacity: 0.5 }))
      g.position.set(x, 0.09, z)
      boardGroup.add(g)
      clickable.push({ mesh: g, hex: h })
    }
    // 말 놓을 수 있는 타일 — 초록 링(시각)
    for (const h of hints.pieceTargets ?? []) {
      const { x, z } = at(h)
      boardGroup.add(ringAt(x, z, 0x16a34a, TILE_TOP + 0.04))
    }
    // 직전 말 — 파란 링(시각)
    if (hints.lastPiece) {
      const { x, z } = at(hints.lastPiece)
      boardGroup.add(ringAt(x, z, 0x2563eb, TILE_TOP + 0.05))
    }
  }

  function dispose(): void {
    cancelAnimationFrame(raf)
    ro.disconnect()
    renderer.domElement.removeEventListener('pointermove', onMove)
    renderer.domElement.removeEventListener('pointerdown', onDown)
    renderer.domElement.removeEventListener('pointerup', onUp)
    for (const child of [...boardGroup.children]) disposeObject(child)
    controls.dispose()
    renderer.dispose()
    if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement)
  }

  return { update, dispose }
}
