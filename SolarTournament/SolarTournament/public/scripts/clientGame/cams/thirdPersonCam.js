/* 
 * A cam that will have the same position and look target as the player (ego-view)
 */
var ThirdPersonCam = function () {

    this._cam = null;
    this._objectToFollow = null;
};

ThirdPersonCam.prototype.setActive = function (engine) {

    var scene = engine.getScene();
    if (!scene) {
        throw "NO_SCENE in setActive";
    }

    this._cam = scene.getSceneNodeFromName('thirdPersonCamera');
    this._cam.getAnimators()[0].NodeToFollow = this._objectToFollow;

    //scene.getRootSceneNode().addChild(this._cam);
    scene.setActiveCamera(this._cam);
};

ThirdPersonCam.prototype.setObjectToFollow = function (model) {
    this._objectToFollow = model;
};



