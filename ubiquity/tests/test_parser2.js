Components.utils.import("resource://ubiquity/modules/utils.js");
Components.utils.import("resource://ubiquity/modules/cmdmanager.js");
Components.utils.import("resource://ubiquity/modules/cmdutils.js");
Components.utils.import("resource://ubiquity/modules/nounutils.js");
Components.utils.import("resource://ubiquity/modules/default_feed_plugin.js");
Components.utils.import("resource://ubiquity/modules/parser/new/namespace.js");
Components.utils.import("resource://ubiquity/modules/parser/new/parser.js");
Components.utils.import("resource://ubiquity/tests/test_suggestion_memory.js");
Components.utils.import("resource://ubiquity/tests/testing_stubs.js");
Components.utils.import("resource://ubiquity/tests/framework.js");

const VER = 2;
const LANG = "en";
const MAX_SUGGESTIONS = 10;


function makeTestParser2(lang, verbs, contextUtils) {
  return NLParser2.makeParserForLanguage(
    lang || LANG,
    verbs || [],
    contextUtils || fakeContextUtils,
    new TestSuggestionMemory());
}

function BetterFakeCommandSource( cmdList ) {
  var cmd;
  this._cmdList = [ makeCommand( cmd ) for each (cmd in cmdList ) ];
  for each (var c in this._cmdList) {
    dump("BetterFakeCommandSource has verb named " + c.names + ".\n");
  }
}
BetterFakeCommandSource.prototype = {
  addListener: function() {},
  getCommand: function(name) {
    return this._cmdList[name];
  },
  getAllCommands: function(name) {
    return this._cmdList;
  },
  refresh: function() {
  }
};

// Infrastructure for asynchronous tests:
function getCompletionsAsync( input, verbs, context, callback) {
  if (!context)
    context = { textSelection: "", htmlSelection: "" };
  var parser = makeTestParser2(LANG, verbs );
  getCompletionsAsyncFromParser(input, parser, context, callback);
}

function getCompletionsAsyncFromParser(input, parser, context, callback) {
  if (!context)
    context = { textSelection: "", htmlSelection: "" };
  var query = parser.newQuery( input, context, MAX_SUGGESTIONS, true );
  /* The true at the end tells it not to run immediately.  This is
   * important because otherwise it would run before we assigned the
   * callback. */
  query.onResults = function() {
    if (query.finished) {
      callback(query.suggestionList);
    }
  };
  query.run();
}

function makeCommand(options) {
  // Calls cmdUtils.CreateCommand, but returns the object instead of just
  // dumping it in a global namespace.
  var fakeGlobal = {
    commands: [],
    feed: {id: "this_is_a_test_case_not_really_a_feed"},
    Utils: Utils,
  };
  ({__proto__: CmdUtils, __globalObject: fakeGlobal}).CreateCommand(options);
  return DefaultFeedPlugin.makeCmdForObj(
    fakeGlobal,
    fakeGlobal.commands[0],
    Utils.url("chrome://ubiquity/content/test.html"));
}

// Actual test cases begin here:

function testSmokeTestParserTwo() {
  // Instantiate a ubiquity with Parser 2 and all the built-in feeds and
  // nountypes; ensure that it doesn't break.
  var self = this;
  try {
    var jsm = {};
    Components.utils.import("resource://ubiquity/modules/setup.js", jsm);
    Components.utils.import("resource://ubiquity/modules/parser/parser.js", jsm);

    var services = jsm.UbiquitySetup.createServices();
    // but don't set up windows or chrome or anything... just use this to
    // get installed feeds.
    var NLParser = jsm.NLParserMaker(VER);
    var nlParser = NLParser.makeParserForLanguage(
      LANG,
      [],
      []
    );
    // now do what CommandManager does using services.commandSource
    nlParser.setCommandList(services.commandSource.getAllCommands());
  } catch (e) {
    this.assert(false, "Error caught in smoke test: " + e );
  }


  // Do a query here and make sure one of the builtin commands is
  // suggested...
 /* var fakeContext = { textSelection: "", htmlSelection: "" };
  var q = nlParser.newQuery("help", fakeContext, MAX_SUGGESTIONS, true);


  var testFunc = self.makeCallback(
    function(suggestionList) {
      // TODO for some reason the test is not waiting for this to be called.
      self.assert( suggestionList[0]._verb.name == "help",
                   "Should be help command!");
    });

  q.onResults = function() {
    testFunc(q.suggestionList);
  };
  q.run();*/

}

