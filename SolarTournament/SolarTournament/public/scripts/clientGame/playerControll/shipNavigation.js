define(['clientGame/utils/gameMath',
        'clientGame/playerControll/stabilizationSystem',
        'clientGame/playerControll/driveControllSystem'], function (gameMath, stabilizationSystem, driveControllSystem) {
    var shipNavigation = function () {
        this._moveSpeed = 1;
        this._rotation = new CL3D.Vect3d(0, 0, 0);
        this._toTheBottom = new CL3D.Vect3d(-1, 0, 0);
        this._toTheTop = new CL3D.Vect3d(1, 0, 0);
        this._toTheLeftSide = new CL3D.Vect3d(0, 0, -1);
        this._toTheRightSide = new CL3D.Vect3d(0, 0, 1);
        this._strafeToTheRightSide = new CL3D.Vect3d(0, -1, 0);
        this._strafeToTheLeftSide = new CL3D.Vect3d(0, 1, 0);
        this._rotationMatrix = new CL3D.Matrix4();
        this._strafeAngle = 0.02;
        this._navigationAngle = 0.00125;
        this._stabilizationSystem = stabilizationSystem;
        this._movementOrientation = new CL3D.Quaternion(0, 0, 0, 1);
        this._lastOrientationFixSpeed = 0.02;
        this._driveControllSystem = driveControllSystem;
        
    };

    shipNavigation.addToProto({
        reset: function(){
            this._movementOrientation = new CL3D.Quaternion(0, 0, 0, 1);
            this._stabilizationSystem.visualOrientation = new CL3D.Quaternion(0, 0, 0, 1);
        },

        getRotation: function (timeDiff, keyBoardWathcher) {
            this._rotateShip(timeDiff, keyBoardWathcher.upKeyDown, this._toTheBottom, this._stabilizationSystem._currentTiltDegreeToUp, this._toTheBottom);
            this._rotateShip(timeDiff, keyBoardWathcher.downKeyDown, this._toTheTop, this._stabilizationSystem._currentTiltDegreeToUp, this._toTheTop);
            this._rotateShip(timeDiff, keyBoardWathcher.rightKeyDown, this._toTheRightSide, this._stabilizationSystem._currentTiltDegreeToRight, this._strafeToTheRightSide);
            this._rotateShip(timeDiff, keyBoardWathcher.leftKeyDown, this._toTheLeftSide, this._stabilizationSystem._currentTiltDegreeToRight, this._strafeToTheLeftSide);
            this._rotation = this._stabilizationSystem.holdStabilizOrientation(keyBoardWathcher, timeDiff, this._movementOrientation);

            return this._rotation;
        },

        fly: function (timeDiff, position, keyboardWatcher, forward, model, driveLight) {
            if (!this._driveControllSystem.drive) {
                this._driveControllSystem.initializeShipDriveFire(model);
            }
            if (!keyboardWatcher.thrustKeyDown) {
                this._flyForward(position, forward, timeDiff);
                this._driveControllSystem.calculateDriveOn(driveLight);
            }
            else {
                this._driveControllSystem.calculateDriveOff(driveLight);
            }
            return position;
        },

        calculateOrientationRight: function () {
            var right = new CL3D.Vect3d(0, 0, 0);
            var rotMat = this._movementOrientation.getMatrix();
            right.X = rotMat.m00;
            right.Y = rotMat.m01;
            right.Z = rotMat.m02;
            return right;
        },

        calculateOrientationUp: function () {
            var up = new CL3D.Vect3d(0, 0, 0);
            var rotMat = this._movementOrientation.getMatrix();
            up.X = rotMat.m04;
            up.Y = rotMat.m05;
            up.Z = rotMat.m06;
            return up;
        },

        calculateOrientationForward: function () {
            var forward = new CL3D.Vect3d(0, 0, 0);
            var rotMat = this._movementOrientation.getMatrix();
            forward.X = rotMat.m08;
            forward.Y = rotMat.m09;
            forward.Z = rotMat.m10;
            return forward;
        },
        
        _rotateShip: function (timeDiff, isKeyDown, rotationAxis, currentTiltDegree, secondControlRotationAxis) {
            if (isKeyDown) {
                if (currentTiltDegree < this._stabilizationSystem.maxTiltDegree && currentTiltDegree > -this._stabilizationSystem.maxTiltDegree) {
                    this._stabilizationSystem.visualOrientation = gameMath.getLocalRotationQuanterion(rotationAxis, this._navigationAngle, this._stabilizationSystem.visualOrientation, timeDiff);
                }
                this._movementOrientation = gameMath.getLocalRotationQuanterion(secondControlRotationAxis, this._navigationAngle, this._movementOrientation, timeDiff);
            }
        },

        _flyForward: function (position, forward, timeDiff) {
            position.addToThis(forward.getNormalized().multiplyWithScal(timeDiff).multiplyWithScal(this._moveSpeed));
        },

        
    });
    
    return new shipNavigation();
});