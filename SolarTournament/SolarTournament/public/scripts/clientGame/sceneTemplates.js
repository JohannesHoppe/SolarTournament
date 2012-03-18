/*
 * Templates are items from the scene that can be used to spawn new objects in the world
 */
var SceneTemplates = function (engine, skyboxName) {

    this.NUMBER_OF_ASTEROIDS = 3;
    this._engine = engine;
    this._skyboxName = skyboxName;
    this._resetValues();
};

SceneTemplates.prototype.getAsteroidTemplates = function() {
    return this._asteroidTemplates;
};

SceneTemplates.prototype.getPhotonTemplate = function () {
    return this._photonTemplate;
};

SceneTemplates.prototype.getSmokeTemplate = function () {
    return this._smokeTemplate;
};

SceneTemplates.prototype.getSpaceshipTemplates = function () {
    return this._spaceshipTemplates;
};

SceneTemplates.prototype._resetValues = function () {

    this._asteroidTemplates = new Array();
    this._photonTemplate = null;
    this._smokeTemplate = null;
    this._spaceshipTemplates = new Array();
};

SceneTemplates.prototype.loadTemplates = function (callback) {

    this._resetValues();

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
    var photon = scene.getSceneNodeFromName('photon');
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

    // loads interceptor spaceship
    var spaceship = scene.getSceneNodeFromName('interceptor');
    if (spaceship) {
        spaceship.Visible = false;
        spaceship.Rot.Y = 90;
        spaceship.Name = 'interceptor';
        this._spaceshipTemplates.push(spaceship);
    }

    var skybox = scene.getSceneNodeFromName(this._skyboxName);
    if (skybox) {
        skybox.Visible = true;
    }

    callback();
};