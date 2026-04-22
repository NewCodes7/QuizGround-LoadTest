const fs = require('fs').promises;
const fsSync = require('fs');

/*
* 초기 필요한 상수 정의
*/
const MIN_PLAYERS_FOR_TEST = 5; // Fargate 컨테이너당 플레이어 수 (총 10명 / 2 컨테이너)
const GAME_ID = process.env.GAME_ID;

const DURATION_TIME = 10000; // game-scenario-10.yml duration과 동일하게 설정
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

    socket.on('getSelfId', (response) => {
        userContext.vars.myPlayerId = response.playerId;
        const playerName = userContext.vars.userId;
        socket.emit('setPlayerName', { playerName });
    });

    socket.on('setPlayerName', async (response) => {
        const { playerId, playerName } = response;
        if (playerId === userContext.vars.myPlayerId && playerName === userContext.vars.userId) {
            if (!doneCalled) {
                const waitForPlayers = async () => {
                    const currentCount = await checkCounter();
                    console.log(`플레이어들을 기다리는 중... 현재 접속 인원: ${currentCount}명`);

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

    setTimeout(() => {
        return done();
    }, Math.random() * 400 + 300);
}

module.exports = {
    setPlayerName,
    updatePosition,
    chatMessage
};
