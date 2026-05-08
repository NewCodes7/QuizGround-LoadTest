const io = require('socket.io-client');
const msgpackParser = require('./msgpackr-parser');

/*
* 초기 필요한 상수 정의
*/
const GAME_ID = process.env.GAME_ID;

// game-scenario.yml duration과 동일하게 설정
const DURATION_TIME = 20000;

/*
* 타임스탬프 기반 barrier 동기화
*
* counter 기반 동기화는 Artillery worker thread 간 메모리/파일이 신뢰할 수 없어 실패.
* 첫 번째 VU가 setPlayerName에 도달하는 시점 기준으로 (DURATION_TIME + 여유) 후를
* barrier로 설정하면, 각 VU는 별도 공유 없이 같은 시각에 테스트를 시작할 수 있음.
*/
let barrierTime = null;

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

/*
* 실제 서버 연결 흐름 (socket.ts 기준):
* - joinRoom(gameId)는 connect({ 'game-id': gameId }) 와 동일 (이벤트 emit 아님)
* - handleConnection에서 소켓을 방에 join 후 getSelfId emit
* - connect 이벤트 발생 시점에 이미 방에 입장 완료
*/
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

        socket.once('connect', () => done());
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

function setPlayerName(userContext, events, done) {
    // 첫 번째 VU가 이 함수에 도달했을 때 barrier 설정
    // DURATION_TIME 후엔 모든 VU가 접속 완료 → 5초 여유 추가
    if (!barrierTime) {
        barrierTime = Date.now() + DURATION_TIME + 5000;
    }

    userContext.vars.userId = `${Math.random()}번째 유저`;

    const socket = userContext.sockets[''];
    socket.emit('setPlayerName', { playerName: userContext.vars.userId });

    // barrier까지 남은 시간 대기 (늦게 합류한 VU는 짧게 대기)
    const waitTime = Math.max(0, barrierTime - Date.now());
    console.log(`플레이어 이름 설정 완료, ${Math.round(waitTime / 1000)}초 후 테스트 시작`);
    setTimeout(() => done(), waitTime);
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

module.exports = {
    connectSocket,
    disconnectSocket,
    setPlayerName,
    updatePosition,
    chatMessage,
    pickServer,
};
