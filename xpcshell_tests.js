var Ci = Components.interfaces;
var Cc = Components.classes;

function bindDirToResource(dirName, alias)
{
    var ioService = Cc["@mozilla.org/network/io-service;1"].getService(
        Ci.nsIIOService
    );

    var resProt = ioService.getProtocolHandler("resource").QueryInterface(
        Ci.nsIResProtocolHandler
    );

    var aliasFile = Cc["@mozilla.org/file/local;1"].createInstance(
        Ci.nsILocalFile
    );

    aliasFile.initWithPath(dirName);

    var aliasURI = ioService.newFileURI(aliasFile);
    resProt.setSubstitution(alias, aliasURI);
}

function registerComponent(filename)
{
    var file = Cc["@mozilla.org/file/local;1"].createInstance(
        Ci.nsILocalFile
    );

    file.initWithPath(filename);

    var registrar = Components.manager.QueryInterface(
        Ci.nsIComponentRegistrar
    );

    registrar.autoRegister(file);
}

if (arguments.length == 0)
    throw "Please provide the path to the root of the extension.";

var basePath = arguments[0];
bindDirToResource(basePath + "/modules", "friday-modules");
registerComponent(basePath + "/components/autocomplete.js");

var XpcShellTestResponder = {
    onStartTest : function(test)
    {
        dump("Running test: "+test.name+"\n");
    },

    onException : function(test, e)
    {
        var text = ("Error in test " +
                    test.name + ": " + e.message);
        if (e.fileName)
            text += (" (in " + e.fileName +
                     ", line " + e.lineNumber + ")");
        text += "\n";
        dump(text);
    },

    onFinished : function(successes, failures)
    {
        var total = successes + failures;

        var text = (successes + " out of " +
                    total + " tests successful (" + failures +
                    " failed).\n");

        dump(text);
    }
};

load(basePath + "/chrome/content/test.js");
load(basePath + "/chrome/content/cmdmanager.js");
load(basePath + "/chrome/content/tests.js");

var suite = new TestSuite(XpcShellTestResponder, this);

suite.start();
