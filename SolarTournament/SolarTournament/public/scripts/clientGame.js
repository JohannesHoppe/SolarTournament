// entry point for the game
$(function () {

    // a small delay should address some loading issues
    setTimeout(function () {

        var htmlMenu = new HtmlMenu();
        var mainMenuCam = new MainMenuCam();
        var keyboardWatcher = new KeyboardWatcher();

        if (!window.debugGame) {

            // old version
            var currentCam = new GameCam();
            var player = new Player(keyboardWatcher, currentCam);
            var skyboxName = "skyboxSpace";

        } else {

            // work in progress
            var currentCam = new ThirdPersonCam();
            var player = new PlayerTwo(keyboardWatcher, currentCam);
            var skyboxName = "skyboxDebug";
        }

        var gameLoop = new GameLoop(htmlMenu, mainMenuCam, currentCam, keyboardWatcher);
        var gameLoader = new GameLoader(htmlMenu, player, skyboxName);
        gameLoader.onGameLoaded(gameLoop.getInitGameCall());
        gameLoader.loadGame();

    }, 500);
});