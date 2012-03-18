var AsteroidSpawner = function (engine, asteroidTemplatesCall, asteroidsStorageArray) {

    this._engine = engine;
    this._asteroidTemplatesCall = asteroidTemplatesCall;
    this._asteroidsStorageArray = asteroidsStorageArray;
};

AsteroidSpawner.addToProto({

    createRandomAsteroidField: function (level) {

        var asteroidTemplates = this._asteroidTemplatesCall();

        var asteroidCount = 10 * level;
        var radius = 1000;
        var r = new Randomizer();
        r.seed(level);

        for (var i = 0; i < asteroidCount; ++i) {

            var position = new CL3D.Vect3d(
                r.getRandf() * radius * 2 - radius,
                r.getRandf() * radius * 2 - radius,
                r.getRandf() * radius * 2 - radius);

            var animatorVect = new CL3D.Vect3d(
                r.getRandf() * 0.2 - 0.1,
                r.getRandf() * 0.2 - 0.1,
                r.getRandf() * 0.2 - 0.1);

            var typenr = r.getRand() % asteroidTemplates.length;

            this._createNewAsteroid(typenr, position, animatorVect, asteroidTemplates);
        }
    },

    _createNewAsteroid: function (typenr, position, animatorVect, asteroidTemplates) {

        var asteroidTemplate = asteroidTemplates[typenr];
        if (asteroidTemplate) {

            var asteroidTemplateCall = function () { return asteroidTemplate; };

            var clone = Copper.createClone(this._engine, asteroidTemplateCall, position);
            clone.addAnimator(new CL3D.AnimatorRotation(animatorVect));
            this._asteroidsStorageArray.push(clone);
        }
    }
});