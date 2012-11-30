/*
 * Base "class" for game participants to inititalize (remote players) or to inherit from (own player)
 */
define(function () {

    var PlayerBase = Class.extend({
        init: function() {

            this._position = new CL3D.Vect3d(0, 0, 0);
            this._rotation = new CL3D.Vect3d(0, 0, 0);
            this._model = null;

            // can be heavily queried
            // so here we don't use a getter to avoid performance issues

            this.id = 0;
            this.name = "error";
            this.spaceship = "humanInterceptor";
        },

        initWithValuesFromServer: function(playerFromServer) {

            this.id = playerFromServer.id;
            this.name = playerFromServer.name;
            this.spaceship = playerFromServer.spaceship;

            this.setPositionAndRotation(playerFromServer.position, playerFromServer.rotation);
        },

        setPositionAndRotation: function(position, rotation) {

            this._position.X = position.X;
            this._position.Y = position.Y;
            this._position.Z = position.Z;

            this._rotation.X = rotation.X;
            this._rotation.Y = rotation.Y;
            this._rotation.Z = rotation.Z;

            if (this._model != null) {

                this._model.Pos.X = this._position.X;
                this._model.Pos.Y = this._position.Y;
                this._model.Pos.Z = this._position.Z;

                this._model.Rot.X = this._rotation.X;
                this._model.Rot.Y = this._rotation.Y;
                this._model.Rot.Z = this._rotation.Z;

                this._model.updateAbsolutePosition();

                this._model.textOverlay.update3DPosition(this._model.Pos);
                this._model.textOverlay.updateAbsolutePosition();
            }
        },

        setModel: function(model) {
            this._model = model;
        },

        getPositionAndRotation: function() {

            return {
                position: {
                    X: this._position.X,
                    Y: this._position.Y,
                    Z: this._position.Z
                },
                rotation: {
                    X: this._rotation.X,
                    Y: this._rotation.Y,
                    Z: this._rotation.Z
                }
            };
        },

        removeFromScene: function() {

            this._model.removeFromScene();
            this._model = null;
        }
    });

    return PlayerBase;
});