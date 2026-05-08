#!/usr/bin/env node
/**
 * 수동 연결 디버그 스크립트
 * 사용법: TARGET=http://localhost:1027/game GAME_ID=xxx node debug-connect.js
 */
const io = require('socket.io-client');
const msgpackParser = require('./msgpackr-parser');

const TARGET = process.env.TARGET || 'http://localhost:1027/game';
const GAME_ID = process.env.GAME_ID;

console.log('=== 연결 정보 ===');
console.log('TARGET:', TARGET);
console.log('GAME_ID:', GAME_ID ?? '(미설정 — undefined)');
console.log('');

if (!GAME_ID) {
    console.warn('[경고] GAME_ID 환경변수가 설정되지 않았습니다. 서버가 연결을 거부할 수 있습니다.');
}

console.log('[1] socket.io 연결 시도 중...');
const startTime = Date.now();

const socket = io(TARGET, {
    query: { 'game-id': GAME_ID },
    transports: ['websocket'],
    withCredentials: true,
    parser: msgpackParser,
    reconnection: false,  // 재연결 없이 1회만 시도
    timeout: 10000,       // 10초 연결 타임아웃
});

socket.on('connect', () => {
    const elapsed = Date.now() - startTime;
    console.log(`[2] 연결 성공! (${elapsed}ms)`);
    console.log('    소켓 ID:', socket.id);
    console.log('[3] setPlayerName 이벤트 전송...');
    socket.emit('setPlayerName', { playerName: 'debug-player-001' });
});

socket.on('connect_error', (err) => {
    const elapsed = Date.now() - startTime;
    console.error(`[!] connect_error (${elapsed}ms):`);
    console.error('    메시지:', err.message);
    console.error('    타입:', err.type);
    console.error('    상세:', err);
    process.exit(1);
});

socket.on('disconnect', (reason) => {
    const elapsed = Date.now() - startTime;
    console.log(`[!] 연결 끊김 (${elapsed}ms): ${reason}`);
});

socket.on('error', (err) => {
    console.error('[!] socket error:', err);
});

// 서버에서 오는 모든 이벤트 로그
socket.onAny((event, ...args) => {
    console.log(`[서버→클라] 이벤트: "${event}"`, JSON.stringify(args));
});

// 10초 후 자동 종료
setTimeout(() => {
    const elapsed = Date.now() - startTime;
    if (socket.connected) {
        console.log(`\n[완료] 10초 동안 연결 유지됨. 소켓 상태: connected`);
    } else {
        console.log(`\n[타임아웃] 10초 경과. 소켓 상태: disconnected`);
    }
    socket.disconnect();
    process.exit(0);
}, 10000);
