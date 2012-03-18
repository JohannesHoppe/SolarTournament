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


HtmlMenu.prototype.showInfoPlate = function(text) {

    this._gamehud.hide();
    this._game_mainmenu.hide();
    this._infoplate.show('fast');
    this._infoplattext.html(text);
};

HtmlMenu.prototype.showMainMenu = function() {

    this._gamehud.hide();
    this._game_mainmenu.show('fast');
    this._infoplate.hide();
};

HtmlMenu.prototype.showGame = function () {

    this._gamehud.show();
    this._game_mainmenu.hide();
    this._infoplate.hide();
};

HtmlMenu.prototype.showNoWebglMessage = function () {
    $('#cl_nowebgl').show();
};

HtmlMenu.prototype.showLoadingLabel = function () {

    this._loadinglabel.show();
};

HtmlMenu.prototype.hideLoadingLabel = function () {

    this._loadinglabel.hide();
};

HtmlMenu.prototype.updateHud = function (timeRemaining, gameScore) {

    this._gameTimeRemainingSpan.html(timeRemaining);
    this._gameScoreSpan.html(gameScore);
};