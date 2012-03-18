// Module dependencies.
var express = require('express');
var app = module.exports = express.createServer();
var io = require('socket.io').listen(app);

require('./config/config.js')(express, app, io, __dirname);
require('./config/routes.js')(app);
require('./config/scriptRendering.js')(app);


var world = require('./game/serverWorld.js')();
require('./game/serverSocket.js')(io, world);


if (!module.parent) {
    app.listen(app.serverInfo.port);
    console.log("Express server listening on port %d", app.address().port);
    console.log("Environments Mode: %s", app.serverInfo.mode);
}