function testParserTwoDirectOnly() {
  var dogGotPetted = false;
  var dog = new NounUtils.NounType( "dog", ["poodle", "golden retreiver",
                                            "beagle", "bulldog", "husky"]);

  var cmd_pet = {
    execute: function(context, args) {
      dogGotPetted = args.object.text;
    },
    names: ["pet"],
    arguments: [
      {role: 'object', nountype: dog}
    ]
  };

  var self = this;
  var testFunc = function(completions) {
    self.assert( completions.length == 2, "should be 2 completions" );
    self.assert( completions[0]._verb.text == "pet", "verb should be pet");
    self.assert( completions[0].args.object[0].text == "beagle",
      "obj should be beagle");
    self.assert( completions[1]._verb.text == "pet", "verb should be pet");
    self.assert( completions[1].args.object[0].text == "bulldog",
      "obj should be bulldog");
    completions[0].execute();
    self.assert( dogGotPetted == "beagle");
    completions[1].execute();
    self.assert( dogGotPetted == "bulldog" );
  };

  getCompletionsAsync( "pet b", [cmd_pet], null,
                       self.makeCallback(testFunc) );
}


function testParserTwoParseWithModifier() {
  // wash dog with sponge
  var dogGotWashed = null;
  var dogGotWashedWith = null;
  var dog = new NounUtils.NounType( "dog", ["poodle", "golden retreiver",
                                            "beagle", "bulldog", "husky"]);
  var washingObj = new NounUtils.NounType( "washing object",
                                           ["sponge", "hose", "spork",
                                            "bathtub", "fire hose"]);
  var cmd_wash = {
    execute: function(context, args) {
      dogGotWashed = args.object.text;
      dogGotWashedWith = args.instrument.text;
    },
    names: ["wash"],
    arguments: [
      {role: "object", nountype: dog},
      {role: "instrument", nountype: washingObj}
    ]
  };

  var inputWords = "wash pood with sp";

  var self = this;
  var testFunc = function(completions) {
    self.assert( completions.length == 2, "Should be 2 completions" );
    completions[0].execute();
    self.assert( dogGotWashed == "poodle");
    self.assert( dogGotWashedWith == "sponge");
    completions[1].execute();
    self.assert( dogGotWashed == "poodle");
    self.assert( dogGotWashedWith == "spork");
  };

  getCompletionsAsync( inputWords, [cmd_wash], null,
                       self.makeCallback(testFunc));
}

function testSimplifiedParserTwoApi() {
  var dogGotWashed = null;
  var dogGotWashedWith = null;
  var dog = new NounUtils.NounType( "dog", ["poodle", "golden retreiver",
                                            "beagle", "bulldog", "husky"]);
  var washingObj = new NounUtils.NounType( "washing object",
                                           ["sponge", "hose", "spork",
                                            "bathtub", "fire hose"]);
  var cmd_wash = makeCommand({
    execute: function(args) {
      dogGotWashed = args.object.text;
      dogGotWashedWith = args.instrument.text;
    },
    names: ["wash"],
    arguments: { object: dog, instrument: washingObj }
  });

  var inputWords = "wash pood with sp";
  var self = this;
  var testFunc = function(completions) {
    self.assert( completions.length == 2, "Should be 2 completions" );
    self.assert( completions[0]._verb.name == "wash", "Should be named wash");
    self.assert( completions[0].args["object"][0].text == "poodle",
                "Object should be poodle");
    self.assert( completions[0].args["instrument"][0].text == "sponge",
                "Instrument should be sponge");
    self.assert( completions[1]._verb.name == "wash", "Should be named wash");
    self.assert( completions[1].args["object"][0].text == "poodle",
                "Object should be poodle");
    self.assert( completions[1].args["instrument"][0].text == "spork",
                "Instrument should be spork");

    completions[0].execute();
    self.assert( dogGotWashed == "poodle");
    self.assert( dogGotWashedWith == "sponge");
    completions[1].execute();
    self.assert( dogGotWashed == "poodle");
    self.assert( dogGotWashedWith == "spork");
  };

  getCompletionsAsync( inputWords, [cmd_wash], null,
                       this.makeCallback(testFunc));
}

