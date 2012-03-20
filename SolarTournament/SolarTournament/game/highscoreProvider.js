var AzureMongoEndpoint = require('azureMongoEndpoints').AzureMongoEndpoint;
var MongoServer = require('mongodb').Server;
var MongoDb = require('mongodb').Db;
var MongoConnection = require('mongodb').Connection;
var bson = require('mongodb').BSONNative;
var objectID = require('mongodb').ObjectID;

module.exports = function (app) {

    var MONGO_DATABASE = "SolarTournament";
    var mongoDb = null;

    if (!app.serverInfo.runningInAzure) {

        // the normal way
        var mongoServer = new MongoServer("localhost", 27017, {});
        mongoDb = new MongoDb(MONGO_DATABASE, mongoServer, { native_parser: false });
        mongoDb.open(function () { });
        console.log("Connection open");

    } else {

        var azureMongoEndpoints = new AzureMongoEndpoint('ReplicaSetRole', 'MongodPort');

        // Azure specific: Watch the endpoint for topologyChange events
        azureMongoEndpoints.on('topologyChange', function () {

            if (mongoDb != null) {
                mongoDb.close();
                mongoDb = null;
            }

            var mongoAzureServer = azureMongoEndpoints.getMongoDBServerConfig();
            mongoDb = new MongoDb(MONGO_DATABASE, mongoAzureServer, { native_parser: false });
            mongoDb.open(function () { });
            console.log("Azure: Connection open");
        });

        azureMongoEndpoints.on('error', function (error) { throw error; });
    }

    /* pretty normal MongoDB stuff here */

    // public
    var getTopTen = function (callback) {

        getCollection(function (error, highscoreCollection) {

            if (error) { callback(error); return; }
            highscoreCollection.find({}, { "limit": 10, sort: [['score', -1]] }
            
             ).toArray(function (innerError, docs) {

                if (innerError) { callback(innerError); return; }
                callback(null, docs);
            });

        });
    };

    // public
    var save = function (highscore, callback) {

        getCollection(function (error, highscoreCollection) {

            if (error) { callback(error); return; }
            highscoreCollection.save(highscore, function (innerError) {

                if (innerError) { callback(innerError); return; }
                callback(null);
            });
        });
    };


    // used by getCollection
    var ensureMongoDbConnection = function (callback) {

        if (mongoDb.state !== 'connected') {
            mongoDb.open(function (error) { callback(error); });
        } else {
            callback(null);
        }
    };

    // used by findAll and save
    var getCollection = function (callback) {

        ensureMongoDbConnection(function (error) {

            if (error) { callback(error); return; }

            mongoDb.collection('highscore', function (innerError, highscoreCollection) {

                if (innerError) { callback(error); return; }
                callback(null, highscoreCollection);
            });
        });
    };

    return {
        getTopTen: getTopTen,
        save: save
    };
};