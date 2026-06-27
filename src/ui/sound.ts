// 효과음(Web Audio 합성) + 배경음악(BGM 파일). ui 계층. 엔진과 무관.
//
// 효과음은 합성 → 파일 불필요. BGM 은 public/bgm/*.mp3 (사용자가 Suno로 생성해 넣음).
// 볼륨은 효과음/BGM 각각 0~1.

import type { Player } from '../engine/index'

export interface BgmTrack {
  file: string
  title: string
  artist: string
}

// public/bgm/ 의 곡들. 빌드 시 dist/bgm/ 로 포함되어 배포 URL에서도 동작.
const OST = 'Be the Bee OST'
export const BGM_TRACKS: BgmTrack[] = [
  { file: 'board-game-lounge.mp3', title: 'Board Game Lounge', artist: OST },
  { file: 'board-game-lounge-2.mp3', title: 'Board Game Lounge II', artist: OST },
  { file: 'puzzle-quest.mp3', title: 'Puzzle Quest', artist: OST },
  { file: 'puzzle-quest-2.mp3', title: 'Puzzle Quest II', artist: OST },
  { file: 'midnight-study.mp3', title: 'Midnight Study', artist: OST },
  { file: 'midnight-study-2.mp3', title: 'Midnight Study II', artist: OST },
  { file: 'bonus-1.mp3', title: 'Hive Gambit', artist: OST }, // Suno 제목 "벌집의 한 수"
  { file: 'bonus-2.mp3', title: 'Hive Gambit II', artist: OST },
]

type OscType = 'sine' | 'triangle' | 'square' | 'sawtooth'

export interface Sound {
  setSfxVolume(v: number): void
  place(player: Player): void
  win(): void
  hive(): void
  alert(): void
  invalid(): void
  setBgmTrack(file: string): void
  setBgmVolume(v: number): void
  toggleMusic(): boolean // 재생/정지 토글, 토글 후 켜짐 여부 반환
  musicOn(): boolean
  // 미니 플레이어용 — 실제 오디오 진행/길이/탐색 + 진행·종료 콜백.
  currentTime(): number // 현재 재생 위치(초). 미재생/미로드면 0.
  duration(): number // 현재 곡 길이(초). 미로드/무한이면 0.
  seek(t: number): void // 재생 위치 이동(초).
  onProgress(cb: () => void): void // timeupdate/메타로드 시 호출(진행바 갱신용).
  onEnded(cb: () => void): void // 곡이 끝났을 때 호출(다음 곡/반복은 호출자가 결정).
}

