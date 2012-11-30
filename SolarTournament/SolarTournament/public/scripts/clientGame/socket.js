/*
 * Communcication with server
 * 
 * RECEIVED from server
 * 
 *     spawnOwnPlayer   : player
 *     spawnOtherPlayer : player
 *     removePlayer     : playerId
 *     updateWorld      : broadcastData
 *     spawnShoot       : positionAndTargetAndPlayerId
 * 
 * SEND to server
 * 
 *     playerPositionChanged : positionAndRotation
 *     shootPlaced           : positionAndTarget
 */
define(['socket.io',
        'config',
        'clientGame/world'], function (io, config, world) {

    var Socket = function() {

        this.SEND_TO_SERVER_DELAY = 30; // in milliseconds

        this._socket = null;
        this._world = world;

        world.onPlayerPositionChanged(this._handlePlayerPositionChanged.bind(this));
        world.onShootPlaced(this._handleShootPlaced.bind(this));
    };

    Socket.addToProto({
        connect: function() {

            this._socket = io.connect(config.socketUri);
            this._lastSend = 0;

            var socket = this._socket;
            var world = this._world;
            var debug = this._debugGame;

            socket.on('spawnOwnPlayer', function(player) {
                world.spawnOwnPlayer(player);
                debug('spawnOwnPlayer', player);
            });

            socket.on('spawnOtherPlayer', function(player) {
                world.spawnOtherPlayer(player);
                debug('spawnOtherPlayer', player);
            });

            socket.on('removePlayer', function(playerId) {
                world.removePlayer(playerId);
                debug('removePlayer', playerId);
            });

            socket.on('updateWorld', function(broadcastData) {
                world.updatePlayers(broadcastData.players);
                debug('updateWorld/updatePlayers', broadcastData);
            });

            socket.on('spawnShoot', function(positionAndTargetAndPlayerId) {

                var position = new CL3D.Vect3d(
                    positionAndTargetAndPlayerId.position.X,
                    positionAndTargetAndPlayerId.position.Y,
                    positionAndTargetAndPlayerId.position.Z
                );

                var target = new CL3D.Vect3d(
                    positionAndTargetAndPlayerId.target.X,
                    positionAndTargetAndPlayerId.target.Y,
                    positionAndTargetAndPlayerId.target.Z
                );

                var playerId = positionAndTargetAndPlayerId.playerId;

                world.spawnShoot(position, target, playerId);
                debug('spawnShoot', playerId);
            });
        },

        disconnect: function() {

            if (this._socket != null) {
                this._socket.disconnect();
            }
        },

        saveHighscore: function(name, score) {

            if (this._socket != null) {
                this._socket.emit('saveHighscore', { name: name, score: score });
            }
        },

        // will send the own position to the socket - every SEND_TO_SERVER_DELAY seconds
        _handlePlayerPositionChanged: function(event, positionAndRotation) {

            if (this._calculateLastSend() < this.SEND_TO_SERVER_DELAY) {
                return;
            }

            this._socket.emit('playerPositionChanged', positionAndRotation);
            //this._debugGame('playerPositionChanged', null);

            this._lastSend = new Date().getTime();
        },

        // shoots that were placed by our own player
        // shoots have no delay, but client does not shoots that often
        _handleShootPlaced: function(event, positionAndTarget) {

            this._socket.emit('shootPlaced', positionAndTarget);
        },

        _calculateLastSend: function() {

            var now = new Date().getTime();
            var timeDiff = now - this._lastSend;
            return timeDiff;
        },

        _debugGame: function(event, data) {
            if (window.debugGame) {

                var extraInfo = "";

                if (data == null) {

                    // it is a playerId
                } else if (typeof data == 'string') {
                    extraInfo = data;

                    // it is a player
                } else if (typeof data.name != 'undefined') {
                    extraInfo = data.name;

                    // it is broadcastData
                } else if (typeof data.counter != 'undefined') {
                    extraInfo = "counter" + data.counter;
                }

                $('#debugSocket').prepend(event + ":" + extraInfo + "<br />");
            }
        }
    });

    return new Socket();
});