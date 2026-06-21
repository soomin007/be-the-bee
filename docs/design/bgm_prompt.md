# BGM 생성 프롬프트 (Suno)

게임 분위기에 맞는 배경음악을 Suno로 만들기 위한 프롬프트. 만든 뒤 파일을
**`public/bgm.mp3`** 로 저장하면 게임의 "🎵 BGM" 버튼으로 켤 수 있다(루프 재생).

## 공통 설정
- **Instrumental: ON** (가사 없음)
- 분위기: 벌·꿀·육각형, 아늑하고 집중되는 보드게임 라운지. 거슬리지 않고 **반복(loop)** 자연스럽게.
- 길이: 1~2분이면 충분(루프됨). 과한 빌드업/드롭 없이 잔잔하게.

## 프롬프트 후보 (하나 골라 입력)

### A. 아늑한 라운지 (추천 — 꿀/벌 감성)
```
warm cozy board-game lounge instrumental, soft vibraphone and marimba,
light upright bass, brushed drums, honey-warm and playful, relaxed focus,
gentle and unobtrusive, seamless loop, no vocals, 82 bpm
```

### B. 깜찍·호기심 (퍼즐 느낌)
```
whimsical cute puzzle-game background music, plucky pizzicato strings,
glockenspiel, light woodwinds, bouncy but gentle, curious and charming,
instrumental, looping, no vocals, 100 bpm
```

### C. 로파이 칠 (집중용)
```
chill lo-fi hip hop, dusty rhodes piano, soft vinyl crackle,
laid-back boom-bap drums, warm bass, calm and focused study beats,
instrumental, seamless loop, no vocals, 75 bpm
```

## 팁
- "Exclude styles"에 `aggressive, vocals, sudden drops` 정도를 넣으면 더 안정적.
- 마음에 들면 같은 프롬프트로 여러 번 생성해 가장 루프가 매끄러운 걸 고른다.
- 파일명은 반드시 `bgm.mp3`, 위치는 `public/` (빌드 시 자동 포함, 배포 URL에서도 동작).
