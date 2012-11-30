define(['clientGame/utils/gameMath'], function (gameMath) {
    var stabilizationSystem = function () {
        this._currentTiltDegreeToRight = 0;
        this._currentTiltDegreeToUp = 0;
        this.maxTiltDegree = 10;
        this.visualOrientation = new CL3D.Quaternion(0, 0, 0, 1);
    };

    stabilizationSystem.addToProto({
        holdStabilizOrientation: function (keyBoardWatcher, timeDiff, movementOrientation) {
            this._calculateTiltDegree(keyBoardWatcher);
            return this._fadeBackToHorizontalOrientation(keyBoardWatcher, timeDiff, movementOrientation);
        },

        _calculateTiltDegree: function (keyBoardWathcher) {
            this._currentTiltDegreeToRight = this._increaseTiltDegree(keyBoardWathcher.rightKeyDown, keyBoardWathcher.leftKeyDown, this._currentTiltDegreeToRight);
            this._currentTiltDegreeToUp = this._increaseTiltDegree(keyBoardWathcher.upKeyDown, keyBoardWathcher.downKeyDown, this._currentTiltDegreeToUp);
            this._currentTiltDegreeToRight = this._decreaseTiltDegree(keyBoardWathcher.leftKeyDown, keyBoardWathcher.rightKeyDown, this._currentTiltDegreeToRight);
            this._currentTiltDegreeToUp = this._decreaseTiltDegree(keyBoardWathcher.downKeyDown, keyBoardWathcher.upKeyDown, this._currentTiltDegreeToUp);
        },

        _increaseTiltDegree: function (isKeyDown, isoppositeKeyDown, currentDegree){
            if (isKeyDown && !isoppositeKeyDown) {
                if (currentDegree < this.maxTiltDegree) {
                    currentDegree++;
                }
            }
            return currentDegree;
        },

        _decreaseTiltDegree: function (isKeyDown, isoppositeKeyDown, currentDegree) {
            if (isKeyDown && !isoppositeKeyDown) {
                if (currentDegree > -this.maxTiltDegree) {
                    currentDegree--;
                }
            }
            return currentDegree;
        },

        _fadeBackToHorizontalOrientation: function (keyBoardWathcher, timeDiff, movementOrientation) {

            if (!keyBoardWathcher.upKeyDown && !keyBoardWathcher.downKeyDown || keyBoardWathcher.upKeyDown && keyBoardWathcher.downKeyDown) {
                this._currentTiltDegreeToUp = this._fadeBackTiltDegree(this._currentTiltDegreeToUp);
                this._lastModelOrientationFixes(false, true, timeDiff);
            }
            if (!keyBoardWathcher.rightKeyDown && !keyBoardWathcher.leftKeyDown || keyBoardWathcher.rightKeyDown && keyBoardWathcher.leftKeyDown) {
                this._currentTiltDegreeToRight = this._fadeBackTiltDegree(this._currentTiltDegreeToRight);
                this._lastModelOrientationFixes(true, false, timeDiff);
            }
            if (this._currentTiltDegreeToRight == 0 && this._currentTiltDegreeToUp == 0) {
                this._lastModelOrientationFixes(true, true, timeDiff);
            }

            var shipOrientationAfterRotation = gameMath.quaternionMultiplication(this.visualOrientation, movementOrientation);
            var rotationMatrix = shipOrientationAfterRotation.getMatrix()
            return rotationMatrix.getRotationDegrees();
        },

        _fadeBackTiltDegree: function (currentTiltDegree) {
            if (currentTiltDegree > 0) {
                currentTiltDegree--;
            }
            else if (currentTiltDegree < 0) {
                currentTiltDegree++;
            }
            return currentTiltDegree;
        },

        _lastModelOrientationFixes: function (horizontal, vertical, timeDiff) {
            var fadeBackQuaternion = new CL3D.Quaternion(0, 0, 0, 1);
            var timeScale = 0.004 * timeDiff;

            fadeBackQuaternion = gameMath.quaternionSubtract(fadeBackQuaternion, this.visualOrientation);
            fadeBackQuaternion = gameMath.quaternionMultiplicationWithScale(fadeBackQuaternion, timeScale);
            this._fadeBackToOriginalVisualOrientation(fadeBackQuaternion, horizontal, vertical);

            this.visualOrientation.normalize();
        },

        _fadeBackToOriginalVisualOrientation: function (fadeBackQuaternion, horizontal, vertical) {
            if (horizontal && vertical) {
                this.visualOrientation.addToThis(fadeBackQuaternion);
            }
            else if (vertical) {
                this.visualOrientation.X += fadeBackQuaternion.X;
                this.visualOrientation.Y += fadeBackQuaternion.Y;
            }
            else if (horizontal) {
                this.visualOrientation.Y += fadeBackQuaternion.Y;
                this.visualOrientation.Z += fadeBackQuaternion.Z;
            }
        },
    });
    
    return new stabilizationSystem();
});