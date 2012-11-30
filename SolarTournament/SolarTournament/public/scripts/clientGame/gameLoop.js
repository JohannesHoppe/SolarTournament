/*
 * central class, called after resources were loeaded
 */
define(['clientGame/infrastructure/htmlMenu',
        'clientGame/infrastructure/keyboardWatcher',
        'clientGame/infrastructure/engine',
        'clientGame/infrastructure/sceneAttachment',
        'clientGame/cams/mainMenuCam',
        'clientGame/cams/thirdPersonCam',
        'clientGame/world',
        'clientGame/socket',
        'clientGame/utils/sound'],
    function (htmlMenu,
              keyboardWatcher,
              engine,
              sceneAttachment,
              mainMenuCam,
              thirdPersonCam,
              world,
              socket,
              sound) {

    var GameLoop = function() {

        this.MAX_GAME_TIME = 5 * 60 * 1000;
        this.GAME_HAS_END_TIME = true;

        this._htmlMenu = htmlMenu;
        this._mainMenuCam = mainMenuCam;
        this._currentCam = thirdPersonCam;
        this._keyboardWatcher = keyboardWatcher;

        this._engine = engine;
        this._world = world;
        this._socket = socket;
        this._sceneAttachment = sceneAttachment;

        this._action = function () { };
        this._gameState = null;
        this._lastGameStartTime = 0;
        this._lastGameCalculationTime = 0;
        this._gameScore = 0;

        // bindings
        $('#startGame').click((this.startGame).bind(this));
        this._keyboardWatcher.onExitRequested((this.exitGame).bind(this));
        this._keyboardWatcher.onActionPressed((this._doAction).bind(this));
    };

    GameLoop.addToProto({
        // Returns a "scope-save" initGame (scope-save means "this" equals to GameLoop constructors "this")
        getInitGameCall: function() {
            return (function(event, eventData) { this.initGame(); }).bind(this);
        },

        // initializes game (after all data was loaded)
        initGame: function() {

            this.showMainMenu();
            
            // last bindings
            this._sceneAttachment.addLightToScene();
            this._engine.OnAnimate = (this.animate).bind(this);
            this._world.onAsteroidDestroyedByOwnPlayer((this._increaseGameScore).bind(this));
        },

        showMainMenu: function() {

            this._gameState = 'menu';
            this._action = this.startGame;

            this._world.clearScene();
            this._world.spawnNewAsteroids(10);

            this._mainMenuCam.setActive(this._engine);
            this._htmlMenu.showMainMenu();

            sound.playmusic('mainmenumusic');
        },

        startGame: function() {

            this._gameState = 'game';
            this._action = function() {
            };

            this._world.clearScene();
            this._socket.connect();

            this._world.spawnNewAsteroids(11);

            this._lastGameCalculationTime = new Date().getTime();
            this._lastGameStartTime = this._lastGameCalculationTime;
            this._gameScore = 0;

            this._currentCam.setActive(this._engine);
            this._htmlMenu.showGame();

            sound.playmusic('gamemusic');
        },

        exitGame: function() {

            if (this._gameState == 'game') {

                this._gameState = 'menu';
                this._action = this.showMainMenu;

                this._socket.saveHighscore(this._world.getPlayerName(), this._gameScore);
                this._socket.disconnect();

                this._htmlMenu.showInfoPlate('Game ended.<br>Your score: ' + this._gameScore);

                sound.playmusic('mainmenumusic');
            }
        },

        // called each frame by the 3d engine
        animate: function() {

            if (this._gameState == 'menu') {
                if (this._mainMenuCam) {
                    this._mainMenuCam.update();
                }
            }

            if (this._gameState == 'game') {
                this._doGameLogic();
            }
        },

        _doGameLogic: function() {

            var timeDiff = this._calculateTimeDiff();

            this._world.animate(timeDiff);

            if (this.GAME_HAS_END_TIME) {

                var remainingTime = this._calculateRemainingTime();
                this._htmlMenu.updateHud(remainingTime, this._gameScore);

                // back to main menu when time is over
                if (remainingTime <= 0) {
                    this.exitGame();
                }
            } else {

                this._htmlMenu.updateHud(-1, this._gameScore);
            }
        },

        _calculateTimeDiff: function() {

            var now = new Date().getTime();
            var timeDiff = now - this._lastGameCalculationTime;
            //if (timeDiff > 500) { timeDiff = 500; } // why??

            this._lastGameCalculationTime = now;

            return timeDiff;
        },

        _calculateRemainingTime: function() {

            var now = new Date().getTime();
            var remainingTime = ((this._lastGameStartTime + this.MAX_GAME_TIME) - now) / 1000;
            if (remainingTime < 0) {
                remainingTime = 0;
            } else {
                remainingTime = remainingTime.toFixed(0);
            }

            return remainingTime;
        },

        _increaseGameScore: function() {
            this._gameScore += 110;
        },

        _doAction: function() {
            this._action();
        }
    });

    return new GameLoop();
});