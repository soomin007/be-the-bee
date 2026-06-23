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
// 원판색: 타일색과 같은 꿀빛 팔레트로(노란 원판이 타일보다 너무 어둡지 않게). 갈색은 통일.
const DISC_COLOR: Record<Player, number> = { yellow: 0xe8be3e, brown: 0x6f3529 }
const HIVE_BORDER = 0xf59e0b // 완성된 벌집 테두리(2D hiveGlow 와 같은 금색)
const SIZE = 1 // 3D 헥스 크기(중심→꼭짓점)
const TILE_TOP = 0.22 // 타일 윗면 y
const PIECE_K = 0.33 // 핸드오프 말(원판 r2)을 타일에 맞게 축소

/** 3D 말 스타일: 일반(핸드오프 스타일 토큰) / 실사(사실적 꿀벌). */
export type PieceStyle = 'stylized' | 'realistic'

export interface Board3DOptions {
  /** 셀(헥스) 클릭 시 호출. 실제 수 적용은 호출 측이 SVG 와 동일하게 처리. */
  onCellClick?: (h: Hex) => void
  autoRotate?: boolean
  style?: PieceStyle
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
  /** 말 스타일(일반/실사) 전환. 다음 update 부터 반영(호출 측이 update 재호출). */
  setStyle(style: PieceStyle): void
  /** 카메라(시점·줌)를 처음 위치로 되돌린다. */
  resetCamera(): void
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

// ---- 말(실사 꿀벌) = three-demo-real 포팅. 그룹 원점 = 타일 접촉면(y=0), 원판 바닥 y≈0.22. ----
// 색: 칙칙함·"징그러움" 완화 — 머리를 가슴처럼 노랗게(실제 벌도 머리가 노랑), 전반적으로 더 밝게.
const REAL_BODY = 0xc88f2e // 가슴·머리 공통 황금색(밝게)
function limb3(a: [number, number, number], b: [number, number, number], radius: number, color: number): THREE.Mesh {
  const va = new THREE.Vector3(...a)
  const vb = new THREE.Vector3(...b)
  const dir = new THREE.Vector3().subVectors(vb, va)
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.8, dir.length(), 8), new THREE.MeshStandardMaterial({ color, roughness: 0.5 }))
  m.position.copy(va).add(vb).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  m.castShadow = true
  return m
}
function abdomenTexture(): THREE.Texture {
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 256
  const x = c.getContext('2d')!
  x.fillStyle = '#f2b80a' // 진한 노랑(고대비)
  x.fillRect(0, 0, 64, 256)
  x.fillStyle = '#160d04' // 검정 줄무늬(거의 검정 — 노랑과 고대비)
  for (const y of [10, 70, 130, 190]) x.fillRect(0, y, 64, 28)
  x.fillRect(0, 232, 64, 24)
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 4
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
function abdomenProfile(): THREE.Vector2[] {
  return [
    [0.02, 0.0],
    [0.1, 0.05],
    [0.2, 0.15],
    [0.29, 0.33],
    [0.33, 0.54],
    [0.33, 0.74],
    [0.28, 0.9],
    [0.18, 1.0],
  ].map(([x, y]) => new THREE.Vector2(x, y))
}
function buildRealBee(owner: Player, queen: boolean): THREE.Group {
  const g = new THREE.Group()
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.14, 44), new THREE.MeshStandardMaterial({ color: DISC_COLOR[owner], roughness: 0.6 }))
  disc.position.y = 0.29
  disc.castShadow = disc.receiveShadow = true
  g.add(disc)
  const beeGrp = new THREE.Group()
  const Y = 0.64
  const abdomen = new THREE.Mesh(new THREE.LatheGeometry(abdomenProfile(), 40), new THREE.MeshStandardMaterial({ map: abdomenTexture(), roughness: 0.5 }))
  abdomen.rotation.x = Math.PI / 2
  abdomen.scale.set(1.0, 0.95, 0.78)
  abdomen.position.set(0, Y, -0.82)
  abdomen.castShadow = true
  beeGrp.add(abdomen)
  const thorax = new THREE.Mesh(new THREE.SphereGeometry(0.27, 28, 22), new THREE.MeshStandardMaterial({ color: REAL_BODY, roughness: 0.85 }))
  thorax.scale.set(1.05, 0.92, 1.0)
  thorax.position.set(0, Y + 0.03, 0.12)
  thorax.castShadow = true
  beeGrp.add(thorax)
  // 머리도 가슴처럼 노랗게(검고 큰 머리가 징그러움의 원인) — 살짝 작게도.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.165, 26, 20), new THREE.MeshStandardMaterial({ color: REAL_BODY, roughness: 0.6 }))
  head.scale.set(1.05, 0.95, 0.9)
  head.position.set(0, Y + 0.01, 0.5)
  head.castShadow = true
  beeGrp.add(head)
  // 검은 겹눈 — 머리 옆쪽(더듬이와 겹치지 않게)
  for (const dir of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 12), new THREE.MeshStandardMaterial({ color: 0x140e06, roughness: 0.25 }))
    eye.scale.set(0.82, 1.15, 0.8)
    eye.position.set(dir * 0.14, Y + 0.05, 0.5)
    beeGrp.add(eye)
  }
  // 더듬이 — 얼굴 앞-중앙(눈이 아니라)에서 나와 앞·위로 길게 굽음(팔꿈치형). 눈에서 분리.
  for (const dir of [-1, 1]) {
    const base: [number, number, number] = [dir * 0.04, Y - 0.01, 0.64]
    const elbow: [number, number, number] = [dir * 0.09, Y + 0.13, 0.73]
    const tip: [number, number, number] = [dir * 0.07, Y + 0.31, 0.75]
    beeGrp.add(limb3(base, elbow, 0.013, 0x1c140a))
    beeGrp.add(limb3(elbow, tip, 0.011, 0x1c140a))
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 10, 8), new THREE.MeshStandardMaterial({ color: 0x1c140a, roughness: 0.5 }))
    knob.position.set(tip[0], tip[1], tip[2])
    beeGrp.add(knob)
  }
  const legY = Y - 0.14
  for (const dir of [-1, 1]) {
    for (const [zin, zout] of [[0.24, 0.46], [0.08, 0.12], [-0.06, -0.28]]) {
      beeGrp.add(limb3([dir * 0.15, legY, zin!], [dir * 0.5, 0.36, zout!], 0.016, 0x1c140a))
    }
  }
  const wingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, roughness: 0.15, side: THREE.DoubleSide, depthWrite: false })
  for (const dir of [-1, 1]) {
    const root = new THREE.Vector3(dir * 0.05, Y + 0.26, 0.14)
    const tip = new THREE.Vector3(dir * 0.44, Y + 0.18, -0.5)
    const wing = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), wingMat)
    wing.scale.set(0.17, 0.012, new THREE.Vector3().subVectors(tip, root).length() / 2)
    wing.position.copy(root.clone().add(tip).multiplyScalar(0.5))
    wing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tip.clone().sub(root).normalize())
    beeGrp.add(wing)
  }
  g.add(beeGrp)
  beeGrp.scale.setScalar(0.85)
  beeGrp.position.y = 0.36 * (1 - 0.85)
  if (queen) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.03, 12, 60), new THREE.MeshStandardMaterial({ color: 0xcf2a1c, roughness: 0.5 }))
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.37
    g.add(ring)
  }
  return g
}

