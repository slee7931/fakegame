const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let gameHistory = []; 
let betStatus = { '홀': { count: 0, amount: 0 }, '짝': { count: 0, amount: 0 } };
let timeLeft = 5; 

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/player.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

function confirmResult(result) {
    gameHistory.unshift(result);
    if (gameHistory.length > 10) gameHistory.pop();
    
    io.emit('game_result', { result: result, history: gameHistory });

    betStatus = { '홀': { count: 0, amount: 0 }, '짝': { count: 0, amount: 0 } };
    io.emit('update_admin_stats', betStatus);
    
    timeLeft = 6; // 결과 보여주는 시간을 위해 6초로 설정 (잠시 후 5초로 깎임)
}

setInterval(() => {
    timeLeft--;
    if (timeLeft < 0) timeLeft = 0;
    
    io.emit('timer_update', timeLeft);
    
    if (timeLeft === 0) {
        const randomRes = Math.random() > 0.5 ? '홀' : '짝';
        confirmResult(randomRes);
    }
}, 1000);

io.on('connection', (socket) => {
    socket.emit('init_history', gameHistory);
    socket.emit('update_admin_stats', betStatus);
    socket.emit('timer_update', timeLeft);

    socket.on('player_bet', (data) => {
        betStatus[data.choice].count += 1;
        betStatus[data.choice].amount += data.amount;
        io.emit('update_admin_stats', betStatus);
        io.emit('admin_receive_bet', data); 
    });

    socket.on('admin_confirm_result', (result) => {
        confirmResult(result);
    });
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`서버 실행 중: http://localhost:${PORT}`);
});