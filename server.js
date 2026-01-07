const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

let gameHistory = []; 
let betStatus = { '플레이어': { count: 0, amount: 0 }, '뱅커': { count: 0, amount: 0 } };
let timeLeft = 7; 
let isResultProcessing = false;
let forcedWinner = null; // 조작된 승자를 저장할 변수

const suits = [
    { symbol: '♠', color: 'black' }, { symbol: '♦', color: 'red' },
    { symbol: '♥', color: 'red' }, { symbol: '♣', color: 'black' }
];
const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

function drawCard() {
    const rIdx = Math.floor(Math.random() * 13);
    const suit = suits[Math.floor(Math.random() * 4)];
    const rank = ranks[rIdx];
    let value = rIdx + 1;
    if (value >= 10) value = 0;
    return { rank, symbol: suit.symbol, color: suit.color, value };
}

function generateBaccaratHand(targetWinner = null) {
    let res;
    let attempts = 0;
    // targetWinner가 있으면 해당 승자가 나올 때까지 반복 생성 (최대 1000번)
    do {
        res = createSingleHand();
        attempts++;
    } while (targetWinner && res.winner !== targetWinner && attempts < 1000);
    return res;
}

function createSingleHand() {
    let p1 = drawCard(), p2 = drawCard(), b1 = drawCard(), b2 = drawCard();
    let p3 = null, b3 = null;
    let pScore = (p1.value + p2.value) % 10;
    let bScore = (b1.value + b2.value) % 10;

    if (pScore < 8 && bScore < 8) {
        if (pScore <= 5) {
            p3 = drawCard();
            pScore = (pScore + p3.value) % 10;
            if (shouldBankerDraw((b1.value + b2.value) % 10, p3.value)) {
                b3 = drawCard();
                bScore = (bScore + b3.value) % 10;
            }
        } else if (bScore <= 5) {
            b3 = drawCard();
            bScore = (bScore + b3.value) % 10;
        }
    }
    let winner = pScore > bScore ? '플레이어' : (bScore > pScore ? '뱅커' : '타이');
    return { winner, cards: { p1, p2, p3, b1, b2, b3, pScore, bScore } };
}

function shouldBankerDraw(bS, p3V) {
    if (bS <= 2) return true;
    if (bS === 3) return p3V !== 8;
    if (bS === 4) return [2, 3, 4, 5, 6, 7].includes(p3V);
    if (bS === 5) return [4, 5, 6, 7].includes(p3V);
    if (bS === 6) return [6, 7].includes(p3V);
    return false;
}

function confirmResult(result) {
    isResultProcessing = true;
    let char = result.winner === '플레이어' ? 'P' : (result.winner === '뱅커' ? 'B' : 'T');
    gameHistory.unshift(char);
    if (gameHistory.length > 20) gameHistory.pop();
    
    io.emit('game_result', { result, history: gameHistory });
    betStatus = { '플레이어': { count: 0, amount: 0 }, '뱅커': { count: 0, amount: 0 } };
    io.emit('update_admin_stats', betStatus);
    
    setTimeout(() => { 
        timeLeft = 7; 
        isResultProcessing = false;
        forcedWinner = null; // 조작 값 초기화
        io.emit('timer_update', timeLeft);
    }, 12000); // 연출 시간 확보
}

setInterval(() => {
    if (!isResultProcessing && timeLeft > 0) {
        timeLeft--;
        io.emit('timer_update', timeLeft);
        if (timeLeft === 0) {
            // 시간이 끝났을 때 조작된 승자가 있으면 해당 결과를, 없으면 랜덤 결과를 생성
            confirmResult(generateBaccaratHand(forcedWinner));
        }
    }
}, 1000);

io.on('connection', (socket) => {
    socket.emit('init_history', gameHistory);
    socket.emit('update_admin_stats', betStatus);
    socket.emit('timer_update', timeLeft);

    socket.on('player_bet', (data) => {
        if (!isResultProcessing && timeLeft > 0) {
            betStatus[data.choice].count += 1;
            betStatus[data.choice].amount += data.amount;
            io.emit('update_admin_stats', betStatus);
        }
    });

    socket.on('admin_force_win', (target) => {
        forcedWinner = target; // 즉시 종료하지 않고 승자만 예약
    });
});

server.listen(3000, () => console.log("Baccarat Server Active on 3000"));