export function createSound(): Sound {
  let ctx: AudioContext | null = null
  let sfxVolume = 0.6

  let music: HTMLAudioElement | null = null
  let wantMusic = false
  let bgmVolume = 0.35
  let progressCb: () => void = () => {} // 미니 플레이어 진행바 갱신 콜백(timeupdate/메타로드)
  let endedCb: () => void = () => {} // 곡 종료 콜백(다음 곡/반복은 호출자가 결정)
  let currentFile = BGM_TRACKS[0]!.file

  function audio(): AudioContext | null {
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!ctx) ctx = new Ctor()
      if (ctx.state === 'suspended') void ctx.resume()
      return ctx
    } catch {
      return null
    }
  }

  function tone(freq: number, dur: number, type: OscType, when = 0, peak = 0.2): void {
    if (sfxVolume <= 0) return
    const c = audio()
    if (!c) return
    const t0 = c.currentTime + when
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.linearRampToValueAtTime(peak * sfxVolume, t0 + 0.012)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(c.destination)
    osc.start(t0)
    osc.stop(t0 + dur + 0.03)
  }

  // 날갯짓 버즈, 톱니파 + 진폭 트레몰로(LFO)로 "붕" 하는 벌 날갯짓 느낌. 짧고 작게.
  function buzz(freq: number, dur: number, when = 0, peak = 0.07): void {
    if (sfxVolume <= 0) return
    const c = audio()
    if (!c) return
    const t0 = c.currentTime + when
    const osc = c.createOscillator()
    const g = c.createGain()
    const lfo = c.createOscillator()
    const lfoGain = c.createGain()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(freq, t0)
    lfo.type = 'sine' // 날갯짓 트레몰로 ~52Hz
    lfo.frequency.setValueAtTime(52, t0)
    lfoGain.gain.setValueAtTime(peak * sfxVolume * 0.6, t0)
    lfo.connect(lfoGain)
    lfoGain.connect(g.gain)
    g.gain.setValueAtTime(peak * sfxVolume * 0.45, t0)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g)
    g.connect(c.destination)
    osc.start(t0)
    lfo.start(t0)
    osc.stop(t0 + dur + 0.03)
    lfo.stop(t0 + dur + 0.03)
  }

  function bgmUrl(file: string): string {
    return `${import.meta.env.BASE_URL}bgm/${file}`
  }

  function ensureMusic(): HTMLAudioElement {
    if (!music) {
      music = new Audio(bgmUrl(currentFile))
      music.loop = false // 반복/다음 곡은 onEnded 로 호출자(미니 플레이어)가 결정
      music.volume = bgmVolume
      music.addEventListener('timeupdate', () => progressCb())
      music.addEventListener('loadedmetadata', () => progressCb())
      music.addEventListener('ended', () => endedCb())
    }
    return music
  }

  return {
    setSfxVolume(v: number): void {
      sfxVolume = Math.max(0, Math.min(1, v))
    },

    place(player: Player): void {
      // 착지 띵 + 그 아래로 짧은 날갯짓 버즈를 깔아 "벌이 앉는" 느낌.
      buzz(player === 'yellow' ? 232 : 196, 0.12, 0, 0.07)
      tone(player === 'yellow' ? 660 : 392, 0.14, 'triangle', 0.03, 0.18)
      tone(player === 'yellow' ? 990 : 588, 0.1, 'sine', 0.05, 0.06)
    },
    win(): void {
      const notes = [523.25, 659.25, 783.99, 1046.5]
      notes.forEach((f, i) => tone(f, 0.22, 'triangle', i * 0.1, 0.2))
    },
    hive(): void {
      // 벌집 완성, 꿀이 차오르는 따뜻한 상승음 + 낮은 바탕 스웰.
      const notes = [392, 523.25, 659.25]
      notes.forEach((f, i) => tone(f, 0.3, 'sine', i * 0.09, 0.13))
      tone(196, 0.55, 'triangle', 0, 0.07)
    },
    alert(): void {
      tone(880, 0.12, 'sine', 0, 0.16)
      tone(740, 0.16, 'sine', 0.13, 0.16)
    },
    invalid(): void {
      tone(160, 0.18, 'sawtooth', 0, 0.12)
    },

    setBgmTrack(file: string): void {
      currentFile = file
      if (music) {
        music.src = bgmUrl(file)
        music.volume = bgmVolume
        if (wantMusic) void music.play().catch(() => {})
      }
    },
    setBgmVolume(v: number): void {
      bgmVolume = Math.max(0, Math.min(1, v))
      if (music) music.volume = bgmVolume
    },
    toggleMusic(): boolean {
      wantMusic = !wantMusic
      if (wantMusic) {
        const m = ensureMusic()
        m.volume = bgmVolume
        void m.play().catch(() => {
          wantMusic = false
        })
      } else if (music) {
        music.pause()
      }
      return wantMusic
    },
    musicOn(): boolean {
      return wantMusic
    },
    currentTime(): number {
      return music ? music.currentTime : 0
    },
    duration(): number {
      return music && isFinite(music.duration) ? music.duration : 0
    },
    seek(t: number): void {
      if (music) music.currentTime = Math.max(0, t)
    },
    onProgress(cb: () => void): void {
      progressCb = cb
    },
    onEnded(cb: () => void): void {
      endedCb = cb
    },
  }
}
