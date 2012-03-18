/* 
 * A cam that will have the same position and look target as the player (ego-view)
 */
var GameCam = function() {

    this._cam = new CL3D.CameraSceneNode();
    this._cam.setTarget(new CL3D.Vect3d(1, 1, 1));
    this._cam.Pos.set(0, 0, 0);
};

GameCam.prototype.setActive = function (engine) {

    var scene = engine.getScene();
    if (!scene) {
        throw "NO_SCENE in setActive";
    }

    scene.getRootSceneNode().addChild(this._cam);
    scene.setActiveCamera(this._cam);
};

GameCam.prototype.setTarget = function(target) {
    this._cam.setTarget(target);
};

GameCam.prototype.setPosition = function (position) {
    this._cam.Pos = position;
};

GameCam.prototype.updateAbsolutePosition = function () {
    this._cam.updateAbsolutePosition();
};



