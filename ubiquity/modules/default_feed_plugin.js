/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Ubiquity.
 *
 * The Initial Developer of the Original Code is Mozilla.
 * Portions created by the Initial Developer are Copyright (C) 2007
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *   Atul Varma <atul@mozilla.com>
 *   Jono DiCarlo <jdicarlo@mozilla.com>
 *   Blair McBride <unfocused@gmail.com>
 *   Michael Yoshitaka Erlewine <mitcho@mitcho.com>
 *   Satoshi Murakami <murky.satyr@gmail.com>
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

var EXPORTED_SYMBOLS = ["DefaultFeedPlugin"];

const {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://ubiquity/modules/utils.js");
Cu.import("resource://ubiquity/modules/codesource.js");
Cu.import("resource://ubiquity/modules/sandboxfactory.js");
Cu.import("resource://ubiquity/modules/feed_plugin_utils.js");

const CONFIRM_URL = "chrome://ubiquity/content/confirm-add-command.xhtml";
const DEFAULT_FEED_TYPE = "commands";
const TRUSTED_DOMAINS_PREF = "extensions.ubiquity.trustedDomains";
const REMOTE_URI_TIMEOUT_PREF = "extensions.ubiquity.remoteUriTimeout";
const COMMANDS_BIN_PREF = "extensions.ubiquity.commands.bin";

function DefaultFeedPlugin(feedManager, messageService, webJsm,
                           languageCode, baseUri, parserVersion) {
  this.type = DEFAULT_FEED_TYPE;

  let builtins = makeBuiltins(languageCode, baseUri, parserVersion);
  let builtinGlobalsMaker = makeBuiltinGlobalsMaker(messageService, webJsm);
  let sandboxFactory = new SandboxFactory(builtinGlobalsMaker);

  for (let [title, url] in new Iterator(builtins.feeds))
    feedManager.addSubscribedFeed({
      url: url,
      sourceUrl: url,
      canAutoUpdate: true,
      isBuiltIn: true,
      title: title,
    });

  this.installDefaults = function DFP_installDefaults(baseUri,
                                                      baseLocalUri,
                                                      infos) {
    for each (let info in infos) {
      let uri = Utils.url(baseUri + info.page);

      if (!feedManager.isUnsubscribedFeed(uri)) {
        let lcs = new LocalUriCodeSource(baseLocalUri + info.source);
        feedManager.addSubscribedFeed({
          url: uri,
          sourceUrl: baseUri + info.source,
          sourceCode: lcs.getCode(),
          canAutoUpdate: true,
          title: info.title});
      }
    }
  };

  this.onSubscribeClick = function DFP_onSubscribeClick(targetDoc,
                                                        commandsUrl,
                                                        mimetype) {
    var {location} = targetDoc;
    // Clicking on "subscribe" takes them to the warning page:
    var confirmUrl = CONFIRM_URL + Utils.paramsToString({
      url: location.href,
      sourceUrl: commandsUrl,
      title: Utils.gist.getName(targetDoc) || targetDoc.title,
    });

    if (!isTrustedUrl(commandsUrl, mimetype)) {
      Utils.openUrlInBrowser(confirmUrl);
      return;
    }

    function onSuccess(data) {
      feedManager.addSubscribedFeed({
        url: location.href,
        sourceUrl: commandsUrl,
        canAutoUpdate: true,
        sourceCode: data});
      Utils.openUrlInBrowser(confirmUrl);
    }

    if (RemoteUriCodeSource.isValidUri(commandsUrl))
      webJsm.jQuery.ajax({
        url: commandsUrl,
        dataType: "text",
        success: onSuccess});
    else
      onSuccess("");
  };

  this.makeFeed = function DFP_makeFeed(baseFeedInfo, hub) {
    return new DFPFeed(baseFeedInfo, hub, messageService, sandboxFactory,
                       builtins.headers, builtins.footers,
                       webJsm.jQuery);
  };

  feedManager.registerPlugin(this);
}

function isTrustedUrl(commandsUrl, mimetype) {
  // Even if the command feed resides on a trusted host, if the
  // mime-type is application/x-javascript-untrusted or
  // application/xhtml+xml-untrusted, the host itself doesn't
  // trust it (perhaps because it's mirroring code from
  // somewhere else).
  if (mimetype === "application/x-javascript-untrusted" ||
      mimetype === "application/xhtml+xml-untrusted") return false;

  var {scheme, host} = Utils.uri(commandsUrl);
  if (scheme !== "https") return false;

  let domains = Utils.prefs.getValue(TRUSTED_DOMAINS_PREF, "").split(",");
  for each (let d in domains) if (d === host) return true;

  return false;
}

DefaultFeedPlugin.makeCmdForObj = makeCmdForObj;

function makeCmdForObj(sandbox, commandObject, feedUri) {
  // referenceName is set by CreateCommand, so this command must have
  // bypassed CreateCommand. Let's set the referenceName here.
  if (!("referenceName" in commandObject))
    commandObject.referenceName = commandObject.name;

  var cmd = {
    __proto__: commandObject,
    id: feedUri.spec + "#" + commandObject.referenceName,
    feedUri: feedUri,
    toString: function CS_toString() {
      return "[object UbiquityCommand " + this.name + "]";
    },
    execute: function CS_execute(context) {
      if (context) {
        context.l10n = commandObject.referenceName + ".execute";
        sandbox.context = context;
      }
      return commandObject.execute.apply(cmd, Array.slice(arguments, 1));
    },
    preview: function CS_preview(context) {
      if (context) {
        context.l10n = commandObject.referenceName + ".preview";
        sandbox.context = context;
      }
      return commandObject.preview.apply(cmd, Array.slice(arguments, 1));
    },
  };

  if (!("serviceDomain" in commandObject)) {
    let domainRE = /\bhttps?:\/\/([\w.-]+)/;
    cmd.serviceDomain = ((domainRE.test(commandObject.url) ||
                          domainRE.test(commandObject.execute) ||
                          domainRE.test(commandObject.preview))
                         ? RegExp.$1
                         : null);
    // TODO: also check for serviceDomain in Utils.getCookie type code
  }

  return finishCommand(cmd);
}

function makeCodeSource(feedInfo, headerSources, footerSources) {
  var codeSource, {srcUri} = feedInfo;

  if (RemoteUriCodeSource.isValidUri(srcUri))
    codeSource = new RemoteUriCodeSource(
      feedInfo,
      (feedInfo.canAutoUpdate
       ? Utils.prefs.getValue(REMOTE_URI_TIMEOUT_PREF, 10)
       : -1));
  else if (LocalUriCodeSource.isValidUri(srcUri))
    codeSource = new LocalUriCodeSource(srcUri.spec);
  else
    //errorToLocalize
    throw new Error("Don't know how to make code source for " + srcUri.spec);

  codeSource = new XhtmlCodeSource(codeSource);

  codeSource = new MixedCodeSource(codeSource,
                                   headerSources,
                                   footerSources);

  return codeSource;
}

function DFPFeed(feedInfo, hub, messageService, sandboxFactory,
                 headerSources, footerSources, jQuery) {
  if (LocalUriCodeSource.isValidUri(feedInfo.srcUri))
    this.canAutoUpdate = true;
  if (feedInfo.isBuiltIn)
    for (let [k, v] in new Iterator(BuiltInFeedProto)) feedInfo[k] = v;

  var self = this;
  var codeSource = makeCodeSource(feedInfo, headerSources, footerSources);
  var sandbox = null;
  var bin = feedInfo.makeBin();

  function reset() {
    self.commands = {};
  }

  reset();

  this.refresh = function refresh(anyway) {
    var code = codeSource.getCode();
    if (anyway || codeSource.updated) {
      reset();
      sandbox = sandboxFactory.makeSandbox(codeSource);
      sandbox.Bin = bin;
      try {
        sandboxFactory.evalInSandbox(code,
                                     sandbox,
                                     codeSource.codeSections);
      } catch (e) {
        //errorToLocalize
        messageService.displayMessage({
          text: "An exception occurred while loading code.",
          exception: e,
        });
      }

      for each (let cmd in sandbox.commands) {
        let newCmd = makeCmdForObj(sandbox, cmd, feedInfo.uri);
        this.commands[newCmd.id] = newCmd;
      }

      for each (let p in ["pageLoadFuncs", "ubiquityLoadFuncs"])
        this[p] = sandbox[p];

      hub.notifyListeners("feed-change", feedInfo.uri);
    }
  };

  this.checkForManualUpdate = function checkForManualUpdate(cb) {
    if (LocalUriCodeSource.isValidUri(this.srcUri)) {
      cb(false);
      return;
    }

    function onSuccess(data) {
      if (data === self.getCode())
        cb(false);
      else
        cb(true, CONFIRM_URL + Utils.paramsToString({
          url: self.uri.spec,
          sourceUrl: self.srcUri.spec,
          updateCode: data,
        }));
    }
    jQuery.ajax({
      url: this.srcUri.spec,
      dataType: "text",
      success: onSuccess,
      error: function onError() { cb(false) },
    });
  };

  this.finalize = function finalize() {
    // Not sure exactly why, but we get memory leaks if we don't
    // manually remove these.
    jQuery = sandbox.jQuery = sandbox.$ = null;
  };

  this.__proto__ = feedInfo;
}

function makeBuiltinGlobalsMaker(msgService, webJsm) {
  webJsm.importScript("resource://ubiquity/scripts/jquery.js");
  webJsm.importScript("resource://ubiquity/scripts/jquery_setup.js");
  webJsm.importScript("resource://ubiquity/scripts/template.js");
  webJsm.importScript("resource://ubiquity/scripts/date.js");

  var globalObjects = {};

  return function makeGlobals(codeSource) {
    var {id} = codeSource;
    if (!(id in globalObjects)) globalObjects[id] = {};

    return {
      XPathResult: webJsm.XPathResult,
      XMLHttpRequest: webJsm.XMLHttpRequest,
      jQuery: webJsm.jQuery,
      $: webJsm.jQuery,
      Template: webJsm.TrimPath,
      Application: webJsm.Application,
      Date: webJsm.Date,
      KeyEvent: webJsm.KeyEvent,
      Components: Components,
      feed: {id: id, dom: codeSource.dom},
      context: {},
      commands: [],
      pageLoadFuncs: [],
      ubiquityLoadFuncs: [],
      globals: globalObjects[id],
      displayMessage: function displayMessage(msg, cmd) {
        if (Utils.classOf(msg) !== "Object") msg = {text: msg};
        if (cmd) {
          msg.icon  = cmd.icon;
          msg.title = cmd.name;
        }
        msgService.displayMessage(msg);
      }
    };
  }
}

function makeBuiltins(languageCode, baseUri, parserVersion) {
  var basePartsUri = baseUri + "feed-parts/";
  var baseFeedsUri = baseUri + "builtin-feeds/";
  //var baseScriptsUri = baseUri + "scripts/";
  return {
    feeds: {"Builtin Commands": baseFeedsUri + "builtincmds.js"},
    headers: [new LocalUriCodeSource(basePartsUri + "header/initial.js")],
    footers: [new LocalUriCodeSource(basePartsUri + "footer/final.js")],
  };
}

var BuiltInFeedProto = {
  getJSONStorage: function BF_getJSONStorage()
    Utils.json.decode(Utils.prefs.getValue(COMMANDS_BIN_PREF, "{}")),
  setJSONStorage: function BF_setJSONStorage(obj) {
    var data = Utils.json.encode(obj);
    Utils.prefs.setValue(COMMANDS_BIN_PREF, data);
    return Utils.json.decode(data);
  },
};
