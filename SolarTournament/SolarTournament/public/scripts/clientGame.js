// entry point for the game
$(function () {

    // a small delay should address some loading issues
    setTimeout(function () {

        var htmlMenu = new HtmlMenu();
        var mainMenuCam = new MainMenuCam();
        var keyboardWatcher = new KeyboardWatcher();

        var currentCam;
        var player;
        var skyboxName;

        if (true) {

            // stable version
            currentCam = new GameCam();
            player = new Player(keyboardWatcher, currentCam);
            skyboxName = "skyboxSpace";

        } else {

            // experimental stuff
            currentCam = new ThirdPersonCam();
            player = new PlayerTwo(keyboardWatcher, currentCam);
            skyboxName = "skyboxDebug";
        }

        var gameLoop = new GameLoop(htmlMenu, mainMenuCam, currentCam, keyboardWatcher, window.socketUri);
        var gameLoader = new GameLoader(htmlMenu, player, skyboxName);
        gameLoader.onGameLoaded(gameLoop.getInitGameCall());
        gameLoader.loadGame();

    }, 500);
});