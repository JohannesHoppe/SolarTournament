/*
* Depending on the keyboard input the player will interact with the world
*/
var PlayerTwo = PlayerBase.extend({

    init: function (keyboardWatcher, currentCam) {

        this._super();

        this.ROTATE_SPEED = 200.0;
        this.moveSpeed = 0.1;

        this._keyboardWatcher = keyboardWatcher;
        this._currentCam = currentCam;
        this._orientation = new CL3D.Quaternion(0, 0, 0, 0);
        this._orientation.W = 1;
        this._rotationMatrix = new CL3D.Matrix4();
        this.resetValues();
    },

    _createLocalRotation: function (rotateAxis) {

        this._orientation.normalize();
        var localRotation = new CL3D.Quaternion(0, 0, 0, 0);
        var angle = 0.01;

        rotateAxis.normalize();

        //calculate local rotation
        localRotation.W = Math.cos(angle / 2);
        localRotation.X = rotateAxis.X * Math.sin(angle / 2);
        localRotation.Y = rotateAxis.Y * Math.sin(angle / 2);
        localRotation.Z = rotateAxis.Z * Math.sin(angle / 2);
        localRotation.normalize();
        this._orientation = GameMath.quaterionMultiplication(localRotation, this._orientation);
        //this._orientation.normalize();
        this._rotationMatrix = this._orientation.getMatrix();
        this._rotationMatrix = GameMath.getRotationMatrix(this._orientation);
    },

    resetValues: function () {

        this._movementSpeed = 0;
        this._lastShootTime = 0;

        this._model = null;
        this._cameraPosition = new CL3D.Vect3d(-10, 8, 0);

        this._orientationForward = new CL3D.Vect3d(1, 0, 0);
        this._orientationUp = new CL3D.Vect3d(0, 1, 0);
        this._orientationRight = new CL3D.Vect3d(0, 0, 1);
        this._position = new CL3D.Vect3d(0, 0, 0);
    },

    setModel: function (model) {

        this._super(model);

        if (typeof this._currentCam.setObjectToFollow == 'function') {
            this._currentCam.setObjectToFollow(this._model);
        }
    },

    _updateModelPosition: function () {
        this._model.Pos.X = this._position.X;
        this._model.Pos.Y = this._position.Y;
        this._model.Pos.Z = this._position.Z;
    },

    // called each frame
    animate: function (timeDiff) {

        this._move(timeDiff);
        this._updateModelPosition();
        this._debugGame();

    },

    _move: function (timeDiff) {

        this._moveForward(timeDiff);
        //this._updateCamera();
    },

    _moveForward: function (timeDiff) {

        if (this._keyboardWatcher.thrustKeyDown) {
            this._position.addToThis(this._orientationForward.getNormalized().multiplyWithScal(timeDiff).multiplyWithScal(this.moveSpeed));
            this._orientationForward = this._position.add(this._orientationForward);
        }

        if (this._keyboardWatcher.upKeyDown) {
            this._createLocalRotation(this._orientationRight);
            this._model.Rot = this._rotationMatrix.getRotationDegrees();
        }

        if (this._keyboardWatcher.rightKeyDown) {
            this._model.Rot.X += 10;
        }
    },

    _updateCamera: function () {
        // this._currentCam.setPosition(this._cameraPosition);
        this._currentCam.setTarget(this._orientationForward);
        this._currentCam.updateAbsolutePosition();
        this._currentCam.setTarget(this._orientationForward);
    },

    // Bind an event handler to the "shootPlaced" event
    onShootPlaced: function (handler) {

        $(this).bind("shootPlaced", handler);
    },

    _debugGame: function () {
        if (window.debugGame) {
            $('#debugPlayer').html(
                    "Position X: " + this._position.X + "<br />" +
                    "Position Y: " + this._position.Y + "<br />" +
                    "Position Z: " + this._position.Z
                );
        }
    }
});
