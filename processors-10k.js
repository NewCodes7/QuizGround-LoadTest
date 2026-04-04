const fs = require('fs').promises;
const fsSync = require('fs');

/*
 * 상수 정의
 *
 * Fargate 분산 실행 시:
 *   artillery run-fargate --count 10 → WORKERS_COUNT=10 환경변수 함께 전달
 *   각 worker는 TOTAL_PLAYERS / WORKERS_COUNT 명 담당
 */
const TOTAL_PLAYERS = 10000;
const WORKERS_COUNT = parseInt(process.env.WORKERS_COUNT) || 1;
const EXPECTED_PLAYERS = Math.ceil(TOTAL_PLAYERS / WORKERS_COUNT);

const GAME_ID = process.env.GAME_ID;

const CONNECTION_TIMEOUT = 80000;  // spike(10s) + 여유(70s) = 80초
const PRE_GAME_WAIT = 60000;       // 전원 접속 후 1분 대기 후 게임 시작
const GAME_DURATION = 600000;      // 게임 진행 10분

/*
 * 카운터 (append 방식 — 기존 read-modify-write 대비 race condition 없음)
 *
 * 각 vuser가 파일에 한 줄 append → 줄 수 = 현재 접속 인원
 * POSIX append는 OS 레벨에서 atomic하므로 동시 접근 시에도 데이터 손실 없음
 */
const COUNTER_FILE = 'thread-counter-10k.txt';

try {
    fsSync.writeFileSync(COUNTER_FILE, '', 'utf8');
} catch (err) {
    console.error('카운터 파일 초기화 실패:', err);
}

async function incrementCounter() {
    try {
        await fs.appendFile(COUNTER_FILE, '1\n', 'utf8');
    } catch (err) {
        console.error('카운트 증가 실패:', err);
    }
}

async function checkCounter() {
    try {
        const content = await fs.readFile(COUNTER_FILE, 'utf8');
        return content.trim().split('\n').filter(Boolean).length;
    } catch (err) {
        console.error('카운트 읽기 실패:', err);
        return 0;
    }
}

/*
 * setPlayerName
 *
 * 흐름:
 *   1. getSelfId 수신 → setPlayerName emit
 *   2. setPlayerName 응답 수신 → incrementCounter()
 *   3. 폴링: EXPECTED_PLAYERS명 접속 완료까지 1초마다 확인
 *   4. 전원 접속 완료 → PRE_GAME_WAIT(1분) 대기
 *   5. done() → gameLoop 진입
 *
 * 실패 처리:
 *   CONNECTION_TIMEOUT 초과 시 → done(Error) → Artillery가 해당 vuser 실패 기록
 */
function setPlayerName(userContext, events, done) {
    let resolved = false;
    let timeoutId;

    userContext.vars.userId = `spike-${Math.random().toString(36).slice(2)}`;

    const socket = userContext.sockets[''];

    const fail = (reason) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeoutId);
        console.error(`[FAIL] setPlayerName: ${reason}`);
        events.emit('counter', 'total_count.fail.set_player_name', 1);
        done(new Error(reason));
    };

    socket.on('getSelfId', (response) => {
        userContext.vars.myPlayerId = response.playerId;
        socket.emit('setPlayerName', { playerName: userContext.vars.userId });
    });

    socket.on('setPlayerName', async (response) => {
        const { playerId, playerName } = response;
        if (playerId !== userContext.vars.myPlayerId || playerName !== userContext.vars.userId) return;
        if (resolved) return;

        await incrementCounter();

        const waitForAll = async () => {
            if (resolved) return;
            const count = await checkCounter();
            console.log(`접속 대기 중... ${count}/${EXPECTED_PLAYERS}명`);

            if (count >= EXPECTED_PLAYERS) {
                console.log(`전원 접속 완료(${count}명). ${PRE_GAME_WAIT / 1000}초 후 게임 시작.`);
                setTimeout(() => {
                    if (!resolved) {
                        resolved = true;
                        clearTimeout(timeoutId);
                        done();
                    }
                }, PRE_GAME_WAIT);
            } else {
                setTimeout(waitForAll, 1000);
            }
        };

        waitForAll();
    });

    timeoutId = setTimeout(() => {
        fail('접속 타임아웃 — 전원 접속 실패');
    }, CONNECTION_TIMEOUT);
}

/*
 * gameLoop
 *
 * 랜덤 간격 재귀 setTimeout으로 실제 사용자 행동 모사:
 *   - 위치변경: 평균 2회/초 (300~700ms 간격)
 *   - 채팅:     평균 0.5회/초 (1,500~2,500ms 간격)
 *   → 이벤트 비율: 4:1 = 80%:20%
 *
 * GAME_DURATION(10분) 후 done() → 소켓 해제
 * vuser들이 시간차로 종료 → Phase 4(점진적 접속 해제) 자연 구현
 */
function gameLoop(userContext, events, done) {
    const socket = userContext.sockets[''];
    const endTime = Date.now() + GAME_DURATION;

    function schedulePosition() {
        if (Date.now() >= endTime) return;
        socket.emit('updatePosition', {
            gameId: GAME_ID,
            newPosition: [Math.random(), Math.random()]
        });
        setTimeout(schedulePosition, Math.random() * 400 + 300);
    }

    function scheduleChat() {
        if (Date.now() >= endTime) return;
        socket.emit('chatMessage', {
            gameId: GAME_ID,
            message: `spike-test ${Math.random()}`
        });
        setTimeout(scheduleChat, Math.random() * 1000 + 1500);
    }

    schedulePosition();
    scheduleChat();

    setTimeout(done, GAME_DURATION);
}

module.exports = {
    setPlayerName,
    gameLoop
};
