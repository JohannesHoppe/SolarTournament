define(['CL3D', 'clientGame/infrastructure/engine'], function (CL3D,engine) {

    var ThirdPersonCam = function() {
        this._cam = null;
        this._crosshair = null;
        this._engine = engine;
    };

    ThirdPersonCam.prototype.setActive = function(engine) {

        var scene = engine.getScene();
        if (!scene) {
            throw "NO_SCENE in setActive";
        }

        this._cam = scene.getSceneNodeFromName('thirdPersonCamera');
        this._crosshair = scene.getSceneNodeFromName('crosshair');

        this._cam.setFarValue(200000);

        //scene.getRootSceneNode().addChild(this._cam);
        scene.setActiveCamera(this._cam);
    };

    ThirdPersonCam.prototype.followObject = function(objectPosition, orientationUp, orientationForward, firstPersonCamera) {
       this._cam.setUpVector(orientationUp);

       if (!firstPersonCamera) {
           this._crosshair.set2DPosition(295, 230, 50, 30);
            var newPosition = new CL3D.Vect3d(0, 0, 0);
            newPosition.setTo(objectPosition);

            var setOffsetUp = new CL3D.Vect3d(0, 0, 0);
            setOffsetUp.addToThis(orientationUp);
            setOffsetUp.multiplyThisWithScal(300);

            var setOffsetBack = new CL3D.Vect3d(0, 0, 0);
            setOffsetBack.addToThis(orientationForward);
            setOffsetBack.multiplyThisWithScal(-800);

            newPosition.addToThis(setOffsetBack);
            newPosition.addToThis(setOffsetUp);
            this._cam.Pos.setTo(newPosition);
        } else {
            this._crosshair.set2DPosition(295, 225, 50, 30);
            this._cam.Pos.setTo(objectPosition);
        }

       this.LookAt(objectPosition, orientationForward);

       /*var projectionMatrix = this._engine.getRenderer().Projection;
       var testVect = projectionMatrix.getTranslatedVect(objectPosition);
       this._crosshair.set2DPosition(testVect.X, testVect.Y, 50, 30);     */

    };

    ThirdPersonCam.prototype.LookAt = function(objectPosition, orientationForward) {
        var cameraLookAt = new CL3D.Vect3d(0, 0, 0);
        cameraLookAt.addToThis(objectPosition);
        var forwardOffset = new CL3D.Vect3d(0, 0, 0);
        forwardOffset.addToThis(orientationForward.getNormalized());
        forwardOffset.multiplyThisWithScal(1000000);
        cameraLookAt.addToThis(forwardOffset);
        this._cam.setTarget(cameraLookAt);
    };

    return new ThirdPersonCam();
});