function testCmdManagerSuggestsForNounFirstInput() {
  var oneWasCalled = false;
  var twoWasCalled = false;
  var nounTypeOne = new NounUtils.NounType( "thingType", ["tree"] );
  var nounTypeTwo = new NounUtils.NounType( "stuffType", ["mud"] );

  var fakeSource = new BetterFakeCommandSource({
    cmd_one: {
      names: ["one"],
      execute: function(args) {
        if (args.object)
          oneWasCalled = args.object.text;
      },
      arguments: { object: nounTypeOne }
    },
    cmd_two: {
      names: ["two"],
      execute: function(args) {
        if (args.object)
          twoWasCalled = args.object.text;
      },
      arguments: { object: nounTypeTwo }
    }
  });

  var cmdMan = makeCommandManager.call(this, fakeSource, null,
                                       makeTestParser2(),
                                       onCM);
  var noSelection = { textSelection: null, htmlSelection: null };
  var self = this;
  function onCM(cmdMan) {
    cmdMan.updateInput(
      "tree",
      noSelection,
      self.makeCallback(
        function() {
          self.assert( cmdMan.hasSuggestions() );
          cmdMan.execute(noSelection);
          self.assert( oneWasCalled == "tree",
                       "Should have called cmdOne with text selection tree.");
        }
      )
    );
    // TODO I want to put a second test using input "mud", but if they
    // run at the same time the second one will cancel the first one.
  }
}

// TODO a test like above, but update input twice and make sure the second
// one cancels the first one!

/* TODO one like above but only goint through parser, should be able to run
 * two queries at once and not have them interfere with each other...
 */

function testCmdManagerSuggestsForEmptyInputWithSelection() {
  var oneWasCalled = false;
  var twoWasCalled = false;
  var nounTypeOne = new NounUtils.NounType( "thingType", ["tree"] );
  var nounTypeTwo = new NounUtils.NounType( "stuffType", ["mud"] );

  var fakeSource = new BetterFakeCommandSource({
    cmd_one: {
      names: ["one"],
      execute: function(args) {
        oneWasCalled = args.object.text;
      },
      arguments: { object: nounTypeOne }
    },
    cmd_two: {
      names: ["two"],
      execute: function(args) {
        twoWasCalled = args.object.text;
      },
      arguments: { object: nounTypeTwo }
    }
  });

  var cmdMan = makeCommandManager.call(this, fakeSource, null,
                                       makeTestParser2(),
                                       onCM);
  // The commented-out stuff can be un-commented once implicit
  // selection interpolation is hapening: see #732 (and #722)
  var self = this;
  function onCM(cmdMan) {
    cmdMan.getSuggestionListNoInput(
      {textSelection:"tree"},
      self.makeCallback(
        function( suggestionList ) {
          /*self.assert( suggestionList.length == 1,
                        "Should be only one suggestion." ) */
          dump("SuggestionList[0].name is " + suggestionList[0]._verb.name + "\n");
          self.assert( suggestionList[0]._verb.name == "one",
                      "cmd one should be it" );
          //suggestionList[0].execute();
          /*self.assert( oneWasCalled == "tree",
                       "Should have been called with text selection tree.");*/
        }
      )
    );
    cmdMan.getSuggestionListNoInput(
      {textSelection:"mud"},
      self.makeCallback(
        function( suggestionList ) {
          /*self.assert( suggestionList.length == 1,
                        "Should be only one suggestion." ) */
          /*self.assert( suggestionList[0].name == "two",
                      "cmd two should be it" );*/
          //suggestionList[0].execute();
          /*self.assert( twoWasCalled == "mud",
                       "Should have been called with text selection mud.");*/
        }
      )
    );
  }
}

function testVerbMatcher() {
  var testParser = new Parser;
  testParser._verbList =
    [{names: ["google"], arguments: []},
     {names: ["check livemark"], arguments: []},
     {names: ["undo closed tabs"], arguments: []}];
  testParser.initializeCache();

  var {verbInitialTest} = testParser._patternCache;
  this.assert(verbInitialTest.test("undo closed tabs"), "whole");
  this.assert(!verbInitialTest.test("gooooogle"), "wrong");
  this.assert(verbInitialTest.test("goog"), "head-prefix");
  this.assert(verbInitialTest.test("live"), "middle-prefix");
  this.assert(verbInitialTest.test("tab"), "middle-prefix again");
}

