/* Helper for Copperlicht */
define(['CL3D', 'clientGame/utils/collisionHandler'], function (CL3D, collisionHandler) {

    var copper = function () {
 
    };

    copper.SMOKE_COUNT = 80;
    copper.SMOKE_RADIUS = 80;
    copper.SHOOT_LIVETIME = 5500;
    copper.PHOTON_SPEED = 5;

    copper.createClone = function(engine, getTemplateCall, position) {

        var scene = engine.getScene();
        var clone = getTemplateCall().createClone(scene.getRootSceneNode());

        clone.Pos.X = position.X;
        clone.Pos.Y = position.Y;
        clone.Pos.Z = position.Z;
        clone.Visible = true;

        // adding own methods
        clone.removeFromScene = copper.removeFromScene;

        return clone;
    };

    copper.createTextOverlay = function(engine, overlayText) {

        var scene = engine.getScene();
        var textOverlay = new CL3D.Overlay2DSceneNode(engine);

        textOverlay.setText(overlayText);
        textOverlay.setShowBackgroundColor(true, CL3D.createColor(255, 150, 232, 249));
        scene.getRootSceneNode().addChild(textOverlay);

        // adding own methods
        textOverlay.update3DPosition = copper.update3DPosition;

        return textOverlay;
    };

    // added to SceneNode
    copper.removeFromScene = function() {
        this.getParent().removeChild(this);
    };

    // added to TextOverlay
    copper.update3DPosition = function(pos3d) {

        var pos2d = this.engine.get2DPositionFrom3DPosition(pos3d);
        if (pos2d) {
            this.set2DPosition(pos2d.X, pos2d.Y, 256, 256);
        }
    };

    // the enhanced SceneNodes will be kindly asked to clean up on their own
    copper.clearSceneNodeArray = function(theArray) {

        for (var n = 0; n < theArray.length; n++) {

            var item = theArray[n];
            item.removeFromScene();
            theArray.splice(n, 1);
        }
    };

    // deletes one item from array - an clean up
    copper.removeFromSceneNodeArray = function(theArray, id) {

        for (var n = 0; n < theArray.length; n++) {

            var item = theArray[n];

            if (item.id == id) {

                item.removeFromScene();
                theArray.splice(n, 1);
                break;
            }
        }
    };

    copper.addSmoke = function(engine, getSmokeTemplateCall, center, now, smokeStorageArray) {

        for (var i = 0; i < copper.SMOKE_COUNT; ++i) {

            var position = new CL3D.Vect3d(
                center.X + (Math.random() * copper.SMOKE_RADIUS * 2) - copper.SMOKE_RADIUS,
                center.Y + (Math.random() * copper.SMOKE_RADIUS * 2) - copper.SMOKE_RADIUS,
                center.Z + (Math.random() * copper.SMOKE_RADIUS * 2) - copper.SMOKE_RADIUS);

            var clone = copper.createClone(engine, getSmokeTemplateCall, position);
            clone.gameEndLiveTime = now + (Math.random() * 2000);

            var moveDir = clone.Pos.substract(center);
            moveDir.normalize();
            clone.gameMoveDir = moveDir;

            smokeStorageArray.push(clone);
        }
    };

    copper.addShoot = function(engine, now, getPhotonTemplateCall, position, target, photonStorageArray) {

        var moveDir = target.substract(position);
        moveDir.normalize();

        var clone = copper.createClone(engine, getPhotonTemplateCall, position);
        clone.gameMoveDir = moveDir;
        clone.gameEndLiveTime = now + copper.SHOOT_LIVETIME;
        clone.sphereCollider = {};
        clone.sphereCollider.radius = 1;
        clone.OwnedMesh.MeshBuffers[0].RendererNativeArray.glow = true;

        photonStorageArray.push(clone);

        return clone;
    };

    copper.moveSmokes = function(now, timeDiff, smokeStorageArray) {

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

    copper.testOfPlayerCollision = function (player, asteroids) {
        var isColliding;
        for (var i = 0; i < asteroids.length; i++) {
            isColliding = collisionHandler.testOnMeshCollision(player._model, asteroids[i]);
            if (isColliding) {
                player.life -= 1;
                var force = player._position.substract(asteroids[i].Pos);
                force.normalize();
                force.multiplyThisWithScal(1000);
                player._position.addToThis(force);
            }
        }
        
    };

    copper.movePhotons = function(engine, now, timeDiff, photonStorageArray, asteroidsStorageArray, asteroidDestroyedCall, addSmokeCall) {

        for (var i = 0; i < photonStorageArray.length; /* no ++ here */) {

            var photon = photonStorageArray[i];
            var deletePhoton = false;

            if (photon.gameEndLiveTime < now) {

                deletePhoton = true;

            } else {

                // move
                photon.Pos.addToThis(photon.gameMoveDir.multiplyWithScal(timeDiff * copper.PHOTON_SPEED));
                photon.updateAbsolutePosition();

                // collide with all asteroids
                for (var j = 0; j < asteroidsStorageArray.length; ++j) {

                    var asteroid = asteroidsStorageArray[j];
                    if (collisionHandler.testOnSphereCollision(asteroid, photon)) {

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

    copper.loadPlayerModel = function(engine, getTemplateCall, overlayText) {

        var initalPosition = new CL3D.Vect3d(0, 0, 0);

        // create model clone
        var clone = copper.createClone(engine, getTemplateCall, initalPosition);
        //clone.Scale = new CL3D.Vect3d(5, 5, 5);

        // creat text overlay and attach it to the model clone
        var textOverlay = copper.createTextOverlay(engine, overlayText);
        textOverlay.Visible = false;
        clone.textOverlay = textOverlay;

        return clone;
    };

    // no initialization intended!
    // (the Copper object should be similar to a "static class")
    return copper;

});