function hexTile(owner: Player): THREE.Mesh {
  // 벌집이어도 타일 기본(꿀빛)색 유지 — 벌집 표시는 update 의 금색 테두리로(2D 와 동일).
  const m = new THREE.MeshStandardMaterial({ color: TILE_COLOR[owner], roughness: 0.7, metalness: 0.04 })
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
  let style: PieceStyle = opts.style ?? 'stylized'
  const CAM_POS = new THREE.Vector3(2.5, 9, 9.5) // 카메라 리셋 기준
  const CAM_TARGET = new THREE.Vector3(0, 0.4, 0)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
  camera.position.copy(CAM_POS)

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.style.display = 'block'
  renderer.domElement.style.touchAction = 'none'
  container.appendChild(renderer.domElement)

  // 2D(평면 단색)보다 어두워 보이는 건 3D 조명 음영 때문 → 앰비언트(전역광)를 크게 올려
  // 그림자를 채우고 전체를 밝게(2D 색에 근접). 방향광은 형태감만 약하게.
  scene.add(new THREE.AmbientLight(0xfffbf2, 1.15))
  const key = new THREE.DirectionalLight(0xfffaf0, 0.95)
  key.position.set(-3, 16, 5) // 더 위에서 → 말·원판 그림자가 짧아져 "떠 있는" 느낌 감소
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.near = 1
  key.shadow.camera.far = 40
  key.shadow.camera.left = -12
  key.shadow.camera.right = 12
  key.shadow.camera.top = 12
  key.shadow.camera.bottom = -12
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xffffff, 0.4)
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

  // 호버/선택 링(게임 색: 초록=둘 수 있음, 파랑=직전/선택). 6각 토러스를 타일 방향에 맞춘다:
  // 보드 면(XZ)에 눕히고(rotateX), 육각 꼭짓점을 pointy-top 타일에 맞추려 30° 보정(rotateY).
  const ringGeo = new THREE.TorusGeometry(SIZE * 0.84, 0.05, 10, 6)
  ringGeo.rotateX(Math.PI / 2)
  ringGeo.rotateY(Math.PI / 6)
  // 완성된 벌집 테두리(타일 모서리에 두르는 금색 육각 링 — 2D 의 hiveGlow 테두리에 대응)
  const hiveBorderGeo = new THREE.TorusGeometry(SIZE * 0.92, 0.055, 8, 6)
  hiveBorderGeo.rotateX(Math.PI / 2)
  hiveBorderGeo.rotateY(Math.PI / 6)
  const hoverRing = new THREE.Mesh(ringGeo, new THREE.MeshStandardMaterial({ color: 0x16a34a, emissive: 0x16a34a, emissiveIntensity: 0.7 }))
  hoverRing.visible = false
  scene.add(hoverRing)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.copy(CAM_TARGET)
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
      hoverRing.position.set(w.x, TILE_TOP + 0.008, w.z)
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
      const tile = hexTile(cell.tile.owner)
      tile.position.set(x, 0, z)
      boardGroup.add(tile)
      clickable.push({ mesh: tile, hex })
      // 완성된 벌집 타일: 금색 육각 테두리(2D 와 동일하게 색 대신 테두리로 표시)
      if (hiveCells.has(k)) {
        const border = new THREE.Mesh(hiveBorderGeo.clone(), new THREE.MeshStandardMaterial({ color: HIVE_BORDER, emissive: HIVE_BORDER, emissiveIntensity: 0.55 }))
        border.position.set(x, TILE_TOP - 0.015, z) // 타일 윗면 모서리에 박히게(떠 보이지 않게)
        boardGroup.add(border)
      }
      if (cell.piece) {
        const queen = cell.piece.kind === 'queen'
        if (style === 'realistic') {
          // 실사 벌: 그룹 원점=타일 접촉면. 좀 크다는 의견 → 0.85 축소(원판 바닥 ≈ TILE_TOP-0.06).
          const tk = buildRealBee(cell.piece.owner, queen)
          tk.scale.setScalar(0.85)
          tk.position.set(x, -0.05, z)
          boardGroup.add(tk)
        } else {
          // 일반(스타일 토큰): 원판 r2 → PIECE_K 축소, 원판 바닥을 타일 윗면에 닿게 + 살짝 박음.
          const tk = buildPiece(cell.piece.owner, queen)
          tk.scale.setScalar(PIECE_K)
          tk.position.set(x, TILE_TOP + 0.3 * PIECE_K - 0.08, z)
          boardGroup.add(tk)
        }
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
      boardGroup.add(ringAt(x, z, 0x16a34a, TILE_TOP + 0.01))
    }
    // 직전 말 — 파란 링(시각)
    if (hints.lastPiece) {
      const { x, z } = at(hints.lastPiece)
      boardGroup.add(ringAt(x, z, 0x2563eb, TILE_TOP + 0.016))
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

  function setStyle(s: PieceStyle): void {
    style = s
  }
  function resetCamera(): void {
    camera.position.copy(CAM_POS)
    controls.target.copy(CAM_TARGET)
    controls.update()
  }

  return { update, setStyle, resetCamera, dispose }
}
