var express = require('express');
var app = module.exports = express.createServer();
var io = require('socket.io').listen(app);

require('./config/config.js')(express, app, io, __dirname);
//var highscoreProvider = require('./game/highscoreProvider.js')(app);
var highscoreProvider = require('./game/highscoreProviderFake.js')(app);

require('./config/routes.js')(app, highscoreProvider);

var world = require('./game/serverWorld.js')();
var socket = require('./game/serverSocket.js')(io, world, highscoreProvider);


if (!module.parent) {
    app.listen(app.serverInfo.port);
    console.log("Express server listening on port %d", app.serverInfo.port);
    console.log("Environments Mode: %s", app.serverInfo.mode);
}