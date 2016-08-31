define(['CL3D',
        'clientGame/infrastructure/engine',
        'clientGame/infrastructure/sceneTemplates',
        'clientGame/utils/copper',
        'clientGame/utils/gameMath',
        'clientGame/utils/Randomizer',
        'clientGame/grafics/shaderManager'], function (CL3D, engine, sceneTemplates, copper, gameMath, Randomizer, shaderManager) {

            var AsteroidSpawner = function () {
                this.asteroids = [];
                this.gameMath = gameMath;
                this.matIds = [];
            };

            AsteroidSpawner.addToProto({

                _createNewAsteroid : function (asteroidTemplate, position, animatorVect) {

                    var asteroidTemplateCall = function() { return asteroidTemplate; };

                    var clone = copper.createClone(engine, asteroidTemplateCall, position);

                    clone.shaderId = shaderManager.drawWithPhongShader(clone);
                    clone.animatorVect = animatorVect;
                    clone.orientation = new CL3D.Quaternion(1, 0, 0, 0);
                    clone.sphereCollider = {};
                    clone.sphereCollider.radius = 1000;

                    return clone;
                },
    
                createRandomAsteroidField : function(level, arrayToFill) {

                    var asteroidTemplates = sceneTemplates.getAsteroidTemplates();
                    var asteroidCount = 10 * level;
                    var radius = 20000;
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
                        var asteroidTemplate = asteroidTemplates[typenr];

                        var newAsteroid = this._createNewAsteroid(asteroidTemplate, position, animatorVect);
            
                        arrayToFill.push(newAsteroid);
                        this.asteroids.push(newAsteroid);
                    }
                },

                updateAsteroids : function (timeDiff) {
                    for (var asteroidCount = 0; asteroidCount < this.asteroids.length; asteroidCount++) {
                        this.asteroids[asteroidCount].orientation = this.gameMath.getLocalRotationQuanterion(this.asteroids[asteroidCount].animatorVect, 0.0002, this.asteroids[asteroidCount].orientation, timeDiff);

                        this.asteroids[asteroidCount].orientation.normalize();
                        var rotationMatrix = this.asteroids[asteroidCount].orientation.getMatrix();
                        this.asteroids[asteroidCount].Rot = rotationMatrix.getRotationDegrees();
                        this.asteroids[asteroidCount].Children[0].Rot = rotationMatrix.getRotationDegrees();
                    }
                }
         });

        return new AsteroidSpawner();
});