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

    app.configure('development', function () {

        app.use(express.static(dirname + '/public'));
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

    // ***********************************************************************

    // If you host socket.io in a Azure web role, you will have to disable
    // the WebSockets transport on the server. This is because Web roles run
    // in a pre-configured IIS7, and IIS doesn't support web sockets yet! :(
    
    // websocket --> not supported by iis
    // xhr-polling --> warning: firefox throws a lot of errors here
    var allTransports = ['websocket', 'flashsocket', 'htmlfile', 'xhr-polling', 'jsonp-polling'];    
    var azureTransports = ['flashsocket', 'htmlfile', 'xhr-polling', 'jsonp-polling'];
    var runningInAzure = port != 1337;

    // ***********************************************************************

    io.configure(function () {
        io.set('transports', runningInAzure ? azureTransports : allTransports);
        io.set("polling duration", 10);
        io.set('log level', 1);
    });
    
    // for later use
    app.serverInfo = {

        runningInAzure : runningInAzure,
        getSocketUri: function (hostAndPort) { return util.format("http://%s", hostAndPort); },
        port: port,
        mode: process.env.NODE_ENV
    };
};