// 10,000명 부하테스트용 게임방 생성
const { io } = require('socket.io-client');

const GAME_OPTION = "title=spike-test;gameMode=RANKING;maxPlayerCount=11000;isPublic=true";
const TARGET = process.env.TARGET || 'http://localhost:3000/game';

async function createRoom() {
    return new Promise((resolve, reject) => {
        const socket = io(TARGET, {
            query: {
                "create-room": GAME_OPTION
            }
        });

        socket.on('createRoom', (response) => {
            if (response) {
                console.log('Successfully created room. gameId:', response);

                socket.on('getSelfId', (selfResponse) => {
                    socket.emit('setPlayerName', {
                        playerName: `Host-${selfResponse.playerId}`
                    });
                });

                resolve({ socket, gameId: response });
            } else {
                reject('No gameId in response');
            }
        });

        socket.on('error', (error) => {
            reject(error);
        });
    });
}

createRoom();

module.exports = { createRoom };
