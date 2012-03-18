var util = require('util');

// Generates HTML that will load javascript files has 2 modes:
// development - scripts are included via script-tag
// other - load deferred as adviced by Google PageSpeed
module.exports = function (app) {

    if (app.serverInfo.mode == "development") {

        app.helpers({
            renderHeaderScriptTags: function (scripts) {

                var result = '\n' + scripts.map(function (script) {
                    return '<script src="' + script + '"></script>';
                }).join('\n');

                result += "<script>var debugGame = true;</script>";
                return result;
            }
        });

        app.helpers({
            renderFooterScriptTags: function () { }
        });

    } else {

        app.helpers({
            renderHeaderScriptTags: function () {

                return "<script>var debugGame = false;</script>";
            }
        });

        // Defer loading of JavaScript
        // (reduces the initial download size, allowing other resources to be downloaded in parallel)
        // Brings the scripts into a client-side array, and attach them to DOM on page load
        app.helpers({
            renderFooterScriptTags: function (scripts) {

                var footerHtml = "<script>\
                    var page_scripts = [\"%s\"];\
                    function loadJS() {\
                        for(var i in page_scripts) {\
                            var e = document.createElement(\"script\");\
                            e.src = page_scripts[i];\
                            document.body.appendChild(e);\
                        }\
                    }\
                    if (window.addEventListener) {\
                        window.addEventListener(\"load\", loadJS, false);\
                    }\
                    else if (window.attachEvent) {\
                        window.attachEvent(\"onload\", loadJS); }\
                    else {\
                        window.onload = loadJS;\
                    }\
                </script>";

                var scriptsInsert = scripts.join('","');
                return util.format(footerHtml, scriptsInsert).replace(/\s\s/g, "");
            }
        });
    }
}