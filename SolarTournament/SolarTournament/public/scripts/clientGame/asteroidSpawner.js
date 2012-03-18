var AsteroidSpawner = function (engine, asteroidTemplates, movingAsteroids) {

    this._engine = engine;
    this._asteroidTemplates = asteroidTemplates;
    this._movingAsteroids = movingAsteroids;
};

AsteroidSpawner.prototype.createRandomAsteroidField = function (level, callback) {

    // used closures: typenr, x, y, z, rsx, rsy, rsz
    var createNewAsteroid = (function () {

        var scene = this._engine.getScene();

        if (!scene) {
            throw "NO_SCENE in createRandomAsteroidField";
        }

        if (this._asteroidTemplates.length == 0) {
            throw "NO_ASTEROID_TEMPLATES";
        }

        var template = this._asteroidTemplates[typenr];
        if (template) {

            var clone = template.createClone(scene.getRootSceneNode());
            clone.Pos.X = x;
            clone.Pos.Y = y;
            clone.Pos.Z = z;
            clone.Visible = true;

            clone.addAnimator(new CL3D.AnimatorRotation(new CL3D.Vect3d(rsx, rsy, rsz)));
            this._movingAsteroids.push(clone);
        }
    }).bind(this);


    var asteroidCount = 10 * level;
    var radius = 1000;
    var r = new Randomizer();
    r.seed(level);

    for (var i = 0; i < asteroidCount; ++i) {

        var x = r.getRandf() * radius * 2 - radius;
        var y = r.getRandf() * radius * 2 - radius;
        var z = r.getRandf() * radius * 2 - radius;
        var rsx = r.getRandf() * 0.2 - 0.1;
        var rsy = r.getRandf() * 0.2 - 0.1;
        var rsz = r.getRandf() * 0.2 - 0.1;
        var typenr = r.getRand() % this._asteroidTemplates.length;

        createNewAsteroid();
    }

    callback();
};