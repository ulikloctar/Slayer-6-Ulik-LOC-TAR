// multiplayer.js - Клиентская часть для Slayer 6 (2 игрока)
// Подключение к серверу (для локального теста: http://localhost:3000, для Render: https://твой-сайт.onrender.com)
const MULTIPLAYER_SERVER = window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin;
let socket = null;
let isMultiplayer = false;
let isHost = false;
let gameCode = null;
let opponent = null; // Данные второго игрока { x, y, attacking, attackType }
let mpStatus = ''; // Статус сообщения

// Элементы интерфейса
const multiplayerMenu = document.getElementById('multiplayerMenu');
const btnStartAdventure = document.getElementById('btnStartAdventure');
const btnHelpFriend = document.getElementById('btnHelpFriend');
const joinSection = document.getElementById('joinSection');
const joinCodeInput = document.getElementById('joinCodeInput');
const btnSubmitCode = document.getElementById('btnSubmitCode');
const gameCodeDisplay = document.getElementById('gameCodeDisplay');
const btnCloseMPMenu = document.getElementById('btnCloseMPMenu');
const mpStatusDiv = document.getElementById('mpStatus');

// 1. Инициализация мультиплеера (вызывается после ввода имени)
function initMultiplayer() {
    if (socket) return; // Уже подключены
    
    socket = io(MULTIPLAYER_SERVER);
    
    socket.on('connect', () => {
        console.log('Подключен к серверу:', socket.id);
        mpStatus = 'Готово к игре!';
        updateMPStatus();
    });
    
    socket.on('gameCreated', (data) => {
        gameCode = data.code;
        isMultiplayer = true;
        isHost = true;
        mpStatus = `Твой код: ${gameCode}`;
        showGameCode(gameCode);
        console.log('Игра создана, код:', gameCode);
    });
    
    socket.on('gameJoined', (data) => {
        gameCode = data.code;
        isMultiplayer = true;
        isHost = false;
        mpStatus = `Подключен к игре ${gameCode}`;
        hideMultiplayerMenu();
        updateMPStatus();
        console.log('Подключился к игре:', gameCode);
    });
    
    socket.on('playerJoined', (data) => {
        mpStatus = 'К тебе присоединился друг!';
        updateMPStatus();
        console.log('Игрок присоединился:', data.id);
    });
    
    socket.on('opponentUpdate', (data) => {
        // Получаем данные противника
        opponent = {
            id: data.id,
            x: data.x,
            y: data.y,
            attacking: data.attacking,
            attackType: data.attackType
        };
    });
    
    socket.on('playerLeft', (data) => {
        mpStatus = 'Друг вышел из игры';
        opponent = null;
        updateMPStatus();
        console.log('Игрок вышел:', data.id);
    });
    
    socket.on('error', (data) => {
        mpStatus = 'Ошибка: ' + data.message;
        updateMPStatus();
        console.error('Ошибка:', data.message);
    });
    
    socket.on('disconnect', () => {
        mpStatus = 'Отключен от сервера';
        isMultiplayer = false;
        opponent = null;
        updateMPStatus();
        console.log('Отключен от сервера');
    });
}

// 2. Обновление статуса на экране
function updateMPStatus() {
    if (mpStatusDiv) {
        mpStatusDiv.innerText = mpStatus;
    }
}

// 3. Показать/скрыть элементы интерфейса
function showGameCode(code) {
    if (gameCodeDisplay) {
        gameCodeDisplay.innerText = code;
        gameCodeDisplay.style.display = 'block';
    }
    if (joinSection) joinSection.style.display = 'none';
}

function hideMultiplayerMenu() {
    if (multiplayerMenu) multiplayerMenu.style.display = 'none';
}

// 4. Кнопка "Начать приключение" (одиночная игра)
if (btnStartAdventure) {
    btnStartAdventure.addEventListener('click', () => {
        hideMultiplayerMenu();
        // Запускаем ОРИГИНАЛЬНУЮ игру (originalStartGame), а не обёртку
        if (typeof originalStartGame === 'function') {
            originalStartGame();
        } else if (typeof startGame === 'function') {
            startGame(); // Fallback
        }
    });
}

