// Module dependencies.
var express = require('express');
var app = module.exports = express.createServer();
var io = require('socket.io').listen(app);

require('./config/environment.js')(app, express, __dirname);
require('./config/routes.js')(app);
require('./config/scriptRendering.js')(app);
require('./game/socket.js')(io);

if (!module.parent) {
    app.listen(app.serverInfo.port);
    console.log("Express server listening on port %d", app.address().port);
    console.log("Environments Mode: %s", app.serverInfo.mode);
}