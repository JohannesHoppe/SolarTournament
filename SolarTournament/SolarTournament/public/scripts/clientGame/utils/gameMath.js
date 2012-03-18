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

GameMath.quaterionMultiplication = function(quaterionOne, quaterionTwo) {

    var finalQuaterion = new CL3D.Quaternion();
    finalQuaterion.W = (quaterionOne.W * quaterionTwo.W - quaterionOne.X * quaterionTwo.X - quaterionOne.Y * quaterionTwo.Y - quaterionOne.Z * quaterionTwo.Z);
    finalQuaterion.X = (quaterionOne.W * quaterionTwo.X + quaterionOne.X * quaterionTwo.W + quaterionOne.Y * quaterionTwo.Z - quaterionOne.Z * quaterionTwo.Y);
    finalQuaterion.Y = (quaterionOne.W * quaterionTwo.Y - quaterionOne.X * quaterionTwo.Z + quaterionOne.Y * quaterionTwo.W + quaterionOne.Z * quaterionTwo.X);
    finalQuaterion.Z = (quaterionOne.W * quaterionTwo.Z + quaterionOne.X * quaterionTwo.Y - quaterionOne.Y * quaterionTwo.X + quaterionOne.Z * quaterionTwo.W);
    return finalQuaterion;
};

GameMath.getRotationMatrix = function (quaterion) {
    var rotationsMatrix = new CL3D.Matrix4(true);
    rotationsMatrix.m00 = 1 - 2 * quaterion.Y * quaterion.Y - 2 * quaterion.Z * quaterion.Z;
    rotationsMatrix.m01 = 2 * quaterion.X * quaterion.Y - 2 * quaterion.W * quaterion.Z;
    rotationsMatrix.m02 = 2 * quaterion.X * quaterion.Z + 2 * quaterion.W * quaterion.Y;
    rotationsMatrix.m03 = 0;
    rotationsMatrix.m10 = 2 * quaterion.X * quaterion.Y + 2 * quaterion.W * quaterion.Z;
    rotationsMatrix.m11 = 1 - 2 * quaterion.X * quaterion.X - 2 * quaterion.Z * quaterion.Z;
    rotationsMatrix.m12 = 2 * quaterion.Y * quaterion.Z + 2 * quaterion.W * quaterion.X;
    rotationsMatrix.m13 = 0;
    rotationsMatrix.m20 = 2 * quaterion.X * quaterion.Z - 2 * quaterion.W * quaterion.Y;
    rotationsMatrix.m21 = 2 * quaterion.Y * quaterion.Z - 2 * quaterion.W * quaterion.X;
    rotationsMatrix.m22 = 1 - 2 * quaterion.X * quaterion.X - 2 * quaterion.Y * quaterion.Y;
    rotationsMatrix.m23 = 0;
    rotationsMatrix.m30 = 0;
    rotationsMatrix.m31 = 0;
    rotationsMatrix.m32 = 0;
    rotationsMatrix.m33 = 1;
    return rotationsMatrix;
};