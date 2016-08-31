/* Helper for Mathemtic routines */
define(['CL3D'], function (CL3D) {

    var gameMath = function() {

    };

    gameMath.quaternionMultiplication = function (quaterionOne, quaterionTwo) {
        quaterionOne.normalize();
        quaterionTwo.normalize();

        var finalQuaterion = new CL3D.Quaternion();
        finalQuaterion.W = (quaterionOne.W * quaterionTwo.W - quaterionOne.X * quaterionTwo.X - quaterionOne.Y * quaterionTwo.Y - quaterionOne.Z * quaterionTwo.Z);
        finalQuaterion.X = (quaterionOne.W * quaterionTwo.X + quaterionOne.X * quaterionTwo.W + quaterionOne.Y * quaterionTwo.Z - quaterionOne.Z * quaterionTwo.Y);
        finalQuaterion.Y = (quaterionOne.W * quaterionTwo.Y - quaterionOne.X * quaterionTwo.Z + quaterionOne.Y * quaterionTwo.W + quaterionOne.Z * quaterionTwo.X);
        finalQuaterion.Z = (quaterionOne.W * quaterionTwo.Z + quaterionOne.X * quaterionTwo.Y - quaterionOne.Y * quaterionTwo.X + quaterionOne.Z * quaterionTwo.W);

        finalQuaterion.normalize();
        return finalQuaterion;
    };

    gameMath.quaternionSubtract = function (quaternionOne, quaternionTwo) {
        quaternionOne.W -= quaternionTwo.W;
        quaternionOne.X -= quaternionTwo.X;
        quaternionOne.Y -= quaternionTwo.Y;
        quaternionOne.Z -= quaternionTwo.Z;

        return quaternionOne;
    };

    gameMath.quaternionMultiplicationWithScale = function (quaternion, scalar) {
        quaternion.W *= scalar;
        quaternion.X *= scalar;
        quaternion.Y *= scalar;
        quaternion.Z *= scalar;

        return quaternion;
    };

    gameMath.getRotationMatrix = function(quaterion) {
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

    gameMath.CalculateIfObjectIsVisible = function(orientationForward, position, testObjectPosition) {
        var cosin = (testObjectPosition.X - position.X) * orientationForward.X +
            (testObjectPosition.Y - position.Y) * orientationForward.Y +
            (testObjectPosition.Z - position.Z) * orientationForward.Z;
        if (cosin >= 0) {
            return true;
        } else {
            return false;
        }
    };

    gameMath.getLocalRotationQuanterion = function (rotateAxis, rotateAngle, orientation, timeDiff) {

        orientation.normalize();
        var localRotation = new CL3D.Quaternion(0, 0, 0, 0);

        rotateAxis.normalize();

        //calculate local rotation
        localRotation.W = Math.cos(rotateAngle * timeDiff / 2);
        localRotation.X = rotateAxis.X * Math.sin(rotateAngle * timeDiff / 2);
        localRotation.Y = rotateAxis.Y * Math.sin(rotateAngle * timeDiff / 2);
        localRotation.Z = rotateAxis.Z * Math.sin(rotateAngle * timeDiff / 2);
        localRotation.normalize();

        orientation = this.quaternionMultiplication(localRotation, orientation);
        orientation.normalize();
        return orientation;
    };

    gameMath.projectionVectorToVector = function (vectorToProject, linePoint, LineVect) {
        var linePointToVectorToProject = vectorToProject.substract(linePoint);
        var projectedVector = linePoint.add(LineVect.multiplyWithScal(linePointToVectorToProject.dotProduct(LineVect) / LineVect.dotProduct(LineVect)));
        return projectedVector;
    };

    gameMath.intesectBetweenTwoLines = function(linePointOne, lineDirectionOne, linePointTwo, lineDirectionTwo, linesIntesect) {
        var r = null;
        var s = null;
        var intersectionPoint = new CL3D.Vect3d();

        s = (linePointOne.X - linePointTwo.X + ((linePointTwo.Y - linePointOne.Y) / lineDirectionOne.Y) * lineDirectionOne.X) / (lineDirectionTwo.X - ((lineDirectionTwo.Y * lineDirectionOne.X) / lineDirectionOne.Y));
        r = ((linePointTwo.Y - linePointOne.Y + lineDirectionTwo.Y * s) / lineDirectionOne.Y);
        if (linePointOne.X + lineDirectionOne.X * r == linePointTwo.X + lineDirectionTwo.X * s) {
            if (linePointOne.Y + lineDirectionOne.Y * r == linePointTwo.Y + lineDirectionTwo.Y * s) {
                if (linePointOne.Z + lineDirectionOne.Z * r == linePointTwo.Z + lineDirectionTwo.Z * s) {
                    if (r <= 1 && r >= 0) {
                        intersectionPoint.X = linePointOne.X + r * lineDirectionOne.X;
                        intersectionPoint.Y = linePointOne.Y + r * lineDirectionOne.Y;
                        intersectionPoint.Z = linePointOne.Z + r * lineDirectionOne.Z;
                        linesIntesect = true;
                    }
                }
            }
        }
        //linesIntesect = false;
        return intersectionPoint;
    };

    // no initialization intended!
    // (the GameMath object should be similar to a "static class")
    return gameMath;

});