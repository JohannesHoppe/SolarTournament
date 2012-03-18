/* 
 * A camera for the main menu, rotating slowly through the scene
 */
var MainMenuCam = function () {

    this._cam = new CL3D.CameraSceneNode();
    this._cam.setTarget(new CL3D.Vect3d(1, 1, 1));
    this._cam.Pos.set(0, 0, 0);    

    // record game starting time for deterministic rotation
    this._appStartTime = new Date().getTime();
};

// goes on with the rotation
MainMenuCam.prototype.update = function() {

    var now = new Date().getTime() - this._appStartTime;
    var t = (now + 5000) / 10000;
    this._cam.setTarget(new CL3D.Vect3d(Math.cos(t), 0, Math.sin(t)));
};

MainMenuCam.prototype.setActive = function (engine) {

    var scene = engine.getScene();
    if (!scene) {
        throw "NO_SCENE in setActive";
    }

    scene.getRootSceneNode().addChild(this._cam);
    scene.setActiveCamera(this._cam);
};