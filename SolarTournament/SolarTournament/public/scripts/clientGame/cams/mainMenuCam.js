/* 
 * A fixed camera for the main menu, rotating slowly around the scene
 */
define(['CL3D'], function (CL3D) {

    var cam = new CL3D.CameraSceneNode();
    cam.setTarget(new CL3D.Vect3d(1, 1, 1));
    cam.Pos.set(0, 0, 0);

    // record game starting time for deterministic rotation
    var appStartTime = new Date().getTime();

    // goes on with the rotation
    var update = function() {

        var now = new Date().getTime() - appStartTime;
        var t = (now + 5000) / 10000;
        cam.setTarget(new CL3D.Vect3d(Math.cos(t), 0, Math.sin(t)));
    };

    var setActive = function(engine) {

        var scene = engine.getScene();
        scene.getRootSceneNode().addChild(cam);
        scene.setActiveCamera(cam);
    };

    return {
        update: update,
        setActive: setActive
    };
});