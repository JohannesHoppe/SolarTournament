/*
 * Depending on the keyboard input the player will interact with the world
 */
var Player = PlayerBase.extend({

    init: function (keyboardWatcher, gameCam) {

        this._super();

        this.ROTATE_SPEED = 200.0;
        this.MAX_VERTICAL_ANGLE = 88.0;
        this.MAX_LOOK_DIFF = 300;
        this.SHOOT_DELAY = 500;

        this._keyboardWatcher = keyboardWatcher;
        this._gameCam = gameCam;
        this.resetValues();
    },

    resetValues: function () {

        this._relativeRotationX = 0;
        this._relativeRotationY = 0;

        this._verticalLookMoveSpeed = 0;
        this._horizontalLookMoveSpeed = 0;

        this._lookAtTarget = new CL3D.Vect3d(0, 0, 0);
        this._position = new CL3D.Vect3d(0, 0, 0);

        this._movementSpeed = 0;
        this._lastShootTime = 0;
    },

    setModel: function (model) {

        this._super(model);

        // Player one has an ego-camera only!
        this._model.Visible = false;
        this._model.textOverlay.Visible = false;
    },

    // called each frame
    animate: function (timeDiff) {

        this._changeLookTarget(timeDiff,
            this._keyboardWatcher.upKeyDown,
            this._keyboardWatcher.downKeyDown,
            this._keyboardWatcher.leftKeyDown,
            this._keyboardWatcher.rightKeyDown);

        this._moveForward(timeDiff, this._keyboardWatcher.thrustKeyDown);

        this._doShoot(this._keyboardWatcher.shootKeyDown);

        this._debugGame();
    },

    // changes look target (where player looks at)
    _changeLookTarget: function (timeDiff, upKeyDown, downKeyDown, leftKeyDown, rightKeyDown) {

        // accelerate/desellerate look movement
        var accelspeed = 0.10 * timeDiff;

        if (upKeyDown) { this._verticalLookMoveSpeed += accelspeed; }
        if (downKeyDown) { this._verticalLookMoveSpeed -= accelspeed; }
        if (leftKeyDown) { this._horizontalLookMoveSpeed -= accelspeed; }
        if (rightKeyDown) { this._horizontalLookMoveSpeed += accelspeed; }

        this._verticalLookMoveSpeed = GameMath.deccelerateValue(timeDiff, this._verticalLookMoveSpeed, 0.03, 20);
        this._horizontalLookMoveSpeed = GameMath.deccelerateValue(timeDiff, this._horizontalLookMoveSpeed, 0.03, 20);

        this._prepareLookAtTargetUpDown(timeDiff);    // --> _relativeRotationX
        this._prepareLookAtTargetLeftRight(timeDiff); // --> _relativeRotationY

        var newTarget = new CL3D.Vect3d(0, 0, 1);
        var transformMatrix = new CL3D.Matrix4();
        transformMatrix.setRotationDegrees(new CL3D.Vect3d(this._relativeRotationX, this._relativeRotationY, 0));
        transformMatrix.transformVect(newTarget);

        // ??
        this._lookAtTarget = this._position.add(newTarget);

        // update cam
        this._gameCam.setTarget(this._lookAtTarget);
    },

    _prepareLookAtTargetUpDown: function (timeDiff) {

        var ydiff = this._verticalLookMoveSpeed;
        var rotateSpeedFactY = 1 / 50000.0;

        if (ydiff > this.MAX_LOOK_DIFF) { ydiff = this.MAX_LOOK_DIFF; }
        if (ydiff < -this.MAX_LOOK_DIFF) { ydiff = -this.MAX_LOOK_DIFF; }

        this._relativeRotationX += ydiff * (timeDiff * (this.ROTATE_SPEED * rotateSpeedFactY));

        if (this._relativeRotationX < -this.MAX_VERTICAL_ANGLE) { this._relativeRotationX = -this.MAX_VERTICAL_ANGLE; }
        if (this._relativeRotationX > this.MAX_VERTICAL_ANGLE) { this._relativeRotationX = this.MAX_VERTICAL_ANGLE; }
    },

    _prepareLookAtTargetLeftRight: function (timeDiff) {

        var xdiff = this._horizontalLookMoveSpeed;
        var rotateSpeedFactX = 1 / 50000.0;

        if (xdiff > this.MAX_LOOK_DIFF) { xdiff = this.MAX_LOOK_DIFF; }
        if (xdiff < -this.MAX_LOOK_DIFF) { xdiff = -this.MAX_LOOK_DIFF; }

        this._relativeRotationY += xdiff * (timeDiff * (this.ROTATE_SPEED * rotateSpeedFactX));
    },

    _moveForward: function (timeDiff, thrustKeyDown) {

        var accelspeed = 0.10 * timeDiff;
        if (thrustKeyDown) { this._movementSpeed += accelspeed; }

        this._movementSpeed = GameMath.deccelerateValue(timeDiff, this._movementSpeed, 0.03, 20);
        var moveDir = this._lookAtTarget.substract(this._position).multiplyWithScal(this._movementSpeed);

        // ??
        this._position = this._position.add(moveDir);
        this._lookAtTarget = this._lookAtTarget.add(moveDir);

        // update cam
        this._gameCam.setPosition(this._position);
        this._gameCam.setTarget(this._lookAtTarget);
        this._gameCam.updateAbsolutePosition();

        // with the current implementation we never change the Z axis
        this._rotation.X = this._relativeRotationX,
        this._rotation.Y = this._relativeRotationY,
        this._rotation.Z = 0;
    },

    _doShoot: function (shootKeyDown) {

        if (!shootKeyDown) { return; }

        var now = new Date().getTime();

        if (this._lastShootTime == 0 || now - this._lastShootTime > this.SHOOT_DELAY) {

            this._lastShootTime = now;
            $(this).trigger("shootPlaced", { position: this._position, target: this._lookAtTarget });
        }
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
                    "Position Z: " + this._position.Z + "<br />" +

                    "Rotation X: " + this._rotation.X + "<br />" +
                    "Rotation Y: " + this._rotation.Y + "<br />" +
                    "Rotation Z: " + this._rotation.Z + "<br />" +

                    "Target X: " + this._lookAtTarget.X + "<br />" +
                    "Target Y: " + this._lookAtTarget.Y + "<br />" +
                    "Target Z: " + this._lookAtTarget.Z
                );
        }
    }

});