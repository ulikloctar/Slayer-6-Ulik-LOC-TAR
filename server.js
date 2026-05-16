// server.js - Базовый сервер для Slayer 6 (2 игрока)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" } // Разрешаем подключение с любого домена
});

// Хранилище комнат: { "КОД": [socketId1, socketId2] }
const rooms = {};

// Генерация случайного кода (5 символов)
function generateCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

io.on('connection', (socket) => {
  console.log('Игрок подключился:', socket.id);

  // 1. Создание игры (Хост)
  socket.on('createGame', () => {
    let code = generateCode();
    // Убедимся, что код уникален
    while (rooms[code]) {
      code = generateCode();
    }
    rooms[code] = [socket.id]; // Хост - первый в комнате
    socket.join(code); // Подключаем сокет к комнате
    socket.room = code; // Сохраняем код комнаты в сокете
    socket.emit('gameCreated', { code }); // Отправляем код хосту
    console.log(`Создана игра с кодом: ${code}`);
  });

  // 2. Присоединение к игре (Друг)
  socket.on('joinGame', (data) => {
    const { code } = data;
    const room = rooms[code];

    if (!room) {
      socket.emit('error', { message: 'Игра не найдена!' });
      return;
    }
    if (room.length >= 2) {
      socket.emit('error', { message: 'Игра уже полная (2/2)!' });
      return;
    }

    room.push(socket.id); // Добавляем гостя
    socket.join(code);
    socket.room = code; // Сохраняем код комнаты в сокете
    socket.emit('gameJoined', { code }); // Гостю: ты подключился
    // Хосту: к тебе присоединился друг!
    socket.to(room[0]).emit('playerJoined', { id: socket.id });
    console.log(`Игрок ${socket.id} присоединился к ${code}`);
  });

  // 3. Релей позиции и атак (передача данных)
  socket.on('playerUpdate', (data) => {
    const { code } = data;
    const room = rooms[code];
    if (room) {
      // Отправляем ВСЕ данные ДРУГОМУ игроку в комнате
      socket.to(code).emit('opponentUpdate', {
        id: socket.id,
        ...data, // Передаем все поля (x, y, attacking, attackType, walkCycle, eyeTimer, isWerewolf, dy)
        code: undefined // Удаляем code из данных для друга
      });
    }
  });

  // 4. Релей врагов (только от хоста к другу)
  socket.on('enemiesUpdate', (data) => {
    const { code, enemies } = data;
    const room = rooms[code];
    if (room) {
      // Хост отправляет врагов другу
      socket.to(code).emit('hostEnemies', { enemies });
    }
  });

  // 4.1 Релей боссов и NPC (только от хоста к другу)
  socket.on('bossesUpdate', (data) => {
    const { code, bosses } = data;
    const room = rooms[code];
    if (room) {
      socket.to(code).emit('hostBosses', { bosses });
    }
  });

  // 4.2 Релей эффектов крови от хоста к другу
  socket.on('enemyBloodHit', (data) => {
    const { code, x, y, count } = data;
    const room = rooms[code];
    if (room) {
      socket.to(code).emit('friendBloodHit', { x, y, count });
    }
  });

  // 5. Пересылка убийства врага от Друга к Хосту
  socket.on('enemyKilled', (data) => {
    const { code, exp } = data;
    const room = rooms[code];
    if (room) {
      // Отправляем Хосту (первому в комнате)
      socket.to(room[0]).emit('opponentKilledEnemy', { exp });
    }
  });

  // 4. Отключение игрока
  socket.on('disconnect', () => {
    console.log('Игрок отключился:', socket.id);
    // Удаляем игрока из всех комнат
    for (const code in rooms) {
      const index = rooms[code].indexOf(socket.id);
      if (index !== -1) {
        rooms[code].splice(index, 1);
        // Сообщаем оставшемуся игроку
        socket.to(code).emit('playerLeft', { id: socket.id });
        // Если комната пуста - удаляем
        if (rooms[code].length === 0) {
          delete rooms[code];
        }
        break;
      }
    }
  });

  // 5. Удар по другу (host -> friend)
  socket.on('opponentHit', (data) => {
    const { code, damage } = data;
    const room = rooms[code];
    if (room) {
      socket.to(code).emit('opponentHit', { damage });
    }
  });

  // 6. Синхронизация опыта от хоста к клиенту
  socket.on('syncExp', (data) => {
    const { exp, hostLvl } = data;
    const room = rooms[socket.room];
    if (room && room.length > 1) {
      // Находим получателя (не отправителя)
      const recipientId = room.find(id => id !== socket.id);
      if (recipientId) {
        io.to(recipientId).emit('syncExp', { exp, hostLvl });
      }
    }
  });

  // 7. Синхронизация анимации повышения уровня
  socket.on('levelUp', (data) => {
    const room = rooms[socket.room];
    if (room && room.length > 1) {
      // Отправляем второму игроку
      socket.to(socket.room).emit('opponentLevelUp', data);
    }
  });

  // 6. Синхронизация паузы
  // Хост отправляет состояние паузы всем в комнате
  socket.on('pauseGame', (data) => {
    if (socket.room) {
      io.to(socket.room).emit('pauseGame', data);
    }
  });

  // Друг запрашивает паузу (отправляется только хосту)
  socket.on('pauseRequest', () => {
    if (socket.room) {
      const room = rooms[socket.room];
      if (room && room.length > 0) {
        const hostId = room[0]; // Хост - первый игрок в комнате
        io.to(hostId).emit('pauseRequest');
      }
    }
  });
});

// Запуск сервера
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});
