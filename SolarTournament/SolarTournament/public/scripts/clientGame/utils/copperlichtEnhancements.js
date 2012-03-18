/* Helper for Copperlicht */
var Copper = function () { };

Copper.SMOKE_COUNT = 40;
Copper.SMOKE_RADIUS = 40;
Copper.SHOOT_LIVETIME = 2500;
Copper.COLLISION_DISTANCE = 60;
Copper.PHOTON_SPEED = 0.8;

Copper.createClone = function (engine, getTemplateCall, position) {

    var scene = engine.getScene();
    var clone = getTemplateCall().createClone(scene.getRootSceneNode());

    clone.Pos.X = position.X;
    clone.Pos.Y = position.Y;
    clone.Pos.Z = position.Z;
    clone.Visible = true;

    // adding own methods
    clone.removeFromScene = Copper.removeFromScene;
    clone.isCollidingWith = Copper.isCollidingWith;

    return clone;
};

Copper.createTextOverlay = function (engine, overlayText) {

    var scene = engine.getScene();
    var textOverlay = new CL3D.Overlay2DSceneNode(engine);

    textOverlay.setText(overlayText);
    textOverlay.setShowBackgroundColor(true, CL3D.createColor(255, 150, 232, 249));
    scene.getRootSceneNode().addChild(textOverlay);

    // adding own methods
    textOverlay.update3DPosition = Copper.update3DPosition;

    return textOverlay;
};

// added to SceneNode
Copper.removeFromScene = function () {
    this.getParent().removeChild(this);
};

// added to SceneNode
Copper.isCollidingWith = function (otherSceneNode, collisionDistance) {
    return this.Pos.getDistanceTo(otherSceneNode.Pos) < collisionDistance;
};

// added to TextOverlay
Copper.update3DPosition = function (pos3d) {

    var pos2d = this.engine.get2DPositionFrom3DPosition(pos3d);
    if (pos2d != null) {
        this.set2DPosition(pos2d.X, pos2d.Y, 256, 256);
    }
};

// the enhanced SceneNodes will be kindly asked to clean up on their own
Copper.clearSceneNodeArray = function (theArray) {

    for (var n = 0; n < theArray.length; n++) {

        var item = theArray[n];
        item.removeFromScene();
        theArray.splice(n, 1);
    }
};

// deletes one item from array - an clean up
Copper.removeFromSceneNodeArray = function (theArray, id) {

    for (var n = 0; n < theArray.length; n++) {

        var item = theArray[n];

        if (item.id == id) {

            item.removeFromScene();
            theArray.splice(n, 1);
            break;
        } 
    }
};

Copper.addSmoke = function(engine, getSmokeTemplateCall, center, now, smokeStorageArray) {

    for (var i = 0; i < Copper.SMOKE_COUNT; ++i) {

        var position = new CL3D.Vect3d(
            center.X + (Math.random() * Copper.SMOKE_RADIUS * 2) - Copper.SMOKE_RADIUS,
            center.Y + (Math.random() * Copper.SMOKE_RADIUS * 2) - Copper.SMOKE_RADIUS,
            center.Z + (Math.random() * Copper.SMOKE_RADIUS * 2) - Copper.SMOKE_RADIUS);

        var clone = Copper.createClone(engine, getSmokeTemplateCall, position);
        clone.gameEndLiveTime = now + (Math.random() * 2000);

        var moveDir = clone.Pos.substract(center);
        moveDir.normalize();
        clone.gameMoveDir = moveDir;

        smokeStorageArray.push(clone);
    }
};

Copper.addShoot = function (engine, now, getPhotonTemplateCall, position, target, photonStorageArray) {

    var moveDir = target.substract(position);
    moveDir.normalize();

    var clone = Copper.createClone(engine, getPhotonTemplateCall, position);
    clone.gameMoveDir = moveDir;
    clone.gameEndLiveTime = now + Copper.SHOOT_LIVETIME;

    photonStorageArray.push(clone);

    return clone;
};

Copper.moveSmokes = function (now, timeDiff, smokeStorageArray) {

    for (var k = 0; k < smokeStorageArray.length; /* no ++ here */) {

        var smoke = smokeStorageArray[k];

        if (smoke.gameEndLiveTime < now) {

            smoke.removeFromScene();
            smokeStorageArray.splice(k, 1);

        } else {

            smoke.Pos.addToThis(smoke.gameMoveDir.multiplyWithScal(timeDiff * 0.1));
            smoke.updateAbsolutePosition();

            // to next smoke!
            ++k;
        }
    }
};

Copper.movePhotons = function (now, timeDiff, photonStorageArray, asteroidsStorageArray, asteroidDestroyedCall, addSmokeCall) {

    for (var i = 0; i < photonStorageArray.length; /* no ++ here */) {

        var photon = photonStorageArray[i];
        var deletePhoton = false;

        if (photon.gameEndLiveTime < now) {

            deletePhoton = true;

        } else {

            // move
            photon.Pos.addToThis(photon.gameMoveDir.multiplyWithScal(timeDiff * Copper.PHOTON_SPEED));
            photon.updateAbsolutePosition();

            // collide with all asteroids
            for (var j = 0; j < asteroidsStorageArray.length; ++j) {

                var asteroid = asteroidsStorageArray[j];
                if (asteroid.isCollidingWith(photon, Copper.COLLISION_DISTANCE)) {

                    asteroid.removeFromScene();
                    asteroidsStorageArray.splice(j, 1);
                    deletePhoton = true;

                    asteroidDestroyedCall(photon.playerId);
                    addSmokeCall(asteroid.Pos);

                    break;
                }
            }
        }

        if (deletePhoton) {

            // delete photon
            photon.removeFromScene();
            photonStorageArray.splice(i, 1);

        } else {

            // to next photon!
            ++i;
        }
    }
};

Copper.loadPlayerModel = function (engine, getTemplateCall, overlayText) {

    var initalPosition = new CL3D.Vect3d(0, 0, 0);

    // create model clone
    var clone = Copper.createClone(engine, getTemplateCall, initalPosition);
    clone.Scale = new CL3D.Vect3d(5, 5, 5);

    // creat text overlay and attach it to the model clone
    var textOverlay = Copper.createTextOverlay(engine, overlayText);
    textOverlay.Visible = false;
    clone.textOverlay = textOverlay;

    return clone;
}