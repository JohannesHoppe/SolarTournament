define(['clientGame/infrastructure/engine'], function (engine) {
    var sceneAttachment = function () {
        this._engine = engine;
    };

    sceneAttachment.addToProto({
        
        addLightToScene : function () {
            var lightnode = new CL3D.LightSceneNode();
            var scene = this._engine.getScene();
            lightnode.Name = "mainLight";
            lightnode.LightData.Radius = 100000;
            lightnode.LightData.Attenuation = 1;
            lightnode.LightData.Color.R = 1;
            lightnode.LightData.Color.G = 1;
            lightnode.LightData.Color.B = 1;
            lightnode.Pos.X = 0;
            lightnode.Pos.Y = 2;
            lightnode.Pos.Z = 100000;


            this._engine.getScene().getRootSceneNode().addChild(lightnode);

            scene.AmbientLight = new CL3D.ColorF();
            scene.AmbientLight.R = 0.4;
            scene.AmbientLight.G = 0.4;
            scene.AmbientLight.B = 0.4;
        },

        addShipDriveLight: function () {
            var lightnode = new CL3D.LightSceneNode();

            lightnode.Name = "driveLight";
            lightnode.LightData.Radius = 0;
            lightnode.LightData.Attenuation = 1;
            lightnode.LightData.Color.R = 2;
            lightnode.LightData.Color.G = 2;
            lightnode.LightData.Color.B = 2;
            lightnode.Pos.X = 0;
            lightnode.Pos.Y = 0;
            lightnode.Pos.Z = -60;
 
            return lightnode;
        }
    });

    return new sceneAttachment();
})