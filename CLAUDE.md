# QuizGround-LoadTest

Artillery를 사용해 [QuizGround](https://github.com/boostcampwm-2024/web10-boostproject) 백엔드 소켓 서버를 부하테스트하는 프로젝트.

## 프로젝트 구조

```
.
├── create-room.js       # 테스트용 게임방 생성 (npm run init:* 으로 실행)
├── processors.js        # Artillery 커스텀 함수 (setPlayerName, updatePosition, chatMessage)
├── game-scenario.yml    # Artillery 시나리오 정의 (Socket.io 엔진 사용)
├── thread-counter.txt   # 접속 인원 카운팅용 임시 파일 (자동 생성)
└── package.json
```

## 실행 방법

> 사전 조건: `npm install -g artillery` 및 `npm install`

터미널 2개를 준비한다.

**1번 터미널 - 게임방 생성:**
```bash
npm run init:dev    # localhost:3000
npm run init:prod   # quizground.site:3333
```

**2번 터미널 - 부하테스트 실행:**
```bash
npm run start:dev   # localhost:3000
npm run start:prod  # quizground.site:3333 (GAME_ID 환경변수 필요)
```

## 환경변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `TARGET` | 소켓 서버 URL | `http://localhost:3000/game` |
| `GAME_ID` | 테스트할 게임방 ID | - |
| `DURATION` | 초기화 대기 시간(ms) | - |

## 주요 상수 (processors.js)

- `MIN_PLAYERS_FOR_TEST` (100): 게임 시작 전 대기할 최소 플레이어 수
- `DURATION_TIME` (20000): `game-scenario.yml`의 `duration`과 동일하게 맞춰야 함
- `FIRST_WAIT_TIME`: 플레이어 대기 타임아웃 (`DURATION_TIME + 10000`)

> `game-scenario.yml`의 `duration`을 변경하면 `processors.js`의 `DURATION_TIME`도 함께 변경해야 한다.

## 시나리오 흐름

1. `setPlayerName` — 소켓 연결 후 플레이어 이름 설정, `MIN_PLAYERS_FOR_TEST`명이 모일 때까지 대기
2. `updatePosition` — 랜덤 좌표로 위치 업데이트 (0.3~0.7초 간격)
3. `chatMessage` — 랜덤 메시지 전송 (0.3~0.7초 간격)

## 트러블슈팅

- **NaN이 뜨면**: 테스트를 재실행한다.
- **플레이어 수 부족**: `game-scenario.yml`의 `arrivalRate * duration`이 `MIN_PLAYERS_FOR_TEST` 이상인지 확인한다.
- **타임아웃 에러**: `FIRST_WAIT_TIME`을 늘리거나 `MIN_PLAYERS_FOR_TEST`를 낮춘다.
