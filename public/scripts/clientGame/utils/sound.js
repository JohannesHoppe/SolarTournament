define(function() {

    var playingMusic = null;
    var musicDisabled = false;
    var currentlyPlayingMusicName = null;

    var toggleMusic = function() {

        musicDisabled = !musicDisabled;

        if (musicDisabled) {
            if (playingMusic) {
                playingMusic.pause();
            }
            playingMusic = null;

        } else {
            if (!playingMusic && currentlyPlayingMusicName) {
                playmusic(currentlyPlayingMusicName);
            }
        }
    };

    var playmusic = function(s) {
        currentlyPlayingMusicName = s;
        if (musicDisabled) { return; }
        var a = new Audio();
        a.src = document.getElementById(s).src;
        a.loop = true;
        a.play();
        if (playingMusic) { playingMusic.pause(); }
        playingMusic = a;
    };

    var playsound = function(s) {
        var thistime = new Date();

        var origaudio = document.getElementById(s);
        if (!origaudio) { return; }

        // the problem with this is that the audio will be reloaded by chrome, no matter what we do here.
        // seeking and restarting an audio file isn't possible as well.
        // so only play this once and wait for the situation to get better.
        origaudio.play();
    };

    return {
        toggleMusic: toggleMusic,
        playmusic: playmusic,
        playsound: playsound
    };

});