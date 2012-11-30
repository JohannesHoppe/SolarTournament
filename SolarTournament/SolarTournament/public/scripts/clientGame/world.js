/*
 * Contains all objects the player can interact with
*/
define(['clientGame/infrastructure/engine',
        'clientGame/infrastructure/sceneTemplates',
        'clientGame/infrastructure/asteroidSpawner',
        'clientGame/worldObjects/ownPlayer',
        'clientGame/worldObjects/PlayerBase',
        'clientGame/utils/copper',
        'clientGame/utils/sound'], function (engine, sceneTemplates, asteroidSpawner, ownPlayer, PlayerBase, copper, sound) {

    var World = function() {

        this._engine = engine;
        this._sceneTemplates = sceneTemplates;

        this._ownPlayer = ownPlayer;

        this._asteroids = new Array();
        this._photons = new Array();
        this._smokes = new Array();
        this._players = new Array();

        // bindings
        this._ownPlayer.onShootPlaced((this._handleShootPlaced).bind(this));

    };

    World.addToProto({
        animate: function(timeDiff) {

            this._ownPlayer.animate(timeDiff);
            this._doMoveAndCollideObjects(timeDiff);
            asteroidSpawner.updateAsteroids(timeDiff);

            // currently we don't care if player _really_ changed his position
            $(this).trigger("playerPositionChanged", this._ownPlayer.getPositionAndRotation());
        },

        getPlayerName: function() {
            return this._ownPlayer.name;
        },

        // used in main menue only!
        spawnNewAsteroids: function(level) {
            asteroidSpawner.createRandomAsteroidField(level, this._asteroids);
        },

        clearScene: function() {

            // asteroids, photons and smokes are direct Copperlicht SceneNodes (with some extra properties)
            copper.clearSceneNodeArray(this._asteroids);
            copper.clearSceneNodeArray(this._photons);
            copper.clearSceneNodeArray(this._smokes);

            // players are objects that also implement removeFromScene()
            copper.clearSceneNodeArray(this._players);
        },

        // shoots that were placed by our own player
        _handleShootPlaced: function(event, positionAndTarget) {

            var position = positionAndTarget.position;
            var target = positionAndTarget.target;
            this.spawnShoot(position, target, this._ownPlayer.id);
            $(this).trigger("shootPlaced", positionAndTarget);
        },

        // an asteroid that was destroyed by our own or by an other player
        _handleAsteriodDestroyed: function(shooterPlayerId) {

            sound.playsound('explosion');

            if (shooterPlayerId == this._ownPlayer.id) {
                $(this).trigger("asteroidDestroyedByOwnPlayer");
            }
        },

        // duplicate client side game logic that would require too much communication with server side
        _doMoveAndCollideObjects: function(timeDiff) {

            var now = new Date().getTime();

            var addSmokeCall = function(center) {
                copper.addSmoke(this._engine, this._sceneTemplates.getSmokeTemplate, center, now, this._smokes);
            }.bind(this);

            copper.moveSmokes(now, timeDiff, this._smokes);
            copper.movePhotons(this._engine, now, timeDiff, this._photons, this._asteroids, this._handleAsteriodDestroyed.bind(this), addSmokeCall);
            copper.testOfPlayerCollision(this._ownPlayer, this._asteroids);
        },


        /* **** server driven updates to the world **** */

        spawnOwnPlayer: function(player) {

            var getTemplateCall = function() { return this._sceneTemplates.getSpaceshipTemplateByName(player.spaceship); }.bind(this);
            var model = copper.loadPlayerModel(this._engine, getTemplateCall, player.name);
            model.Name = "ownPlayer";

            this._ownPlayer.resetValues();
            this._ownPlayer.setModel(model)
            this._ownPlayer.initWithValuesFromServer(player);
        },

        spawnOtherPlayer: function(player) {

            var getTemplateCall = function() { return this._sceneTemplates.getSpaceshipTemplateByName(player.spaceship); }.bind(this);
            var model = copper.loadPlayerModel(this._engine, getTemplateCall, player.name);

            var otherPlayer = new PlayerBase();
            otherPlayer.setModel(model);
            otherPlayer.initWithValuesFromServer(player);

            this._players.push(otherPlayer);
        },

        updatePlayers: function(players) {

            for (var n = 0; n < players.length; n++) {

                var player = players[n];

                // we ignore our own position since we dictate it to the server anyway
                if (player.id == this._ownPlayer.id) {
                    continue;
                }

                var otherPlayer = this._players.getById(player.id);

                if (otherPlayer != null) {

                    otherPlayer.setPositionAndRotation(player.position, player.rotation);

                    // we have missed the spawn event
                } else {
                    this.spawnOtherPlayer(player);
                }
            }
            ;
        },

        removePlayer: function(otherPlayerId) {
            copper.removeFromSceneNodeArray(this._players, otherPlayerId);
        },

        spawnShoot: function(position, target, playerId) {

            var now = new Date().getTime();
            var photon = copper.addShoot(this._engine, now, this._sceneTemplates.getPhotonTemplate, position, target, this._photons);
            photon.playerId = playerId;
            sound.playsound('shootsound');
        },

        /* **** public events **** */

        // Bind an event handler to the "asteroidDestroyedByOwnPlayer" event
        onAsteroidDestroyedByOwnPlayer: function(handler) {

            $(this).bind("asteroidDestroyedByOwnPlayer", handler);
        },

        // Bind an event handler to the "playerPositionChanged" event
        onPlayerPositionChanged: function(handler) {

            $(this).bind("playerPositionChanged", handler);
        },

        // Bind an event handler to the "shootPlaced" event
        // Note: this is a "bubbling" event, player has also onShootPlaced
        onShootPlaced: function(handler) {

            $(this).bind("shootPlaced", handler);
        }
    });

    return new World();
});
