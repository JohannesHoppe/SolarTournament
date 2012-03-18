/*
 * shows and hides some divs that are placed over the game canvas
 */
var HtmlMenu = function () {

    this._gamehud = $('#gamehud');
    this._game_mainmenu = $('#game_mainmenu');
    this._infoplate = $('#infoplate');

    this._infoplattext = $('#infoplattext');
    this._loadinglabel = $('#cl_loadinglabel');

    this._gameTimeRemainingSpan = $('#gametimeremaining');
    this._gameScoreSpan = $('#gamescore');

    if (window.debugGame) {
        $('#debug').show();
    }

    // bindings
    $('#backToMainMenuButton').click((this.showMainMenu).bind(this));
};

HtmlMenu.addToProto({

    showInfoPlate: function (text) {

        this._gamehud.hide();
        this._game_mainmenu.hide();
        this._infoplate.show('fast');
        this._infoplattext.html(text);
    },

    showMainMenu: function () {

        this._gamehud.hide();
        this._game_mainmenu.show('fast');
        this._infoplate.hide();
    },

    showGame: function () {

        this._gamehud.show();
        this._game_mainmenu.hide();
        this._infoplate.hide();
    },

    showNoWebglMessage: function () {
        $('#cl_nowebgl').show();
    },

    showLoadingLabel: function () {

        this._loadinglabel.show();
    },

    hideLoadingLabel: function () {

        this._loadinglabel.hide();
    },

    updateHud: function (timeRemaining, gameScore) {

        if (timeRemaining == -1) {

            this._gameTimeRemainingSpan.hide();

        } else {

            this._gameTimeRemainingSpan.html("Time Remaining: " + timeRemaining);
        }

        this._gameScoreSpan.html("Your Score: " + gameScore);
    }
});