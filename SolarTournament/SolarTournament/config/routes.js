// Set up routes
module.exports = function (app) {

    app.get('/', function (req, res) {
        res.render('index', { title: 'Home' });
    });

    app.get('/training', function (req, res) {
        res.render('training', { title: 'Training' });
    });

    app.get('/tournament', function (req, res) {
        res.render('tournament', {
            title: 'Multiplayer Tournament',
            locals: {
                socketUri: app.serverInfo.uri
            }
        });
    });

    app.get('/about', function (req, res) {
        res.render('about', { title: 'About' });
    });


    // scripts to load on every page - see scriptRendering.js
    app.dynamicHelpers({
        scripts: function () {
            return ['scripts/jquery-1.7.1.min.js'];
        }
    });
}