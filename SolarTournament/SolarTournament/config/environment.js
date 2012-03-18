var stylus = require('stylus');
var gzippo = require('gzippo');

// Environment Configuration
module.exports = function (app, express, dirname) {

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
    });

    // for later use
    app.serverInfo = {
        uri: "http://localhost:" + port,
        port: port,
        mode: process.env.NODE_ENV
    };
};