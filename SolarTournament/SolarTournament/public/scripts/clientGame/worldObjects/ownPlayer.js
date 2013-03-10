/*
* Depending on the keyboard input the player will interact with the world
*/
define(['CL3D',
        'jquery',
        'clientGame/worldObjects/PlayerBase',
        'clientGame/infrastructure/keyboardWatcher',
        'clientGame/infrastructure/sceneAttachment',
        'clientGame/cams/thirdPersonCam',
        'clientGame/utils/gameMath',
        'clientGame/infrastructure/engine',
        'clientGame/grafics/shaderManager',
        'clientGame/playerControll/shipNavigation'], function (CL3D, $, PlayerBase, keyboardWatcher, sceneAttachment, thirdPersonCam, gameMath, engine, shaderManager, shipNavigation) {

    var OwnPlayer = PlayerBase.extend({
        init: function() {
            this._super();
            this.SHOOT_DELAY = 250;
            this._keyboardWatcher = keyboardWatcher;
            this._shaderManager = shaderManager;
            this._currentCam = thirdPersonCam;
            this._rotationMatrix = new CL3D.Matrix4();
            this._driveLight = null;
            this._shipNavigation = shipNavigation;
            this.resetValues();
        },

        resetValues: function() {
            this._lastShootTime = 0;
            this._rotation = new CL3D.Vect3d(0, 0, 0);
            this._model = null;
            this._cameraPosition = new CL3D.Vect3d(-10, 8, 0);
            this._position = new CL3D.Vect3d(0, 0, 0);

            this._orientationForward = new CL3D.Vect3d(0, 0, 1);
            this._orientationRight = new CL3D.Vect3d(1, 0, 0);
            this._orientationUp = new CL3D.Vect3d(0, 1, 0);
            this._shipNavigation.reset();
            this.isColliding = false;
            this.life = 100;


            this.firstPersonModeActivated = false;
        },

        setModel: function(model) {
            this._super(model);

            this.shaderId = shaderManager.drawWithPhongShader(this._model);
            this._driveLight = sceneAttachment.addShipDriveLight();
            this._driveLight.radius = 700;
            this._driveLight.fullRadius = 700;
            this._driveLight.radiusChangeSpeed = 14;
            this._model.addChild(this._driveLight);
            this._model.sphereCollider = {};
            this._model.sphereCollider.radius = 500;
         },

         _updateModelPosition: function() {

            if (this._model) {
                this._model.Pos.X = this._position.X;
                this._model.Pos.Y = this._position.Y;
                this._model.Pos.Z = this._position.Z;
                this._model.Children[0].Pos.X = this._position.X;
                this._model.Children[0].Pos.Y = this._position.Y;
                this._model.Children[0].Pos.Z = this._position.Z;
                this._model.Children[0].Rot = this._rotation;
                this._model.Rot = this._rotation;
            }
        },

        // called each frame
        animate: function(timeDiff) {
            this._move(timeDiff);
            this._updateModelPosition();
            this._debugGame();
        },

        _move: function(timeDiff) {
            this._navigateShip(timeDiff);
            this._updateCamera();
            this._shoot();
            
        },

        _shoot: function() {
            if (this._keyboardWatcher.shootKeyDown) {
                var now = new Date().getTime();

                if (this._lastShootTime === 0 || now - this._lastShootTime > this.SHOOT_DELAY) {

                    this._lastShootTime = now;
                    var shootDirection = new CL3D.Vect3d(0, 0, 0);
                    shootDirection.setTo(this._position);
                    shootDirection.addToThis(this._orientationForward);
                    $(this).trigger("shootPlaced", { position: this._position, target: shootDirection });
                }
            }
        },

        _navigateShip: function (timeDiff) {
            this._rotation = this._shipNavigation.getRotation(timeDiff, this._keyboardWatcher);
            this._orientationForward = this._shipNavigation.calculateOrientationForward();
            this._orientationRight = this._shipNavigation.calculateOrientationRight();
            this._orientationUp = this._shipNavigation.calculateOrientationUp();
            this._position = this._shipNavigation.fly(timeDiff, this._position, this._keyboardWatcher, this._orientationForward, this._model, this._driveLight);
        },

        _updateCamera: function() {
            if (this._keyboardWatcher.firstPersonKeyDown) {
                this.firstPersonModeActivated = true;
            }
            else if (this._keyboardWatcher.thirdPersonKeyDown) {
                this.firstPersonModeActivated = false;
            }

            this._currentCam.followObject(this._position, this._orientationUp, this._orientationForward, this.firstPersonModeActivated);
        },

        // Bind an event handler to the "shootPlaced" event
        onShootPlaced: function(handler) {

            $(this).bind("shootPlaced", handler);
        },

        _debugGame: function() {
            window._debugGame = true;
            if (window.debugGame) {
                $('#debugPlayer').html(
                    "player life: " + this.life + "<br />"
                );
            }
        }
    });

    return new OwnPlayer();
});
