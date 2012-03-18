// Set up routes
module.exports = function (app) {

    app.get('/', function (req, res) {
        res.render('index', {
            title: 'SolarTournament // Home'
        });
    });

    app.get('/tournament', function (req, res) {
        res.render('tournament', {
            title: 'SolarTournament // Tournament',
            locals: {
                socketUri: app.serverInfo.getSocketUri(req.headers.host)
            }
        });
    });

    app.get('/about', function (req, res) {
        res.render('SolarTournament // about', { title: 'About' });
    });


    // scripts to load on every page - see scriptRendering.js
    app.dynamicHelpers({
        scripts: function () {
            return ['scripts/jquery-1.7.1.min.js'];
        }
    });
}