module.exports = function (app) {

    var getTopTen = function (callback) {

        var docs = [
             { score: 1000, name: "Highscore is disabled" }
        ];
        callback(null, docs);
    };

    var save = function (highscore, callback) {

    };

    return {
        getTopTen: getTopTen,
        save: save
    };
};