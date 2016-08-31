var stylus = require('stylus');
var gzippo = require('gzippo');
var util = require('util');

// Configuration
module.exports = function (express, app, io, dirname) {

    // IIS Node.js integration
    var port = process.env.port || 1337;

    if (process.env.NODE_ENV === undefined) {
        process.env.NODE_ENV = "development";
    }

    app.configure(function () {
        app.set('views', dirname + '/views');
        app.set('view engine', 'jade');
        app.use(express.bodyParser());
        app.use(express.methodOverride());
        app.use(stylus.middleware({ src: dirname + '/public' }));
        app.use(app.router);
    });

    app.configure('development', function() {

        // instead of express.static for the sake of jslint
        app.use(express['static'](dirname + '/public'));
        app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
        app.set('view options', { pretty: true });

    });

    app.configure('production', function () {

        app.use(gzippo.staticGzip(dirname + '/public'));
        app.use(gzippo.compress());

        app.use(express.errorHandler());

        io.enable('browser client minification');  // send minified client
        io.enable('browser client etag');          // apply etag caching logic based on version number
        io.enable('browser client gzip');          // gzip the file
    });

    io.configure(function () {
        io.set('transports', ['websocket', /* 'flashsocket', */ 'htmlfile', 'xhr-polling', 'jsonp-polling']);
        io.set("polling duration", 10);
        io.set('log level', 1);
    });
    
    // for later use
    app.serverInfo = {

        getSocketUri: function (hostAndPort) { return util.format("http://%s", hostAndPort); },
        port: port,
        mode: process.env.NODE_ENV
    };
};