/*
 * Templates are items from the scene that can be used to spawn new objects in the world
 */
var SceneTemplates = function (engine, skyboxName) {

    this.NUMBER_OF_ASTEROIDS = 3;
    this._engine = engine;
    this._skyboxName = skyboxName;
    this.resetValues();

    var self = this;

    this.getAsteroidTemplates = function () {
        return self._asteroidTemplates;
    };

    this.getPhotonTemplate = function () {
        return self._photonTemplate;
    };

    this.getSmokeTemplate = function () {
        return self._smokeTemplate;
    };

    this.getSpaceshipTemplateByName = function (name) {
        return self._spaceshipTemplates.getByName(name);
    };

    this.getSpaceshipTemplates = function () {
        return self._spaceshipTemplates;
    };
};

SceneTemplates.addToProto({

    resetValues: function () {

        this._asteroidTemplates = new Array();
        this._photonTemplate = null;
        this._smokeTemplate = null;
        this._spaceshipTemplates = new Array();
    },

    loadTemplates: function (callback) {

        this.resetValues();

        var scene = this._engine.getScene();

        if (!scene) {
            throw "NO_SCENE in loadTemplates";
        }

        // collect all known asteroids
        for (var i = 0; i < this.NUMBER_OF_ASTEROIDS; ++i) {

            var asteroid = scene.getSceneNodeFromName('asteroid' + (i + 1));
            if (asteroid) {
                asteroid.Visible = false;
                this._asteroidTemplates.push(asteroid);
            }
        }

        // collect photon
        var photon = scene.getSceneNodeFromName('photonBlue');
        if (photon) {
            photon.Visible = false;
            this._photonTemplate = photon;
        }

        // collect smoke
        var smoke = scene.getSceneNodeFromName('smoke');
        if (smoke) {
            smoke.Visible = false;
            this._smokeTemplate = smoke;
        }

        // spaceship
        var spaceships = ["humanInterceptor", "alienInterceptor"];

        for (var n = 0; n < spaceships.length; n++) {

            var spaceship = scene.getSceneNodeFromName(spaceships[n]);
            
            if (spaceship) {
                
                spaceship.Visible = false;
                spaceship.name = spaceships[n];
                this._spaceshipTemplates.push(spaceship);
            }
        }

        var skybox = scene.getSceneNodeFromName(this._skyboxName);
        if (skybox) {
            skybox.Visible = true;
        }

        callback();
    }
});