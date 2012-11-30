/*
 * Loads resources and initiliazes the asteroids, ends with a event call "gameLoaded"
 */
define(['config',
        'clientGame/infrastructure/htmlMenu',
        'clientGame/infrastructure/engine',
        'clientGame/infrastructure/sceneTemplates',
        'clientGame/grafics/shaderManager'], function (config, htmlMenu, engine, sceneTemplates, shaderManager) {

    var GameLoader = function() { };

    GameLoader.prototype.loadGame = function() {

        // 1.
        var loadEngine = (function() {

            var def = $.Deferred();

            if(!engine.initRenderer())
            {
                htmlMenu.showNoWebglMessage();
                def.reject("NO WEBGL!");
            }

            engine.OnLoadingComplete = function() { def.resolve(); };
            engine.load('copperlichtdata/scene1.ccbjs');
            shaderManager.updateShader();

            return def;

        }).bind(this);

        htmlMenu.showLoadingLabel();

        loadEngine()
            .then((function() {

                sceneTemplates.loadTemplates();
                htmlMenu.hideLoadingLabel();

                $(this).trigger("gameLoaded");

            }).bind(this));
    };

    // Bind an event handler to the "gameLoaded" event
    GameLoader.prototype.onGameLoaded = function(handler) {

        $(this).bind("gameLoaded", handler);
    };
        
    return new GameLoader();
});