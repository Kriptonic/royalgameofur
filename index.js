var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
var fs = require('fs');

// A quick and dirty to get files used on the client here
// where the server can use them too.
eval(fs.readFileSync('static/engine.js').toString());

// Serve the static content directly.
app.use(express.static(__dirname + '/static'));

app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

server.listen(3000, function () {
    console.log('Listening on *:3000');
});

var availablePlayers = {};

var gamesInProgress = {};

function serverTick() {

    // Ensure everyone knows who is available to play.
    sendAvailablePlayers();
}

function sendAvailablePlayers() {

    var clientFriendlyUserList = {};

    for (var p in availablePlayers) {
        var playerSocketId = availablePlayers[p].id;
        clientFriendlyUserList[playerSocketId] = availablePlayers[p].playerName || playerSocketId;
    }

    io.emit('connected-players', clientFriendlyUserList);

}

setInterval(serverTick, 1000);

io.on('connection', function (socket) {
    console.log(socket.id + ' has joined');

    // Store a reference to this player.
    availablePlayers[socket.id] = socket;

    // Default player name is the socket id.
    socket.playerName = socket.id;

    socket.on('name-change', function (name) {
        console.log(socket.id + ' has changed their name to ' + name);
        socket.playerName = name;
    });

    socket.on('challenge-player', function (playerId) {

        // Sanity check against curious people.
        if (socket.id === playerId) {
            // The player cannot challenge them self.
            return;
        }

        var opponentSocket = io.sockets.connected[playerId];

        console.log(socket.playerName + ' is challenging ' + opponentSocket.playerName);

        opponentSocket.emit('incoming-challenge', {
            playerId: socket.id,
            playerName: socket.playerName
        })

    });

    socket.on('challenge-accept', function (requesterId) {
        var requesterSocket = player(requesterId);
        console.log(socket.playerName + ' has accepted the challenge from ' + requesterSocket.playerName);
        requesterSocket.emit('challenge-accepted', {
            playerId: socket.id,
            playerName: socket.playerName
        });

        beginGame(requesterSocket, socket);
    });

    socket.on('challenge-reject', function (requesterId) {
        console.log(socket.playerName + ' has rejected the challenge from ' + io.sockets.connected[requesterId].playerName);
        player(requesterId).emit('challenge-rejected', {
            playerId: socket.id,
            playerName: socket.playerName
        });
    });

    socket.on('pre-game-dice-roll', function (gameId) {

        var currentGame = gamesInProgress[gameId];

        var result = currentGame.rollDice();

        currentPlayer.getPlayerById(socket.id).preGameRoll = result;

        socket.emit('pre-game-dice-roll-result', result);

        if (currentGame.player1.preGameRoll && currentGame.player2.preGameRoll) {

        }

    });

    socket.on('roll', function (gameId) {

        var currentGame = gamesInProgress[gameId];

        if (currentGame.currentPlayer !== socket.id) {
            // Not this players turn to roll yet.
            return;
        }

        if (currentGame.currentRoll !== null) {
            // This player rolled already.
            return;
        }

        currentGame.currentRoll = currentGame.rollDice();

        currentGame.messages.push(socket.playerName + ' rolled ' + currentGame.currentRoll);
        console.log(socket.playerName + ' rolled the dice and got ' + currentGame.currentRoll);

        // If the player rolled a zero then skip their turn, its back to the opponent to roll.
        if (currentGame.currentRoll === 0) {
            console.log(socket.playerName + ' misses a turn!');
            currentGame.messages.push(socket.playerName + ' misses a turn!');
            currentGame.currentRoll = null;
            currentGame.currentPlayer = currentGame.getEnemyPlayer().pid;
        }

        player(currentGame.player1.pid).emit('game-update', currentGame);
        player(currentGame.player2.pid).emit('game-update', currentGame);
    });

    socket.on('game-move', function (details) {
        var gameState = gamesInProgress[details.gameId];

        // Convert the track request back to an integer.
        details.track = parseInt(details.track);

        // Handy variables used in checks and updates.
        var currentPlayer = gameState.getCurrentPlayer();
        var currentEnemy = gameState.getEnemyPlayer();

        if (!gameState.isValidMove(details.track, details.lane)) {
            // Can't make this move.
            return;
        }

        var destination = parseInt(details.track) + parseInt(gameState.currentRoll);

        // Make the move.
        gameState.track[destination] |= currentPlayer.number;
        gameState.track[details.track] ^= currentPlayer.number;

        // Did we reach the end?
        if (destination === 15) {
            // The player has got a token to the safe zone.
            currentPlayer.tokensDone += 1;
        }

        // If we land on an enemy in the middle lane then they are knocked out.
        if (destination >= 5 && destination <= 12) {

            // If the cell we just landed on has an enemy inside of it...
            if ((gameState.track[destination] & currentEnemy.number) === currentEnemy.number) {

                // Remove them.
                gameState.track[destination] ^= currentEnemy.number;

                // Add the token back to their pile.
                currentEnemy.tokensWaiting += 1;
            }
        }

        // If we added a token to play then the token count decreases.
        if (details.track === 0) {
            currentPlayer.tokensWaiting -= 1;
        }

        // Increment the turn counter.
        gameState.turn += 1;

        // If we landed on a special square then we get another go.
        if ([4, 8, 14].indexOf(destination) >= 0) {
            console.log(socket.playerName + ' landed on a special square - get another go');
            gameState.messages.push(socket.playerName + ' landed on a special square and gets another go');
        } else {
            // Switch player.
            gameState.currentPlayer = (gameState.currentPlayer === currentPlayer.pid) ? currentEnemy.pid : currentPlayer.pid;
        }

        // Reset the dice.
        gameState.currentRoll = null;

        // Check to see if a player has won yet.
        if (currentPlayer.tokensDone === 7 || currentEnemy.tokensDone === 7) {
            // Game is over.
            currentGameState.state = 2;
            player(gameState.player1.pid).emit('game-done', gameState);
            player(gameState.player2.pid).emit('game-done', gameState);
        } else {
            // Game is still going...
            // Send a game update.
            player(gameState.player1.pid).emit('game-update', gameState);
            player(gameState.player2.pid).emit('game-update', gameState);
        }
    });

    socket.on('disconnect', function () {
        console.log(socket.id + ' has left');
        // Remove a reference to this player.
        delete availablePlayers[socket.id];
    });
});

function player(pid) {
    return io.sockets.connected[pid];
}

function beginGame(socket1, socket2) {
    var gameId = socket1.id + ':' + socket2.id;
    var game = new Game(socket1.id, socket2.id);

    game.id = gameId;
    game.turn += 1;

    gamesInProgress[gameId] = game;

    do {
        var player1Roll = game.rollDice();
        var player2Roll = game.rollDice();
    } while (player1Roll === player2Roll);

    game.player1.preGameRoll = player1Roll;
    game.player2.preGameRoll = player2Roll;


    game.messages.push(socket1.playerName + ' rolled a ' + player1Roll);
    game.messages.push(socket2.playerName + ' rolled a ' + player2Roll);

    if (player1Roll > player2Roll) {
        game.currentPlayer = game.player1.pid;
    } else {
        game.currentPlayer = game.player2.pid;
    }

    game.messages.push(player(game.currentPlayer).playerName + ' goes first!');

    game.state = 1;

    socket1.emit('game-update', game);
    socket2.emit('game-update', game);
}
