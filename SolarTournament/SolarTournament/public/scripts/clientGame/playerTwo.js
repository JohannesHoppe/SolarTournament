/*
* Depending on the keyboard input the player will interact with the world
*/
var PlayerTwo = function (keyboardWatcher, currentCam) {

    this.ROTATE_SPEED = 200.0;
    this.moveSpeed = 0.1;

    this._keyboardWatcher = keyboardWatcher;
    this._currentCam = currentCam;
    this.resetValues();
};


PlayerTwo.prototype.resetValues = function () {

    this._relativeRotationX = 0;
    this._relativeRotationY = 0;

    this._verticalLookMoveSpeed = 0;
    this._horizontalLookMoveSpeed = 0;

    this._movementSpeed = 0;
    this._lastShootTime = 0;

    this._model = null;

    this._cameraPosition = new CL3D.Vect3d(-10, 8, 0);

    this._orientationForward = new CL3D.Vect3d(1, 0, 0);
    this._orientationUp = new CL3D.Vect3d(0, 1, 0);
    this._orientationRight = new CL3D.Vect3d(0, 0, 1);
    this._position = new CL3D.Vect3d(0, 0, 0);
};

PlayerTwo.prototype.setModel = function (model) {
    this._model = model;

    if (typeof this._currentCam.setObjectToFollow == 'function') {
        this._currentCam.setObjectToFollow(this._model);
    }
};
    
PlayerTwo.prototype._updateModelPosition = function () {
    this._model.Pos.X = this._position.X;
    this._model.Pos.Y = this._position.Y;
    this._model.Pos.Z = this._position.Z;
};

// called each frame
PlayerTwo.prototype.animate = function (timeDiff) {
    this._move(timeDiff);
    this._updateModelPosition();
    this._debugGame();
};

PlayerTwo.prototype._move = function (timeDiff) {
    this._moveForward(timeDiff);
    //this._updateCamera();
};

PlayerTwo.prototype._moveForward = function (timeDiff) {
    if (this._keyboardWatcher.thrustKeyDown) {
        this._position.addToThis(this._orientationForward.getNormalized().multiplyWithScal(timeDiff).multiplyWithScal(this.moveSpeed));
        this._orientationForward = this._position.add(this._orientationForward);
    }

    if (this._keyboardWatcher.upKeyDown) {
        this._model.Rot.X += 10;
    }

    if (this._keyboardWatcher.rightKeyDown) {
        this._model.Rot.Y += 10;
    }
};

PlayerTwo.prototype._updateCamera = function () {
   // this._currentCam.setPosition(this._cameraPosition);
    this._currentCam.setTarget(this._orientationForward);
    this._currentCam.updateAbsolutePosition();
    this._currentCam.setTarget(this._orientationForward);
};

//  Bind an event handler to the "shootPlaced" event
PlayerTwo.prototype.onShootPlaced = function (handler) {

    $(this).bind("shootPlaced", handler);
};

PlayerTwo.prototype._debugGame = function () {
    if (window.debugGame) {
        $('#debugPlayer').html(

                "Position X: " + this._position.X + "<br />" +
                "Position Y: " + this._position.Y + "<br />" +
                "Position Z: " + this._position.Z 
            );
    }
};
