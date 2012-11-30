module.exports = function () {

    var playerCounter = 0;

    var createNewPlayer = function (playerId, name) {
    
        playerCounter++;

        var posX = randomMinToMax(-700, 700);
        var posZ = randomMinToMax(-700, 700);

        if (name == "Player" || name == "") {
            name = "Player" + playerCounter;
        }

        var spaceship = isEven(playerCounter) ? "alienInterceptor" : "humanInterceptor";

        return {
            id: playerId,
            name: name,
            spaceship: spaceship,
            position: { X: posX, Y: 0, Z: posZ },
            rotation: { X: 0, Y: 0, Z: 0 }
        };
    };

    var isEven = function (someNumber) {
        return (someNumber % 2 == 0) ? true : false;
    };

    return {
        createNewPlayer: createNewPlayer
    };
};


function randomMinToMax(min, max) {
    
    var range = max - min + 1;
    return Math.floor(Math.random() * range + min);
}