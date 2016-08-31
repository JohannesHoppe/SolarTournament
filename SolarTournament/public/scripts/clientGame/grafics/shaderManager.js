define(['CL3D',
        'clientGame/infrastructure/engine'],
    function (CL3D, engine) {
        var ShaderManager = function() {
            this._engine = engine;
        };

        ShaderManager.prototype.drawWithPointLightShader = function (model) {

            var fragmentShaderSource = "\n\
                precision mediump float;\n\
                varying vec2 vTextureCoord;\n\
                varying vec4 vTransformedNormal;\n\
                varying vec4 vvPosition;\n\
                \n\
                uniform vec3 uAmbientColor;\n\
                uniform vec3 uPointLightingLocation;\n\
                uniform vec3 uPointLightingDiffuseColor;\n\
                uniform sampler2D uSampler;\n\
                \n\
                void main(void) {\n\
                    vec3 lightWeighting;\n\
                    \n\
                    vec3 lightDirection = normalize(uPointLightingLocation - vvPosition.xyz);\n\
                    float directionalLightWeighting = max(dot(normalize(vec3(vTransformedNormal.xyz)), lightDirection), 0.0);\n\
                    lightWeighting = uAmbientColor  + uPointLightingDiffuseColor * directionalLightWeighting ;\n\
                    vec4 fragmentColor;\n\
                    fragmentColor = texture2D(uSampler, vec2(vTextureCoord.s, vTextureCoord.t));\n\
                    gl_FragColor = vec4(fragmentColor.rgb  * lightWeighting, fragmentColor.a);\n\
                }\n\
                ";

            var vertexShaderSource = " \n\
                attribute vec4 vPosition;\n\
                attribute vec3 vNormal;\n\
                attribute vec2 vTexCoord1;\n\
                uniform mat4 modelviewtransform;\n\
                uniform mat4 worldviewproj;\n\
                uniform mat4 normaltransform;\n\
                varying vec2 vTextureCoord;\n\
                varying vec4 vTransformedNormal;\n\
                varying vec4 vvPosition;\n\
                void main(void) {\n\
                    vvPosition = modelviewtransform * vPosition, 1.0;\n\
                    gl_Position = worldviewproj * vPosition;\n\
                    vTextureCoord = vTexCoord1;\n\
                    vTransformedNormal = normaltransform * vec4(vNormal,1);\n\
                }\n\
            ";

            var newMaterialType = this._engine.getRenderer().createMaterialType(vertexShaderSource, fragmentShaderSource);

            if (newMaterialType != -1) {
                model.getMaterial(0).Type = newMaterialType;
            }
            else {
                window.alert('could not create shader');
            }
            return newMaterialType;

        };

        ShaderManager.prototype.drawWithPhongShader = function (model) {

            var fragmentShaderSource = "\n\
                precision mediump float;\n\
                varying vec2 vTextureCoord;\n\
                varying vec4 vTransformedNormal;\n\
                varying vec4 vvPosition;\n\
                \n\
                uniform float uMaterialShininess; \n\
                uniform float uDriveLightRadius; \n\
                uniform vec3 uPointLightingSpecularColor; \n\
                uniform vec3 uAmbientColor;\n\
                uniform vec3 uPointLightingLocation;\n\
                uniform vec3 uPointLightingDiffuseColor;\n\
                uniform vec3 uDriveLightLocation;\n\
                uniform vec3 uDriveLightColor;\n\
                uniform vec3 uCamPosition;\n\
                uniform sampler2D uSamplerOne;\n\
                \n\
                void main(void) {\n\
                    vec3 lightWeighting;\n\
                    \n\
                    vec3 sunlightDirection = normalize(uPointLightingLocation - vvPosition.xyz);\n\
                    vec3 driveLightDirection = normalize(uDriveLightLocation - vvPosition.xyz);\n\
                    vec3 normal = normalize(vec3(vTransformedNormal.xyz));\n\
                    float specularLightWeighting = 0.0;\n\
                    float distanceDriverLightToPixel = distance( vec3(vvPosition.xyz),  uDriveLightLocation);\n\
                    float driveLightStrength = 1.0 - (distanceDriverLightToPixel /uDriveLightRadius );\n\
                    if(driveLightStrength < 0.0) { \n\
                        driveLightStrength = 0.0; \n\
                    } \n\
                    \n\
                    vec3 eyeDirection = normalize(uCamPosition-vec3(vvPosition.xyz));\n\
                    vec3 reflectionDirection = reflect(-sunlightDirection, normal);\n\
                    specularLightWeighting = pow(max(dot(reflectionDirection, eyeDirection), 0.0), uMaterialShininess);\n\
                    float diffuseSunLightWeighting = max(dot(normal, sunlightDirection), 0.0);\n\
                    float diffuseDriveLightWeighting = max(dot(normal, driveLightDirection), 0.0);\n\
                    lightWeighting = uAmbientColor  + uPointLightingSpecularColor * specularLightWeighting + uPointLightingDiffuseColor * diffuseSunLightWeighting + (uDriveLightColor * diffuseDriveLightWeighting * driveLightStrength) ;\n\
                    vec4 fragmentColor;\n\
                    fragmentColor = texture2D(uSamplerOne, vec2(vTextureCoord.s, vTextureCoord.t));\n\
                    gl_FragColor = vec4(fragmentColor.rgb  * lightWeighting, fragmentColor.a);\n\
                }\n\
                ";

            var vertexShaderSource = " \n\
                attribute vec4 vPosition;\n\
                attribute vec4 vNormal;\n\
                attribute vec2 vTexCoord1;\n\
                uniform mat4 modelviewtransform;\n\
                uniform mat4 worldviewproj;\n\
                uniform mat4 normaltransform;\n\
                varying vec2 vTextureCoord;\n\
                varying vec4 vTransformedNormal;\n\
                varying vec4 vvPosition;\n\
                void main(void) {\n\
                    vvPosition = modelviewtransform * vPosition, 1.0;\n\
                    gl_Position = worldviewproj * vPosition;\n\
                    vTextureCoord = vTexCoord1;\n\
                    vTransformedNormal = normaltransform * vNormal;\n\
                }\n\
            ";

            var newMaterialType = this._engine.getRenderer().createMaterialType(vertexShaderSource, fragmentShaderSource);

            if (newMaterialType != -1) {
                model.getMaterial(0).Type = newMaterialType;
            }
            else {
                window.alert('could not create shader');
            }

            return newMaterialType;

        };

        ShaderManager.prototype.updateShader = function() {
            this._engine.getRenderer().OnChangeMaterial = function(mattype) {
                var renderer = engine.getRenderer();
                var scene = engine.getScene();
                var gl = renderer.getWebGL();

                // get variable location
                var program = renderer.getGLProgramFromMaterialType(mattype);
                var lightPositionLocation = gl.getUniformLocation(program, "uPointLightingLocation");
                var lightDiffuseColorLocation = gl.getUniformLocation(program, "uPointLightingDiffuseColor");
                var ambientColorLocation = gl.getUniformLocation(program, "uAmbientColor");
                var lightSpecularColorLocation = gl.getUniformLocation(program, "uPointLightingSpecularColor");
                var shininessLocation = gl.getUniformLocation(program, "uMaterialShininess");
                var driveLightRadiusLocation = gl.getUniformLocation(program, "uDriveLightRadius");
                var camPositionLocation = gl.getUniformLocation(program, "uCamPosition");

                var driveLightPositionLocation = gl.getUniformLocation(program, "uDriveLightLocation");
                var driveLightDiffuseColorLocation = gl.getUniformLocation(program, "uDriveLightColor");

                var light = scene.getSceneNodeFromName('mainLight');
                var driveLight = scene.getSceneNodeFromName('driveLight');
                var cam = scene.getSceneNodeFromName('thirdPersonCamera');

                // set the content of the variable
                gl.uniform3f(lightPositionLocation,
                    light.LightData.Position.X,
                    light.LightData.Position.Y,
                    light.LightData.Position.Z);
                gl.uniform3f(lightDiffuseColorLocation,
                    light.LightData.Color.R,
                    light.LightData.Color.G,
                    light.LightData.Color.B);
                gl.uniform3f(ambientColorLocation,
                    scene.AmbientLight.R,
                    scene.AmbientLight.G,
                    scene.AmbientLight.B);
                gl.uniform3f(lightSpecularColorLocation,
                    1,
                    1,
                    1);
                gl.uniform1f(shininessLocation, 64);
                gl.uniform1f(driveLightRadiusLocation, driveLight.radius);
                gl.uniform3f(camPositionLocation,
                    cam.Pos.X,
                    cam.Pos.Y,
                    cam.Pos.Z);

                gl.uniform3f(driveLightPositionLocation,
                    driveLight.LightData.Position.X,
                    driveLight.LightData.Position.Y,
                    driveLight.LightData.Position.Z);
                gl.uniform3f(driveLightDiffuseColorLocation,
                    driveLight.LightData.Color.R,
                    driveLight.LightData.Color.G,
                    driveLight.LightData.Color.B);

            };
        };

        return new ShaderManager();

    });