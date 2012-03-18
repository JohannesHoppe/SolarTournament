/*
 * contains all objects the player can interact with
 */
var World = function (engine, sceneTemplates, player) {

    this._engine = engine;
    this._sceneTemplates = sceneTemplates;
    this._player = player;

    this._movingAsteroids = new Array();
    this._movingPhotons = new Array();
    this._movingSmokes = new Array();
    this._playerModel = null;

    // bindings
    this._player.onShootPlaced((this._shootPlaced).bind(this));
};

World.prototype._loadModel = function (number) {

    var scene = this._engine.getScene();
    var clone = this._sceneTemplates.getSpaceshipTemplates()[number].createClone(scene.getRootSceneNode());
    clone.Visible = true;
    clone.Pos.X = 0;
    clone.Pos.Y = 0;
    clone.Pos.Z = 30;
   return clone;
};

World.prototype.animate = function(timeDiff) {

    this._player.animate(timeDiff);
    this._doMoveAndCollideObjects(timeDiff);
};

World.prototype.spawnPlayer = function() {

    this._player.resetValues();
    this._playerModel = this._loadModel(0);
    this._player.setModel(this._playerModel);
};

World.prototype.spawnNewAsteroids = function (level, callback) {

    new AsteroidSpawner(
        this._engine,
        this._sceneTemplates.getAsteroidTemplates(),
        this._movingAsteroids
    ).createRandomAsteroidField(level, callback);
};

World.prototype.clearScene = function () {

    // delete asteroids
    for (var j = 0; j < this._movingAsteroids.length; ++j) {
        var a = this._movingAsteroids[j];
        a.getParent().removeChild(a);
        this._movingAsteroids.splice(j, 1);
    }

    // delete photons
    for (var i = 0; i < this._movingPhotons.length; ) {
        var p = this._movingPhotons[i];
        p.getParent().removeChild(p);
        this._movingPhotons.splice(i, 1);
    }

    // delete smokes
    for (var k = 0; k < this._movingSmokes.length; ) {
        var s = this._movingSmokes[k];
        s.getParent().removeChild(s);
        this._movingSmokes.splice(k, 1);
    }

    // delete player model
    if (this._playerModel != null) {
        
        this._playerModel.getParent().removeChild(this._playerModel);
        this._playerModel = null;
    }
};

World.prototype._shootPlaced = function(event, eventData) {

    var position = eventData.position;
    var target = eventData.target;
    var moveDir = target.substract(position);
    moveDir.normalize();

    var now = new Date().getTime();
    var scene = this._engine.getScene();
    var clone = this._sceneTemplates.getPhotonTemplate().createClone(scene.getRootSceneNode());
    clone.Pos.X = position.X;
    clone.Pos.Y = position.Y;
    clone.Pos.Z = position.Z;
    clone.Visible = true;
    clone.gameMoveDir = moveDir;
    clone.gameEndLiveTime = now + 1000;

    this._movingPhotons.push(clone);
};

World.prototype._doMoveAndCollideObjects = function(timeDiff) {

    var now = new Date().getTime();

    // move smokes
    for (var k = 0; k < this._movingSmokes.length;) {
        var s = this._movingSmokes[k];

        if (s.gameEndLiveTime < now) {
            s.getParent().removeChild(s);
            this._movingSmokes.splice(k, 1);
        } else {
            s.Pos.addToThis(s.gameMoveDir.multiplyWithScal(timeDiff * 0.1));
            s.updateAbsolutePosition();

            ++k;
        }
    }

    // move photons and delete them
    for (var i = 0; i < this._movingPhotons.length;) {
        var p = this._movingPhotons[i];
        var deletephoton = false;

        if (p.gameEndLiveTime < now) {
            deletephoton = true;
        } else {
            
            // move
            p.Pos.addToThis(p.gameMoveDir.multiplyWithScal(timeDiff * 0.8));
            p.updateAbsolutePosition();

            // collide with all asteroids
            for (var j = 0; j < this._movingAsteroids.length; ++j) {
                
                var ast = this._movingAsteroids[j];

                // collision
                if (ast.Pos.getDistanceTo(p.Pos) < 60) {

                    // remove asteroid
                    ast.getParent().removeChild(ast);
                    this._movingAsteroids.splice(j, 1);
                    deletephoton = true;
                    playsound('explosion');

                    $(this).trigger("asteroidDestroyed");

                    this._addSmoke(40, 40, ast.Pos, timeDiff, now);
                    break;
                }
            }
        }

        if (deletephoton) {
            // delete photon
            p.getParent().removeChild(p);
            this._movingPhotons.splice(i, 1);
        } else {
            // to next photon
            ++i;
        }
    }
};

World.prototype._addSmoke = function(count, radius, center, timeDiff, now) {

    var scene = this._engine.getScene();

    for (var i = 0; i < count; ++i) {
        
        var clone = this._sceneTemplates.getSmokeTemplate().createClone(scene.getRootSceneNode());
        clone.Pos.X = center.X + (Math.random() * radius * 2) - radius;
        clone.Pos.Y = center.Y + (Math.random() * radius * 2) - radius;
        clone.Pos.Z = center.Z + (Math.random() * radius * 2) - radius;
        clone.Visible = true;

        clone.gameEndLiveTime = now + (Math.random() * 2000);

        var moveDir = clone.Pos.substract(center);
        moveDir.normalize();
        clone.gameMoveDir = moveDir;

        this._movingSmokes.push(clone);
    }
};

//  Bind an event handler to the "asteroidDestroyed" event
World.prototype.onAsteroidDestroyed = function (handler) {

    $(this).bind("asteroidDestroyed", handler);
};
