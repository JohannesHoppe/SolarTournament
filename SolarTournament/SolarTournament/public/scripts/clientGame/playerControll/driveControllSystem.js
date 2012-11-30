define(['clientGame/utils/gameMath'], function (gameMath) {
    var driveControllSystem = function () {
        this.drive = null;
        this._driveGlowEffectLeft = null;
        this._driveGlowEffectRight = null;
        this._driveGlowEffectTop = null;
    };

    driveControllSystem.addToProto({
        initializeShipDriveFire: function (model) {
            if (model) {
                if (model.getChildren()[1]) {
                    this._drive = model.getChildren()[1];
                    this._drive.maxBoostPower = -56;
                    this._drive.minBoostPower = -40;
                    this._drive.boostChangeSpeed = 0.5;

                    if (model.getChildren()[2]) {
                        this._driveGlowEffectLeft = model.getChildren()[2];
                        this._driveGlowEffectLeft.maxScale = 3.5;
                        this._driveGlowEffectLeft.changeScale = 0.1;
                        this._driveGlowEffectRight = model.getChildren()[3];
                    }
                    if (model.getChildren()[4]) {
                        this._driveGlowEffectTop = model.getChildren()[4];
                    }
                }
            }
        },

        calculateDriveOn: function (driveLight) {
            if (this._drive) {
                if (this._drive.Pos.Z > this._drive.maxBoostPower) {
                    this._drive.Pos.Z -= this._drive.boostChangeSpeed;
                }
                if (driveLight.radius < driveLight.fullRadius) {
                    driveLight.radius += driveLight.radiusChangeSpeed;
                }
                if (this._driveGlowEffectLeft.Scale.X < this._driveGlowEffectLeft.maxScale) {
                    this._driveGlowEffectLeft.Scale.X += this._driveGlowEffectLeft.changeScale;
                    this._driveGlowEffectLeft.Scale.Y += this._driveGlowEffectLeft.changeScale;
                    this._driveGlowEffectRight.Scale.X += this._driveGlowEffectLeft.changeScale;
                    this._driveGlowEffectRight.Scale.Y += this._driveGlowEffectLeft.changeScale;

                    if (this._driveGlowEffectTop) {
                        this._driveGlowEffectTop.Scale.X += this._driveGlowEffectLeft.changeScale;
                        this._driveGlowEffectTop.Scale.Y += this._driveGlowEffectLeft.changeScale;
                    }
                }
            }
        },

        calculateDriveOff: function (driveLight) {
            if (this._drive) {
                if (this._drive.Pos.Z < this._drive.minBoostPower) {
                    this._drive.Pos.Z += this._drive.boostChangeSpeed;
                }
                if (driveLight.radius > 0) {
                    driveLight.radius -= driveLight.radiusChangeSpeed;
                }
                if (this._driveGlowEffectLeft.Scale.X > 0) {
                    this._driveGlowEffectLeft.Scale.X -= this._driveGlowEffectLeft.changeScale;
                    this._driveGlowEffectLeft.Scale.Y -= this._driveGlowEffectLeft.changeScale;
                    this._driveGlowEffectRight.Scale.X -= this._driveGlowEffectLeft.changeScale;
                    this._driveGlowEffectRight.Scale.Y -= this._driveGlowEffectLeft.changeScale;

                    if (this._driveGlowEffectTop) {
                        this._driveGlowEffectTop.Scale.X -= this._driveGlowEffectLeft.changeScale;
                        this._driveGlowEffectTop.Scale.Y -= this._driveGlowEffectLeft.changeScale;
                    }
                }
            }
        },
    });
    
    return new driveControllSystem();
});