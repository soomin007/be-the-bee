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

const TILE_COLOR: Record<Player, number> = { yellow: 0xf0c531, brown: 0x97581d } // = 2D themes.ts tile.mid(honey)
// 원판색 = 2D themes.ts piece.body(honey) 와 동일 값 → 2D/3D 말 색 통일.
const DISC_COLOR: Record<Player, number> = { yellow: 0xe0a106, brown: 0x8a5418 }
const HIVE_BORDER = 0xf97316 // 완성된 벌집 테두리 = 2D hiveGlow(honey)
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
  lastTiles?: readonly Hex[] // 직전 수 타일(파란 테두리)
  reachDanger?: readonly Hex[] // 상대 리치 = 한 수면 상대 5목(빨강, 펄스)
  reachWin?: readonly Hex[] // 내 리치 = 한 수면 내 5목(주황, 펄스)
  winLine?: readonly Hex[] // 승리한 5목 라인(초록, 펄스)
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

// ---- 말(실사 꿀벌) = Claude Design 핸드오프 'Be the Bee 3D 말 (실사)' 이식.
//   핸드오프 스케일(원판 r2, 그룹 원점 = 원판 중심) → 스타일 토큰(buildPiece)과 같은 규약.
//   털 가슴(변형 구) + 줄무늬 배(텍스처) + 큰 겹눈 + 팔꿈치 더듬이 + 다리 6 + 맥 있는 날개 2쌍.
function realAbdomenTexture(): THREE.Texture {
  const cv = document.createElement('canvas')
  cv.width = 96
  cv.height = 512
  const x = cv.getContext('2d')!
  const amber = '#f2b80a' // 선명한 호박색(칙칙하지 않게, 2D 벌 몸통 톤)
  const dark = '#1c0f02' // 거의 검정 줄무늬 → 고대비
  const yToV = (v: number): number => (1 - v) * 512
  x.fillStyle = amber
  x.fillRect(0, 0, 96, 512)
  const band = (vTop: number, vBot: number): void => {
    const yT = yToV(vTop)
    const yB = yToV(vBot)
    const h = yB - yT
    const fuzz = 10
    const gg = x.createLinearGradient(0, yT - fuzz, 0, yB + fuzz)
    gg.addColorStop(0, 'rgba(28,15,2,0)')
    gg.addColorStop(fuzz / (h + 2 * fuzz), dark)
    gg.addColorStop(1 - fuzz / (h + 2 * fuzz), dark)
    gg.addColorStop(1, 'rgba(28,15,2,0)')
    x.fillStyle = gg
    x.fillRect(0, yT - fuzz, 96, h + 2 * fuzz)
  }
  band(0.86, 0.74)
  band(0.66, 0.52)
  band(0.44, 0.28)
  x.fillStyle = dark
  x.fillRect(0, yToV(0.2), 96, 512 - yToV(0.2))
  const t = new THREE.CanvasTexture(cv)
  t.anisotropy = 4
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
function realWingTexture(): THREE.Texture {
  const cv = document.createElement('canvas')
  cv.width = 256
  cv.height = 160
  const x = cv.getContext('2d')!
  x.clearRect(0, 0, 256, 160)
  x.fillStyle = 'rgba(214,184,130,0.22)'
  x.beginPath()
  x.ellipse(128, 80, 126, 78, 0, 0, Math.PI * 2)
  x.fill()
  x.strokeStyle = 'rgba(120,80,40,0.6)'
  x.lineWidth = 3
  x.beginPath()
  x.ellipse(128, 80, 122, 74, 0, Math.PI * 1.05, Math.PI * 1.95)
  x.stroke()
  x.strokeStyle = 'rgba(110,72,36,0.5)'
  x.lineWidth = 1.4
  for (const ty of [30, 60, 80, 100, 130]) {
    x.beginPath()
    x.moveTo(18, 80)
    x.quadraticCurveTo(130, (80 + ty) / 2, 238, ty)
    x.stroke()
  }
  x.lineWidth = 1
  x.beginPath()
  x.moveTo(150, 45)
  x.lineTo(158, 120)
  x.stroke()
  x.beginPath()
  x.moveTo(95, 50)
  x.lineTo(100, 116)
  x.stroke()
  const t = new THREE.CanvasTexture(cv)
  t.anisotropy = 4
  t.colorSpace = THREE.SRGBColorSpace
  return t
}
function buildRealBee(owner: Player, queen: boolean): THREE.Group {
  const discColor = DISC_COLOR[owner]
  const ax = new THREE.Vector3(0, 1, 0)
  const g = new THREE.Group()
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 0.6, 72), new THREE.MeshStandardMaterial({ color: discColor, roughness: 0.82 }))
  disc.castShadow = disc.receiveShadow = true
  g.add(disc)
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.93, 0.09, 14, 80), new THREE.MeshStandardMaterial({ color: discColor, roughness: 0.7 }))
  rim.rotation.x = Math.PI / 2
  rim.position.y = 0.3
  g.add(rim)

  const golden = new THREE.MeshStandardMaterial({ color: 0xe6a019, roughness: 1 }) // 선명한 꿀빛 가슴(칙칙X)
  const goldenHead = new THREE.MeshStandardMaterial({ color: 0xedaa22, roughness: 1 }) // 머리도 밝은 금색
  const darkLeg = new THREE.MeshStandardMaterial({ color: 0x241810, roughness: 0.45, metalness: 0.15 })
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0d0a06, roughness: 0.2 })

  const bee = new THREE.Group()
  bee.position.y = 0.72 // 다리로 서서 발이 원판 윗면에 닿음

  // 가슴(thorax) — 표면을 살짝 울퉁불퉁(털 느낌)
  const thoraxGeo = new THREE.SphereGeometry(1, 40, 32)
  {
    const p = thoraxGeo.attributes.position!
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i)
      const vy = p.getY(i)
      const vz = p.getZ(i)
      const n = 1 + 0.05 * Math.sin(vx * 9) * Math.cos(vz * 8) + 0.04 * Math.sin(vy * 11)
      p.setXYZ(i, vx * n, vy * n, vz * n)
    }
    thoraxGeo.computeVertexNormals()
  }
  const thorax = new THREE.Mesh(thoraxGeo, golden)
  thorax.scale.set(0.62, 0.6, 0.66)
  thorax.position.set(0, 0.2, 0.42)
  thorax.castShadow = true
  bee.add(thorax)

  // 허리(waist)
  const waist = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.22, 16), golden)
  waist.rotation.x = Math.PI / 2
  waist.position.set(0, 0.16, -0.05)
  bee.add(waist)

  // 배(abdomen) — 뒤로 가늘어지는 줄무늬 배
  const abGeo = new THREE.SphereGeometry(1, 56, 40)
  abGeo.rotateX(Math.PI / 2)
  {
    const p = abGeo.attributes.position!
    for (let i = 0; i < p.count; i++) {
      const zn = p.getZ(i)
      const f = zn < 0 ? Math.max(0.25, 1 + 0.55 * zn) : 1 - 0.12 * zn
      p.setX(i, p.getX(i) * f)
      p.setY(i, p.getY(i) * f)
      if (zn < 0) p.setZ(i, zn * 1.2)
    }
    abGeo.computeVertexNormals()
  }
  const abdomen = new THREE.Mesh(abGeo, new THREE.MeshStandardMaterial({ map: realAbdomenTexture(), roughness: 0.5 }))
  abdomen.scale.set(0.56, 0.54, 0.95)
  abdomen.position.set(0, 0.14, -0.78)
  abdomen.castShadow = true
  bee.add(abdomen)

  // 머리(head)
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 26), goldenHead)
  head.scale.set(0.42, 0.44, 0.38)
  head.position.set(0, 0.22, 1.12)
  head.castShadow = true
  bee.add(head)

  // 겹눈(compound eyes)
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 22), eyeMat)
    eye.scale.set(0.2, 0.3, 0.26)
    eye.position.set(s * 0.34, 0.26, 1.16)
    bee.add(eye)
  }

  // 더듬이(elbowed antennae) — 얼굴 앞에서 나와 굽음
  for (const s of [-1, 1]) {
    const base = new THREE.Vector3(s * 0.12, 0.3, 1.44)
    const d1 = new THREE.Vector3(s * 0.3, 0.22, 1).normalize()
    const l1 = 0.26
    const elbow = base.clone().addScaledVector(d1, l1)
    const seg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, l1, 10), darkLeg)
    seg1.position.copy(base.clone().addScaledVector(d1, l1 / 2))
    seg1.quaternion.setFromUnitVectors(ax, d1)
    bee.add(seg1)
    const d2 = new THREE.Vector3(s * 0.14, -0.18, 0.97).normalize()
    const l2 = 0.34
    const seg2 = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, l2, 10), darkLeg)
    seg2.position.copy(elbow.clone().addScaledVector(d2, l2 / 2))
    seg2.quaternion.setFromUnitVectors(ax, d2)
    bee.add(seg2)
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.034, 12, 12), darkLeg)
    tip.position.copy(elbow.clone().addScaledVector(d2, l2))
    bee.add(tip)
  }

  // 다리 6개(hip→knee→foot)
  const segLeg = (a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number): void => {
    const d = b.clone().sub(a)
    const len = d.length()
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, len, 8), darkLeg)
    m.position.copy(a.clone().add(b).multiplyScalar(0.5))
    m.quaternion.setFromUnitVectors(ax, d.normalize())
    bee.add(m)
  }
  ;[0.62, 0.2, -0.2].forEach((lz, idx) => {
    for (const s of [-1, 1]) {
      const hip = new THREE.Vector3(s * 0.4, -0.02, lz)
      const out = 0.4 + idx * 0.04
      const knee = new THREE.Vector3(s * (0.4 + out), -0.24, lz + (idx === 0 ? 0.16 : idx === 2 ? -0.16 : 0))
      const foot = new THREE.Vector3(knee.x + s * 0.08, -0.42, knee.z + (idx === 0 ? 0.26 : idx === 2 ? -0.26 : 0))
      segLeg(hip, knee, 0.03, 0.04)
      segLeg(knee, foot, 0.02, 0.025)
    }
  })

  // 날개(2쌍, 맥 있는 반투명 막) — 가슴 위에서 뒤로 펼침
  const wingMat = new THREE.MeshStandardMaterial({ map: realWingTexture(), color: 0xf0e2c4, transparent: true, opacity: 0.78, roughness: 0.3, side: THREE.DoubleSide, depthWrite: false })
  const addWing = (root: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, length: number, halfW: number): void => {
    for (const s of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.CircleGeometry(1, 40), wingMat)
      wing.geometry.translate(1, 0, 0) // 뿌리를 원점에, 막은 +x 로 뻗음
      wing.scale.set(length, halfW, 1)
      wing.position.set(s * root.x, root.y, root.z)
      const d = new THREE.Vector3(s * dir.x, dir.y, dir.z).normalize()
      wing.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d)
      bee.add(wing)
    }
  }
  addWing({ x: 0.12, y: 0.82, z: 0.32 }, { x: 0.34, y: 0.12, z: -0.93 }, 1.05, 0.36) // 앞날개(큼)
  addWing({ x: 0.14, y: 0.78, z: 0.2 }, { x: 0.46, y: 0.05, z: -0.89 }, 0.7, 0.26) // 뒷날개(작음)

  g.add(bee)

  if (queen) {
    const gmat = new THREE.MeshStandardMaterial({ color: 0xffd24a, roughness: 0.32, metalness: 0.55 })
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.16, 18), gmat)
    band.position.set(0, 0.62, 1.12)
    bee.add(band)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const sp = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 8), gmat)
      sp.position.set(Math.sin(a) * 0.17, 0.74, 1.12 + Math.cos(a) * 0.17)
      bee.add(sp)
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.05, 12, 90), new THREE.MeshStandardMaterial({ color: 0xcf2a1c, roughness: 0.5 }))
    ring.rotation.x = Math.PI / 2
    ring.position.y = 0.32
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
  const targetCenter = new THREE.Vector3() // 보드 중심 목표(−centroid). loop 에서 부드럽게 따라감.
  let centered = false // 첫 표시는 스냅(슬라이드-인 방지), 이후는 매 수마다 부드럽게 이동
  // 클릭 가능한 칸(보드 타일 + 프론티어/잠정 고스트). 레이캐스팅 대상.
  const clickable: { mesh: THREE.Mesh; hex: Hex }[] = []
  const pulsers: THREE.Mesh[] = [] // 펄스 애니메이션(리치·승리 라인 링), loop 에서 깜빡임

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
    // 보드 중심을 목표로 부드럽게 슬라이드(매 수마다 확 점프하지 않게). 이미 도달했으면 정지.
    boardGroup.position.lerp(targetCenter, 0.12)
    // 리치·승리 링 펄스(2D 의 buzz/pulse 모션에 대응) — 밝기 + 크기 깜빡임.
    if (pulsers.length > 0) {
      const p = 0.5 + 0.5 * Math.sin(performance.now() * 0.006)
      for (const m of pulsers) {
        ;(m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.35 + 0.65 * p
        m.scale.setScalar(1 + 0.14 * p)
      }
    }
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
    pulsers.length = 0
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
    // 보드를 원점에 맞추되, 매 수마다 '확' 옮기지 않고 그룹 위치를 부드럽게 따라가게(loop 의 lerp).
    // 칸들은 절대 좌표로 두고, 중심 맞춤은 boardGroup.position 한 곳에서만 처리.
    targetCenter.set(-cx, 0, -cz)
    if (!centered) {
      boardGroup.position.copy(targetCenter)
      centered = true
    }
    const at = (h: Hex): { x: number; z: number } => {
      const p = hexToXZ(h)
      return { x: p.x, z: p.z }
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
        // 실사·일반 둘 다 핸드오프 스케일(원판 r2, 그룹 원점=원판 중심) → 같은 축소·배치.
        const tk = style === 'realistic' ? buildRealBee(cell.piece.owner, queen) : buildPiece(cell.piece.owner, queen)
        tk.scale.setScalar(PIECE_K)
        tk.position.set(x, TILE_TOP + 0.3 * PIECE_K - 0.08, z)
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
      boardGroup.add(ringAt(x, z, 0x16a34a, TILE_TOP + 0.01))
    }
    // 직전 말 — 파란 링(시각)
    if (hints.lastPiece) {
      const { x, z } = at(hints.lastPiece)
      boardGroup.add(ringAt(x, z, 0x2563eb, TILE_TOP + 0.016))
    }
    // 직전 수 타일 — 파란 링(2D 의 파란 점선 테두리에 대응)
    for (const h of hints.lastTiles ?? []) {
      const { x, z } = at(h)
      boardGroup.add(ringAt(x, z, 0x2563eb, TILE_TOP + 0.016))
    }
    // 리치/승리 — 펄스 링(2D 색 그대로): 상대 리치=빨강, 내 리치=주황, 승리 5목=초록
    const addPulse = (cells: readonly Hex[] | undefined, color: number, y: number): void => {
      for (const h of cells ?? []) {
        const { x, z } = at(h)
        const r = ringAt(x, z, color, y)
        boardGroup.add(r)
        pulsers.push(r)
      }
    }
    addPulse(hints.reachDanger, 0xdc2626, TILE_TOP + 0.022)
    addPulse(hints.reachWin, 0xf59e0b, TILE_TOP + 0.024)
    addPulse(hints.winLine, 0x16a34a, TILE_TOP + 0.026)
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
