/*
 * Communcication with clients
 * 
 * SEND to clients
 * 
 *     spawnOwnPlayer   : player
 *     spawnOtherPlayer : player
 *     removePlayer     : playerId
 *     updateWorld      : broadcastData
 *     spawnShoot       : positionAndTargetAndPlayerId
 * 
 * RECEIVED from clients
 * 
 *     playerPositionChanged : positionAndRotation
 *     shootPlaced           : positionAndTarget
 *     saveHighscore         : nameAndScore
 *
 * Terminology:
 *
 *      send         = Sends message to the client that triggered the event.
 *      broadcast    = Sends message to every connected user, EXCEPT to the client that triggered the event.
 *      broadcastAll = Sends message to every connected user
 *      volatile     = fire and forget functionally, messages are not buffered internally for when a client is unable to receive messages
 */
module.exports = function (io, world, highscoreProvider) {

    var UPDATE_WORLD_BROADCAST_INTERVALL = 30;
    var broadcastCounter = 0;
    var intervalId = null;

    io.sockets.on('connection', function (socket) { handleConnection(socket); });


    var handleConnection = function (socket) {

        var player = world.addNewPlayer(socket.id);

        sendSpawnOwnPlayer(socket, player);
        broadcastSpawnOtherPlayer(socket, player);

        if (world.getPlayersCount() > 1) {
            start_RepeatedBroacastAll_OfWorldData();
        }

        socket.on('playerPositionChanged', function (positionAndRotation) {
            world.updatePlayerPosition(player.id, positionAndRotation);
        });

        socket.on('shootPlaced', function (positionAndTarget) {
            broadcastSpawnShoot(socket, positionAndTarget, player);
        });

        socket.on('disconnect', function () {

            broadcastRemovePlayer(socket, player);

            if (world.getPlayersCount() < 2) {
                stop_RepeatedBroadcastAll_OfWorldData();
            }
        });

        // hello MongoDB
        socket.on("saveHighscore", function (nameAndScore) {
            highscoreProvider.save(nameAndScore, function () { });
        });
    };

    // TYPE: send (message to current player)
    var sendSpawnOwnPlayer = function (socket, player) {

        // send to current player
        socket.emit('spawnOwnPlayer', player);
        console.log("spawnPlayer: " + player.id);
    };

    // TYPE: broadcast (message to all other connected players)
    var broadcastSpawnOtherPlayer = function (socket, player) {
        socket.broadcast.emit('spawnOtherPlayer', player);
    };

    // TYPE: volatile broadcast
    var broadcastSpawnShoot = function (socket, positionAndTarget, player) {

        //console.log("shootPlaced: " + playerId);
        var positionAndTargetAndPlayerId = {

            position: positionAndTarget.position,
            target: positionAndTarget.target,
            playerId: player.id
        };

        // fire and forget to all players
        socket.broadcast.volatile.emit('spawnShoot', positionAndTargetAndPlayerId);
    };

    // TYPE: broadcast
    var broadcastRemovePlayer = function (socket, player) {

        world.deletePlayer(player.id);
        socket.broadcast.emit('removePlayer', player.id);
        console.log("removePlayer: " + player.id);
    };

    // to avoid wasting traffic and CPU cycles
    var stop_RepeatedBroadcastAll_OfWorldData = function () {

        if (intervalId == null) {
            return;
        }

        console.log("+++ STOP BROADCASTING +++");
        clearInterval(intervalId);
        intervalId = null;
    };

    // TYPE: volatile broadcastAll
    // could create high traffic and a lot of CPU cycles
    var start_RepeatedBroacastAll_OfWorldData = function () {

        if (intervalId != null) {
            stop_RepeatedBroadcastAll_OfWorldData();
        }

        console.log("+++ START BROADCASTING +++");
        intervalId = setInterval(function () {

            var worldData = world.getWorldData();

            var broadcastData = {
                players: worldData.players,
                serverTime: new Date().getTime(),
                counter: ++broadcastCounter
            };

            // fire and forget to all players
            io.sockets.volatile.emit('updateWorld', broadcastData);
            //console.log("+++ BROADCAST +++");

        }, UPDATE_WORLD_BROADCAST_INTERVALL);
    };

    // throw an exception after one day to make sure everything is cleaned up again
    var restartIn24h = function () {

        var oneDay = 24 * 60 * 60 * 1000;

        setTimeout(function () {
            console.log("+++ RESTART +++");
            throw "+++ RESTART +++";

        }, oneDay);
    };

    restartIn24h();
}