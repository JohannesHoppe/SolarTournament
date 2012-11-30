define(['copperlicht'], function () {

    var CL3D = window.CL3D;

    CL3D.Renderer.prototype.drawWebGlStaticGeometry = function (b) {
        //CL3D.gCCDebugOutput.print("drawElementsBegin with " + b.indexCount + " indices " + b.positionBuffer + " " + b.texcoordsBuffer + " " + b.normalBuffer);

        var gl = this.gl;


        // enable all of the vertex attribute arrays.

        gl.enableVertexAttribArray(0);
        gl.enableVertexAttribArray(1);
        gl.enableVertexAttribArray(2);
        gl.enableVertexAttribArray(3);
        gl.enableVertexAttribArray(4);

        // set up all the vertex attributes for vertices, normals and texCoords

        gl.bindBuffer(gl.ARRAY_BUFFER, b.positionBuffer);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, b.texcoordsBuffer);
        gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, b.texcoordsBuffer2);
        gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, b.normalBuffer);
        gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, b.colorBuffer);
        gl.vertexAttribPointer(4, 3, gl.FLOAT, false, 0, 0);

        // bind the index array

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.indexBuffer);

        // matrices

        var mat = new CL3D.Matrix4(false);
        this.Projection.copyTo(mat);
        mat = mat.multiply(this.View);
        mat = mat.multiply(this.World);

        // set world view projection matrix
        var program = this.currentGLProgram;
        if (program.locWorldViewProj != null)
            gl.uniformMatrix4fv(program.locWorldViewProj, false, this.getMatrixAsWebGLFloatArray(mat));

        // set normal matrix
        if (program.locNormalMatrix != null) {
            // set the normal matrix

            var matnormal = new CL3D.Matrix4(true);

            matnormal = matnormal.multiply(this.World);
            matnormal.makeInverse();
            matnormal = matnormal.getTransposed(); // gets transposed below		

            gl.uniformMatrix4fv(program.locNormalMatrix, false, this.getMatrixAsWebGLFloatArray(matnormal));
        }

        // set model view
        if (program.locModelViewMatrix != null) {
            // set the model matrix

            var matmodel = new CL3D.Matrix4(true);
            matmodel = matmodel.multiply(this.World);

            gl.uniformMatrix4fv(program.locModelViewMatrix, false, this.getMatrixAsWebGLFloatArray(matmodel));
        }

        // set light values
        if (program.locLightPositions != null)
            this.setDynamicLightsIntoConstants(program);


        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.drawElements(gl.TRIANGLES, b.indexCount, gl.UNSIGNED_SHORT, 0);


        //CL3D.gCCDebugOutput.print("drawElementsEnd");
    };

    return CL3D;
});