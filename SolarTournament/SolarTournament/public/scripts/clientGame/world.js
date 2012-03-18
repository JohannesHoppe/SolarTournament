/*
 * Contains all objects the player can interact with
 *
 * ---------------------------------------------------------------------
 *   Compared to the client world the server world is too simple
 *   Many things will have to be ported the the server side, too.
 * 
 *   Please keep in mind:
 *   Cheeting with Firebug is NOT COOL! This is demo code, you know! ;-)
 * ---------------------------------------------------------------------
*/
var World = function (engine, sceneTemplates, player) {

    this._engine = engine;
    this._sceneTemplates = sceneTemplates;
    
    this._ownPlayer = player;

    this._asteroids = new Array();
    this._photons = new Array();
    this._smokes = new Array();
    this._players = new Array();
    
    // bindings
    this._ownPlayer.onShootPlaced((this._handleShootPlaced).bind(this));
};

World.addToProto({

    animate: function (timeDiff) {

        this._ownPlayer.animate(timeDiff);
        this._doMoveAndCollideObjects(timeDiff);

        // currently we don't care if player _really_ changed his position
        $(this).trigger("playerPositionChanged", this._ownPlayer.getPositionAndRotation());
    },

    // used in main menue only!
    spawnNewAsteroids: function (level) {
        new AsteroidSpawner(this._engine, this._sceneTemplates.getAsteroidTemplates, this._asteroids)
            .createRandomAsteroidField(level);
    },

    clearScene: function () {

        // asteroids, photons and smokes are direct Copperlicht SceneNodes (with some extra properties)
        Copper.clearSceneNodeArray(this._asteroids);
        Copper.clearSceneNodeArray(this._photons);
        Copper.clearSceneNodeArray(this._smokes);

        // players are objects that also implement removeFromScene()
        Copper.clearSceneNodeArray(this._players);
    },

    // shoots that were placed by our own player
    _handleShootPlaced: function (event, positionAndTarget) {

        var position = positionAndTarget.position;
        var target = positionAndTarget.target;
        this.spawnShoot(position, target, this._ownPlayer.id);
        $(this).trigger("shootPlaced", positionAndTarget);
    },

    // an asteroid that was destroyed by our own or by an other player
    _handleAsteriodDestroyed: function (shooterPlayerId) {

        playsound('explosion');

        if (shooterPlayerId == this._ownPlayer.id) {
            $(this).trigger("asteroidDestroyedByOwnPlayer");
        }
    },

    // duplicate client side game logic that would require too much communication with server side
    _doMoveAndCollideObjects: function (timeDiff) {

        var now = new Date().getTime();

        var addSmokeCall = function (center) {
            Copper.addSmoke(this._engine, this._sceneTemplates.getSmokeTemplate, center, now, this._smokes);
        } .bind(this);

        Copper.moveSmokes(now, timeDiff, this._smokes);
        Copper.movePhotons(now, timeDiff, this._photons, this._asteroids, this._handleAsteriodDestroyed.bind(this), addSmokeCall);
    },


    /* **** server driven updates to the world **** */

    spawnOwnPlayer: function (player) {

        var getTemplateCall = function () { return this._sceneTemplates.getSpaceshipTemplateByName(player.spaceship); } .bind(this);
        var model = Copper.loadPlayerModel(this._engine, getTemplateCall, player.name);

        this._ownPlayer.resetValues();
        this._ownPlayer.setModel(model);
        this._ownPlayer.initWithValuesFromServer(player);
    },

    spawnOtherPlayer: function (player) {

        var getTemplateCall = function () { return this._sceneTemplates.getSpaceshipTemplateByName(player.spaceship); } .bind(this);
        var model = Copper.loadPlayerModel(this._engine, getTemplateCall, player.name);

        var otherPlayer = new PlayerBase();
        otherPlayer.setModel(model);
        otherPlayer.initWithValuesFromServer(player);

        this._players.push(otherPlayer);
    },

    updatePlayers: function (players) {

        for (var n = 0; n < players.length; n++) {

            var player = players[n];

            // we ignore our own position since we dictate it to the server anyway
            if (player.id == this._ownPlayer.id) { continue; }

            var otherPlayer = this._players.getById(player.id);

            if (otherPlayer != null) {

                otherPlayer.setPositionAndRotation(player.position, player.rotation);

                // we have missed the spawn event
            } else {
                this.spawnOtherPlayer(player);
            }
        };
    },

    removePlayer: function (otherPlayerId) {
        Copper.removeFromSceneNodeArray(this._players, otherPlayerId);
    },

    spawnShoot: function (position, target, playerId) {

        var now = new Date().getTime();
        var photon = Copper.addShoot(this._engine, now, this._sceneTemplates.getPhotonTemplate, position, target, this._photons);
        photon.playerId = playerId;
        playsound('shootsound');
    },

    /* **** public events **** */

    // Bind an event handler to the "asteroidDestroyedByOwnPlayer" event
    onAsteroidDestroyedByOwnPlayer: function (handler) {

        $(this).bind("asteroidDestroyedByOwnPlayer", handler);
    },

    // Bind an event handler to the "playerPositionChanged" event
    onPlayerPositionChanged: function (handler) {

        $(this).bind("playerPositionChanged", handler);
    },

    // Bind an event handler to the "shootPlaced" event
    // Note: this is a "bubbling" event, player has also onShootPlaced
    onShootPlaced: function (handler) {

        $(this).bind("shootPlaced", handler);
    }
});

