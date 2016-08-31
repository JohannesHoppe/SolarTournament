define(['jquery',
        'clientGame/gameLoop',
        'clientGame/infrastructure/gameLoader',
        'copperlicht',
        'languageEnhancements'], function ($, gameLoop, gameLoader) {

    return {
        start: function () {

            gameLoader.onGameLoaded(gameLoop.getInitGameCall());
            gameLoader.loadGame();
        }
    };
});