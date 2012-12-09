define(['CL3D', 'clientGame/utils/gameMath'], function (CL3D, gameMath) {
    
    var CollisionHandler = function() {
        this._gameMath = gameMath;
    };

    CollisionHandler.addToProto({
        testOnSphereCollision: function(objectOne, objectTwo) {

            if (!objectOne || !objectTwo) {
                return false;
            }

            var distance = objectOne.Pos.getDistanceTo(objectTwo.Pos);
            var collisionDistance = objectOne.sphereCollider.radius + objectTwo.sphereCollider.radius;
            return distance < collisionDistance;
        },

        testOnMeshCollision: function(objectOne, objectTwo) {

            if (!this.testOnSphereCollision(objectOne, objectTwo)) {
                return false;
            }

            // not always available - if Copperlicht hasn't loaded all data?!
            if (typeof objectOne.Children[0] == "undefined" ||
                typeof objectTwo.Children[0] == "undefined") {
                return false;
            }

            if (!objectOne.MeshSelector) {
                objectOne.MeshSelector = new CL3D.MeshTriangleSelector(objectOne.Children[0].OwnedMesh, objectOne);
            }

            if (!objectTwo.MeshSelector) {
                objectTwo.MeshSelector = new CL3D.MeshTriangleSelector(objectTwo.Children[0].OwnedMesh, objectTwo);
            }

            var triesOfObjectOne = [];
            var triesOfObjectTwo = [];

            objectOne.MeshSelector.getAllTriangles(null, triesOfObjectOne);
            objectTwo.MeshSelector.getAllTriangles(null, triesOfObjectTwo);

            var isColliding = this._calculateIfCollisionExist(triesOfObjectOne, triesOfObjectTwo);
            return isColliding;
        },

        _calculateIfCollisionExist: function(triesOfObjectOne, triesOfObjectTwo) {
            var collide;
            for (var indexTriesOfObjectOne = 0; indexTriesOfObjectOne < triesOfObjectOne.length || collide; indexTriesOfObjectOne++) {
                for (var indexTriesOfObjectTwo = 0; indexTriesOfObjectTwo < triesOfObjectTwo.length || collide; indexTriesOfObjectTwo++) {

                    var planeOne = triesOfObjectOne[indexTriesOfObjectOne].getPlane();
                    var planeTwo = triesOfObjectTwo[indexTriesOfObjectTwo].getPlane();

                    var outlinePoint = new CL3D.Vect3d();
                    var outLineVect = new CL3D.Vect3d();
                    var intersectPlaneOneWithPlaneTwo = planeOne.getIntersectionWithPlane(planeTwo, outlinePoint, outLineVect);

                    var intersectionOfTriesOneEdgeWithIntersectionLine = this._calculateIntersectionWithIntersectionLine(triesOfObjectOne[indexTriesOfObjectOne], outlinePoint, outLineVect);
                    var intersectionOfTriesTwoEdgeWithIntersectionLine = this._calculateIntersectionWithIntersectionLine(triesOfObjectTwo[indexTriesOfObjectTwo], outlinePoint, outLineVect);

                    collide = this._calculateIfTriangleIntersectOnTheIntersectionLine(intersectPlaneOneWithPlaneTwo, intersectionOfTriesOneEdgeWithIntersectionLine, intersectionOfTriesTwoEdgeWithIntersectionLine);
                    if (collide) {
                        return collide;
                    }
                }
            }

            return false;
        },

        _calculateIntersectionWithIntersectionLine: function(trie, intersectionLineOrigin, intersectionLineDirection) {
            var originTrieEdge = [];
            var directionTrieEdge = [];
            var intersectionArray = [];

            originTrieEdge.push(trie.pointA);
            directionTrieEdge.push(trie.pointB.substract(trie.pointA));
            originTrieEdge.push(trie.pointB);
            directionTrieEdge.push(trie.pointC.substract(trie.pointB));
            originTrieEdge.push(trie.pointC);
            directionTrieEdge.push(trie.pointA.substract(trie.pointC));

            for (var index = 0; index < originTrieEdge.length; index++) {
                intersectionArray.push(gameMath.intesectBetweenTwoLines(originTrieEdge[index], directionTrieEdge[index], intersectionLineOrigin, intersectionLineDirection));
            }

            return intersectionArray;
        },

        _calculateIfTriangleIntersectOnTheIntersectionLine: function(planeIntersect, triangleOneIntersection, triangleTwoIntersection) {

            var objectOnePoints = [];
            var objectTwoPoints = [];
            objectOnePoints = this._filterTriangleIntersectionPoints(triangleOneIntersection);
            objectTwoPoints = this._filterTriangleIntersectionPoints(triangleTwoIntersection);

            if (objectOnePoints.length > 0 && objectTwoPoints.length > 0) {
                return true;
            }
            return false;
        },

        _filterTriangleIntersectionPoints: function(intersectionPoints) {
            var vectorZero = new CL3D.Vect3d(0, 0, 0);
            var objectIntersectionPoints = [];

            for (var index = 0; index < intersectionPoints.length; index++) {
                if (!intersectionPoints[index].equals(vectorZero)) {
                    objectIntersectionPoints.push(intersectionPoints[index]);
                }
            }
            return objectIntersectionPoints;
        }
    });

    return new CollisionHandler();
});