// TODO: Failing, but I think it's failing for the same reason as
// testNounsWithDefaults is failing.
function testPluginRegistry() {
  var twitterGotShared = null;
  var diggGotShared = null;
  var deliciousGotShared = null;
  var executedPlugin = null;

  var cmdSharify = makeCommand({
    names: ["sharify"],
    arguments: [ {role: "object",
                  nountype: /.*/,
                  label: "message"},
               {role: "instrument",
                nountype: CmdUtils.pluginNoun("sharify"),
                label: "sharify service provider"}],
    preview: function(pblock, args) {
      if (args.object)
        pblock.innerHTML = "Sharifies <b>" + args.object.text + "</b> using the selected service provider.";
      else
        pblock.innerHTML = "Adds a thing to your notes.";
    },
    execute: CmdUtils.executeBasedOnPlugin("sharify", "instrument")
  });

  CmdUtils.registerPlugin( "sharify", "twitter",
                           function(args) {
                             executedPlugin = "twitter";
                             twitterGotShared = args.object.text;
                           });
  CmdUtils.registerPlugin( "sharify", "digg",
                           function(args) {
                             executedPlugin = "digg";
                             diggGotShared = args.object.text;
                           });
  CmdUtils.registerPlugin( "sharify", "delicious",
                           function(args) {
                             executedPlugin = "delicious";
                             deliciousGotShared = args.object.text;
                          });

  var self = this;
  var testFunc = function(completions) {
    for each ( var comp in completions ) {
      dump("Completion is " + comp.displayText + "\n");
    }
    // What? Getting 10 suggestions here instead of 2.  TODO!
    self.assert( completions.length == 2, "Should be 2 completions" );
    self.assert( completions[0]._verb.name == "sharify", "Should be named sharify");
    self.assert( completions[0].args["instrument"][0].text == "digg",
                "Instrument should be digg");
    self.assert( completions[1].args["object"][0].text == "stuff",
                "Object should be stuff.");

    self.assert( completions[1]._verb.name == "sharify", "Should be named sharify");
    self.assert( completions[1].args["instrument"][0].text == "delicious",
                "Instrument should be delicious");
    self.assert( completions[1].args["object"][0].text == "stuff",
                "Object should be stuff.");

    completions[0].execute();
    self.assert( executedPlugin == "digg");
    self.assert( diggGotShared == "stuff");
    completions[1].execute();
    self.assert( executedPlugin == "delicious");
    self.assert( deliciousGotShared == "stuff");
  };

  getCompletionsAsync( "sharify stuff with d", [cmdSharify], null,
                       this.makeCallback(testFunc));

}

// TODO: failing -- see bug 756
function testNounsWithDefaults() {
  var nounValues = ["home", "work", "school"];
  var nounWithDefaults = {
    suggest: function(text, html, callback, selectionIndices) {
      return CmdUtils.grepSuggs(text, [CmdUtils.makeSugg(x) for each (x in nounValues)]);
    },
    default: function() {
      return [CmdUtils.makeSugg("home")];
    }
  };
  var cmdDrive = makeCommand({
    names: ["drive"],
    arguments: [ {role: "goal",
                  nountype: nounWithDefaults,
                  label: "location"}],
    preview: function(pblock, args) {
    },
    execute: function(args) {
    }
  });

  var self = this;
  var testFunc = function(completions) {
    for each ( var comp in completions ) {
      dump("Completion is " + comp.displayText + "\n");
    }

    self.assert( completions.length == 1, "Should be 1 completion" );
    self.assert( completions[0]._verb.name == "drive", "Should be named drive");
    self.assert( completions[0].args["goal"][0].text == "home",
                "goal should be home.");
  };

  getCompletionsAsync( "drive", [cmdDrive], null,
                       this.makeCallback(testFunc));

}