// 5. Кнопка "Прийти на помощь другу"
if (btnHelpFriend) {
    btnHelpFriend.addEventListener('click', () => {
        if (joinSection) joinSection.style.display = 'block';
        if (gameCodeDisplay) gameCodeDisplay.style.display = 'none';
        mpStatus = 'Введи код друга';
        updateMPStatus();
    });
}

// 6. Кнопка "Присоединиться" (отправка кода)
if (btnSubmitCode) {
    btnSubmitCode.addEventListener('click', () => {
        const code = joinCodeInput ? joinCodeInput.value.trim() : '';
        if (!code || code.length !== 4) {
            mpStatus = 'Введи правильный код (5 символа)!';
            updateMPStatus();
            return;
        }
        if (!socket) {
            mpStatus = 'Нет подключения к серверу!';
            updateMPStatus();
            return;
        }
        socket.emit('joinGame', { code });
        mpStatus = 'Телепортация...';
        updateMPStatus();
    });
}

// 7. Кнопка "Закрыть" (в мультиплеерном меню)
if (btnCloseMPMenu) {
    btnCloseMPMenu.addEventListener('click', () => {
        hideMultiplayerMenu();
    });
}

// 8. Создание игры (вызывается позже, когда спасаешь пленника)
function createGame() {
    if (!socket) {
        mpStatus = 'Нет подключения!';
        updateMPStatus();
        return;
    }
    socket.emit('createGame');
    mpStatus = 'Создаём игру...';
    updateMPStatus();
}

// 9. Отправка данных игрока на сервер (вызывается в игровом цикле)
function sendPlayerUpdate(x, y, attacking, attackType) {
    if (!isMultiplayer || !socket || !gameCode) return;
    socket.emit('playerUpdate', {
        code: gameCode,
        x: x,
        y: y,
        attacking: attacking,
        attackType: attackType
    });
}

// 10. Отрисовка второго игрока (вызывается в функции draw())
function drawOpponent(ctx) {
    if (!opponent || !isMultiplayer) return;
    
    // Рисуем второго игрока (используем Arrow.js)
    // Предполагаем, что в Arrow.js есть функция drawArrow(ctx, x, y, scale, attacking, attackType)
    if (typeof drawArrow === 'function') {
        // Второй игрок спавнится на +75px правее героя
        const opponentX = opponent.x + 75; // Спавн рядом с хостом
        const opponentY = opponent.y;
        
        // Масштаб (как у игрока)
        const scale = 1.0; // Можно настроить под размер твоего персонажа
        
        // Рисуем (предполагая, что drawArrow принимает параметры как у player.js)
        drawArrow(ctx, opponentX, opponentY, scale, opponent.attacking, opponent.attackType);
    } else {
        // Заглушка, если Arrow.js ещё не готов
        ctx.save();
        ctx.fillStyle = '#ffd700'; // Жёлтый цвет для второго игрока
        ctx.fillRect(opponent.x, opponent.y, 45, 110); // Прямоугольник как заглушка
        ctx.restore();
    }
}

// 11. Модификация функции startGame (перехватываем)
const originalStartGame = window.startGame;
window.startGame = function() {
    // Инициализируем мультиплеер, если ещё не сделано
    if (!socket) {
        initMultiplayer();
    }
    
    // Скрываем меню ввода имени
    const nameScreen = document.getElementById('nameScreen');
    if (nameScreen) nameScreen.style.display = 'none';
    
    // Показываем мультиплеерное меню (после ввода имени)
    if (multiplayerMenu) multiplayerMenu.style.display = 'flex';
    
    // Если есть оригинальная функция, вызываем её
    if (typeof originalStartGame === 'function') {
        // Не вызываем сразу, ждём выбора в мультиплеерном меню
        // originalStartGame();
    }
};

console.log('Multiplayer.js загружен!');
