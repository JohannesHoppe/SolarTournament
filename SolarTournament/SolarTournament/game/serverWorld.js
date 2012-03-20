/*
 * Contains all objects for all players
 *
 * ---------------------------------------------------------------------
 *   Compared to the client world the server world is too simple
 *   Many things will have to be ported the the server side, too.
 * 
 *   Please keep in mind:
 *   Cheeting with Firebug is NOT COOL! This is demo code, you know! ;-)
 * ---------------------------------------------------------------------
*/
var serverPlayer = require('./serverPlayer.js')();

module.exports = function () {

    var asteroids = new Array();
    var photons = new Array();
    var players = new Array();

    var addNewPlayer = function (playerId) {

        var newPlayer = serverPlayer.createNewPlayer(playerId, "Player");
        players.push(newPlayer);
        return newPlayer;
    };

    var updatePlayerPosition = function (playerId, positionAndRotation) {

        var player = players.getById(playerId);
        player.position = positionAndRotation.position;
        player.rotation = positionAndRotation.rotation;
    };

    var deletePlayer = function (playerId) {

        players.deleteById(playerId);
    };

    // all required data to describe the current world
    var getWorldData = function () {

        return {
            asteroids: asteroids,
            photons: photons,
            players: players
        };
    };

    var getPlayersCount = function () {
        return players.length;
    };

    return {
        addNewPlayer: addNewPlayer,
        getWorldData: getWorldData,
        updatePlayerPosition: updatePlayerPosition,
        deletePlayer: deletePlayer,
        getPlayersCount: getPlayersCount
    };
};




/* 
* Picks the first element from an array that has the given id and removes it
* Note: all elements must have an "id" property
*/
Array.prototype.deleteById = function (id) {
    
    for (var n = 0; n < this.length; n++) {

        var item = this[n];
        if (item.id == id) {
            this.splice(n, 1);
            break;
        }
    }
};

/* 
* Picks the first element from an array that has the given id
* Note: all elements must have an "id" property
*/
Array.prototype.getById = function (id) {

    for (var n = 0; n < this.length; n++) {
        
        var item = this[n];
        if (item.id == id) {
            return item;
        }
    }

    return null;
};