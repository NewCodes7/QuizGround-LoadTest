const fs = require('fs').promises;
const fsSync = require('fs');
const io = require('socket.io-client');
const msgpackParser = require('./msgpackr-parser');

/* 
* 초기 필요한 상수 정의 
*/
const MIN_PLAYERS_FOR_TEST = 100;
const GAME_ID = process.env.GAME_ID;

// TODO: 상수 설정 자동화
const DURATION_TIME = 20000; // game-scenraio.yml duration과 동일하게 설정
const FIRST_WAIT_TIME = DURATION_TIME + 10000;

/* 
* 플레이어가 현재 몇 명 접속했는지 파악하기 위한 파일 관련 함수
*/
const COUNTER_FILE = 'thread-counter.txt';

try {
    fsSync.writeFileSync(COUNTER_FILE, '0', 'utf8');
} catch (err) {
    console.error('파일 읽기 실패:', err);
}

async function incrementCounter() {
    try {
        const currentCount = await fs.readFile(COUNTER_FILE, 'utf8');
        const newCount = parseInt(currentCount) + 1;
        await fs.writeFile(COUNTER_FILE, newCount.toString(), 'utf8');
        return newCount;
    } catch (err) {
        console.error('카운트 증가 실패:', err);
        return -1;
    }
}

async function checkCounter() {
    try {
        const currentCount = await fs.readFile(COUNTER_FILE, 'utf8');
        return parseInt(currentCount);
    } catch (err) {
        console.error('카운트 읽기 실패:', err);
        return -1;
    }
}

/*
* 서버 선택 (클라이언트 사이드 로드밸런싱)
*/
async function pickServer() {
    const node1 = process.env.NODE1_URL;
    const node2 = process.env.NODE2_URL;

    if (!node1 || !node2) {
        return process.env.TARGET;
    }

    async function getPlayerCount(baseUrl) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        try {
            const res = await fetch(`${baseUrl}/api/status`, { signal: controller.signal });
            const data = await res.json();
            return data.players ?? Infinity;
        } catch {
            return Infinity;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    const [count1, count2] = await Promise.all([
        getPlayerCount(node1),
        getPlayerCount(node2),
    ]);

    const selectedBase = count1 <= count2 ? node1 : node2;
    return `${selectedBase}/game`;
}

/*
* 본격적인 테스트를 위한 함수들
*/
function getRandomPosition() {
    return [Math.random(), Math.random()];
}

function setPlayerName(userContext, events, done) {
    let doneCalled = false;
    let timeoutId;

    incrementCounter();

    userContext.vars.userId = `${Math.random()}번째 유저`;

    const socket = userContext.sockets[''];

    // myPlayerId는 connectSocket에서 이미 저장됨
    socket.emit('setPlayerName', { playerName: userContext.vars.userId });

    socket.on('setPlayerName', async (response) => {
        const { playerId, playerName } = response;
        if (playerId === userContext.vars.myPlayerId && playerName === userContext.vars.userId) {
            if (!doneCalled) {
                const waitForPlayers = async () => {
                    const currentCount = await checkCounter();
                    console.log(`플레이어들을 기다리는 중... 현재 접속 인원: ${currentCount}명`);
                    
                    // 중요! 원하는 인원만큼 들어와야 게임 시작하게 타이밍 조절 
                    if (Number(currentCount) >= MIN_PLAYERS_FOR_TEST) {
                        console.log(`${currentCount}명의 플레이어가 접속했습니다. 테스트를 시작합니다!`);
                        if (!doneCalled) {
                            doneCalled = true;
                            clearTimeout(timeoutId);
                            done();
                        }
                    } else if (!doneCalled) {
                        setTimeout(waitForPlayers, 1000);
                    }
                };

                waitForPlayers();
            }
        } 
    });

    timeoutId = setTimeout(() => {
        if (!doneCalled) {
            console.error('[ERROR] setPlayerName timed out');
            events.emit('counter', 'total_count.fail.set_player_name', 1);
            doneCalled = true;
            done(new Error('Operation timed out'));
        }
    }, FIRST_WAIT_TIME);
}

function updatePosition(userContext, events, done) {
    const socket = userContext.sockets[''];

    const newPosition = getRandomPosition();

    socket.emit('updatePosition', {
        gameId: GAME_ID,
        newPosition
    });

    // 0.3 ~ 0.7초 사이의 랜덤한 시간을 기다리고 done()
    setTimeout(() => {
        return done();
    }, Math.random() * 400 + 300);
}

function chatMessage(userContext, events, done) {
    const socket = userContext.sockets[''];

    const newMessage = `이것은 플레이어가 보내는 고유한 메시지입니다! ${Math.random()}`;
 
    socket.emit('chatMessage', {
        gameId: GAME_ID,
        message: newMessage
    });
 
    // 0.3 ~ 0.7초 사이의 랜덤한 시간을 기다리고 done()
    setTimeout(() => {
        return done();
    }, Math.random() * 400 + 300);
}

function connectSocket(userContext, events, done) {
    pickServer().then(url => {
        const socket = io(url, {
            query: { 'game-id': process.env.GAME_ID },
            transports: ['websocket'],
            withCredentials: true,
            parser: msgpackParser,
        });

        userContext.sockets = userContext.sockets || {};
        userContext.sockets[''] = socket;

        // getSelfId까지 기다려야 setPlayerName에서 race condition 없이 바로 emit 가능
        socket.once('getSelfId', (response) => {
            userContext.vars.myPlayerId = response.playerId;
            done();
        });
        socket.once('connect_error', (err) => {
            console.error('[ERROR] Socket connect_error:', err.message);
            done(err);
        });
    }).catch(err => {
        console.error('[ERROR] pickServer error:', err.message);
        done(err);
    });
}

function disconnectSocket(userContext, events, done) {
    const socket = userContext.sockets && userContext.sockets[''];
    if (socket) socket.disconnect();
    done();
}

module.exports = {
    connectSocket,
    disconnectSocket,
    setPlayerName,
    updatePosition,
    chatMessage,
    pickServer,
};
