var KeyboardWatcher = function () {

    this.leftKeyDown = false;
    this.rightKeyDown = false;
    this.upKeyDown = false;
    this.downKeyDown = false;
    this.shootKeyDown = false;
    this.thrustKeyDown = false;

    $(document).keydown((this._handleKeyDown).bind(this));
    $(document).keyup((this._handleKeyUp).bind(this));
};

KeyboardWatcher.addToProto({

    _handleKeyDown: function(event) {
        this._setKeyBool(true, event.which);
    },

    _handleKeyUp: function(event) {
        this._setKeyBool(false, event.which);
    },

    _setKeyBool: function (down, code) {

        // 37 = left arrow key
        // 38 = up arrow key
        // 39 = right arrow key
        // 40 = down arrow key

        // 65 = a or A
        // 87 = w or W
        // 68 = d or D
        // 83 = s or S

        // 16 = shift
        // 17 = crtl
        // 18 = alt

        // 27 = esc
        // 13 = enter

        switch (code) {
            case 37:
            case 65: this.leftKeyDown = down; break;

            case 39:
            case 68: this.rightKeyDown = down; break;

            case 38:
            case 87: this.upKeyDown = down; break;

            case 40:
            case 83: this.downKeyDown = down; break;

            case 32: this.shootKeyDown = down; break;

            case 16:
            case 17:
            case 18: this.thrustKeyDown = down; break;

            case 27: if (down) { $(this).trigger("exitRequested", {}); } break;
            case 13: if (down) { $(this).trigger("actionPressed", {}); } break;
        }

        this._debugGame();
    },

    // Bind an event handler to the "exitRequested" event
    onExitRequested: function (handler) {

        $(this).bind("exitRequested", handler);
    },

    // Bind an event handler to the "actionPressed" event
    onActionPressed: function (handler) {

        $(this).bind("actionPressed", handler);
    },

    _debugGame: function () {
        if (window.debugGame) {
            $('#debugKeyboardWatcher').html(

                    "Left: "   + (this.leftKeyDown ? 1 : "")  + "<br />" +
                    "Right: "  + (this.rightKeyDown ? 1 : "") + "<br />" +
                    "Up: "     + (this.upKeyDown ? 1 : "")    + "<br />" +
                    "Down: "   + (this.downKeyDown ? 1 : "")  + "<br />" +
                    "Shoot: "  + (this.shootKeyDown ? 1 : "") + "<br />" +
                    "Thrust: " + (this.thrustKeyDown ? 1 : "")
                );
        }
    }
});