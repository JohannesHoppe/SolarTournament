var MongoServer = require('mongodb').Server;
var MongoDb = require('mongodb').Db;
var MongoConnection = require('mongodb').Connection;
var bson = require('mongodb').BSONNative;
var objectID = require('mongodb').ObjectID;

module.exports = function () {

    var MONGO_DATABASE = "SolarTournament";
    var mongoDb = null;

    var mongoServer = new MongoServer("localhost", 27017, {});
    mongoDb = new MongoDb(MONGO_DATABASE, mongoServer, { native_parser: false });
    mongoDb.open(function () { });
    console.log("Connection open");

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