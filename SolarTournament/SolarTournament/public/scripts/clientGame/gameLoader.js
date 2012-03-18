/*
 * Loads resources and initiliazes the asteroids, ends with a trigger call "gameLoaded"
 */
var GameLoader = function (htmlMenu, player, skyboxName, socketUri) {

    this._htmlMenu = htmlMenu;
    this._ownPlayer = player;
    this._skyboxName = skyboxName;
    this._socketUri = socketUri;

    this._engine = null;
    this._sceneTemplates = null;
    this._world = null;
};

GameLoader.prototype.loadGame = function () {

    var start = (function () {

        this._htmlMenu.showLoadingLabel();

    }).bind(this);

    // 1.
    var loadEngine = (function () {

        var def = $.Deferred();

        this._engine = new CL3D.CopperLicht('gameCanvas', true, 30);

        if (!this._engine.initRenderer()) {

            this._htmlMenu.showNoWebglMessage();
            def.reject("NO WEBGL!");
        }

        this._engine.OnLoadingComplete = function () { def.resolve(); };
        this._engine.load('copperlichtdata/scene1.ccbjs');

        return def;

    }).bind(this);

    // 2.
    var loadTemplates = (function () {

        var def = $.Deferred();

        this._sceneTemplates = new SceneTemplates(this._engine, this._skyboxName);
        this._sceneTemplates.loadTemplates(function () { def.resolve(); });

        return def;

    }).bind(this);

    // 3.
    var createWorld = (function () {

        var def = $.Deferred();

        this._world = new World(this._engine, this._sceneTemplates, this._ownPlayer);

        def.resolve();
        return def;

    }).bind(this);

    // 4.
    var connectToServer = (function () {

        var def = $.Deferred();
        this._socket = new Socket(this._socketUri, this._world);


        return def;

    }).bind(this);

    // 5.
    var finish = (function () {

        var def = $.Deferred();

        //playmusic('mainmenumusic');
        this._htmlMenu.hideLoadingLabel();

        def.resolve();
        return def;

    }).bind(this);

    start();

    loadEngine()
        .then(loadTemplates)
        .then(createWorld)
        .then(connectToServer)
        .then(finish)
        .then((function () {

            $(this).trigger("gameLoaded", {
                engine: this._engine,
                world: this._world,
                socket: this._socket
            });

        }).bind(this));
};

// Bind an event handler to the "gameLoaded" event
GameLoader.prototype.onGameLoaded = function (handler) {

    $(this).bind("gameLoaded", handler);
};