// TODO: Failing -- gets weak- medium-strong instead of
// expected strong - medium - weak.  Also all the arguments are 'dentist'
// which is very weird.
function testVariableNounWeights() {
  var weakNoun = {
    suggest: function(text, html, cb, selectionIndices) {
      if (text.indexOf("de") != -1) {
        return [CmdUtils.makeSugg("dentist", null, null, 0.5)];
      } else {
        return [];
      }
    }
  };

  var mediumNoun = {
    suggest: function(text, html, cb, selectionIndices) {
      if (text.indexOf("de") != -1) {
        return [CmdUtils.makeSugg("deloused", null, null, 1.0)];
      } else {
        return [];
      }
    }
  };

  var strongNoun = {
    suggest: function(text, html, cb, selectionIndices) {
      if (text.indexOf("de") != -1) {
        return [CmdUtils.makeSugg("decapitation", null, null, 2.0)];
      } else {
        return [];
      }
    }
  };

  var weakVerb = makeCommand({
    names: ["weak verb"],
    arguments: {object: weakNoun},
    execute: function(args) {}
  });
  var mediumVerb = makeCommand({
    names: ["medium verb"],
    arguments: {object: mediumNoun},
    execute: function(args) {}
  });
  var strongVerb = makeCommand({
    names: ["strong verb"],
    arguments: {object: strongNoun},
    execute: function(args) {}
  });


  var self = this;
  var testFunc = function(completions) {
    for each ( var comp in completions ) {
      dump("Completion is " + comp.displayText + "\n");
    }

    self.assert( completions.length == 3, "Should be 3 completions" );
    self.assert( completions[0]._verb.name == "strong verb",
                 "Should be named strong verb");
    self.assert( completions[1]._verb.name == "medium verb",
                 "Should be named medium verb");
    self.assert( completions[2]._verb.name == "weak verb",
                 "Should be named weak verb");
  };

  getCompletionsAsync( "de", [weakVerb, mediumVerb, strongVerb], null,
                       this.makeCallback(testFunc));

}

// Work in progress:
function testSortedBySuggestionMemoryParser2Version() {
  var fakeSource = new BetterFakeCommandSource({
    clock: {names: ["clock"], execute: function(){}},
    calendar: {names: ["calendar"], execute: function(){}},
    couch: {names: ["couch"], execute: function(){}},
    conch: {names: ["conch"], execute: function(){}},
    crouch: {names: ["crouch"], execute: function(){}},
    coelecanth: {names: ["coelecanth"], execute: function(){}},
    crab: {names: ["crab"], execute: function(){}}
    });

  var parser = makeTestParser2(LANG, fakeSource.getAllCommands());

  var self = this;
  
  var testFunc2 = function(completions) {
    // This time around, coelecanth should be top hit because
    // of suggestion memory.  Clock should be #2.
    self.assert( completions[0].displayText.indexOf("coelecanth") > -1,
                "0th suggestion should be coelecanth" );
    self.assert( completions[1].displayText.indexOf("clock") > -1,
                "1st suggestion should be clock" );
  };

  var testFunc = function(completions) {
    self.assert( completions[0].displayText.indexOf("clock") > -1,
                "0th suggestion should be clock" );
    self.assert( completions[5].displayText.indexOf("coelecanth") > -1,
                "5th suggestion should be coelecanth" );

    // Now strengthen suggestion memory on "c" -> coelecanth...
    parser.strengthenMemory("c", completions[5]);
    // Now try a new completion...
    getCompletionsAsyncFromParser("c", parser, null,
                                  self.makeCallback(testFunc2));
  };


  getCompletionsAsyncFromParser("c", parser, null,
                                self.makeCallback(testFunc));


}
// TODO could also do the above test through command manager and
// BetterFakeCommandSource, using cmdMan.execute and ensuring that
// the memory is strengthenend.


/* More tests that should be written:
 *   -- For the context menu bug (use cmdmanager.makeCommandSuggester())
 *   -- Coexistence of two verbs with the same name (modulo parens)
 *   -- For internationalization
 *   -- Bring over all the unit tests from parser 1 and modify them to work!
 *   -- For makeSearchCommand (before turning it into plugin)
 *   -- For async noun suggestion
 *   -- Test that basic nountype from array uses whole array as defaults
 */

/*
function testNounTypeSpeed() {
  var slownoun = new NounUtils.NounType('anything');
  slownoun.suggest = function(text) {
    dump('checking '+text+'\n');
    var start = new Date();
    var now = null;
    do { now = new Date(); }
    while(now - start < 1000);
    return [ NounUtils.makeSugg(text) ];
  };

  var cmd_hit = {

    execute: function(context, args) {
      dogGotPetted = args.object.text;
    },
    names: {
      en: ["hit"]
    },
    arguments: [
      {role: 'object', nountype: slownoun}
    ]
  };
  var completions = getCompletions( "hit me", [cmd_hit], [slownoun], null );
  dump("Completions are: " + completions + "\n");
  dump("First verb is " + completions[0]._verb.text + "\n");
  this.assert( completions.length == 2, "should be 2 completions" );
}
*/

exportTests(this);
