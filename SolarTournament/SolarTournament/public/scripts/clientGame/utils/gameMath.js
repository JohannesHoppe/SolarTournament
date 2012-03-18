var GameMath = function() {

};

GameMath.deccelerateValue = function (timeDiff, value, deceleratefact, maxspeed) {
    
    var p = deceleratefact * timeDiff;

    if (value < 0) {
        
        value += p;
        if (value > 0) value = 0;
        
    } else if (value > 0) {
        
        value -= p;
        if (value < 0) {
            value = 0;
        }
    }

    if (value > maxspeed) {
        value = maxspeed;
    }
    
    if (value < -maxspeed) {
        value = -maxspeed;
    }

    return value;
};