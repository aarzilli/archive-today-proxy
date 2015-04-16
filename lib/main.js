const {Cc,Ci,Cr} = require("chrome");
var Request = require("sdk/request").Request;
var tabs = require("sdk/tabs");
var self = require("sdk/self");
var contextMenu = require("sdk/context-menu")
var sprefs = require('sdk/simple-prefs');

var proxiedDomains = [];

var observer = {
	redirect: function(subject, topic, data, channel, host, orig) {
		var interfaceRequestor = channel.notificationCallbacks.QueryInterface(Ci.nsIInterfaceRequestor);
		var loadContext;
		try {
			loadContext = interfaceRequestor.getInterface(Ci.nsILoadContext);
		} catch (ex) {
			try {
				loadContext = subject.loadGroup.notificationCallbacks.getInterface(Ci.nsILoadContext);
			} catch (ex2) {
			}
		}

		if (loadContext) {
			var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
			//console.log("Redirecting", orig);
			channel.redirectTo(ioService.newURI("https://archive.today/timegate/" + orig, "UTF-8", null));

			// This is copied from MDN examples I have no fucking clue what this does

			var contentWindow = loadContext.associatedWindow;
			var aDOMWindow = contentWindow.top.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIWebNavigation).QueryInterface(Ci.nsIDocShellTreeItem).rootTreeItem.QueryInterface(Ci.nsIInterfaceRequestor).getInterface(Ci.nsIDOMWindow);
			var gBrowser = aDOMWindow.gBrowser;
			var aTab = gBrowser._getTabForContentWindow(contentWindow.top);
			var newTabBrowser = gBrowser.getBrowserForTab(aTab);
			aTab.addEventListener("load", function() {
				if (newTabBrowser.contentDocument != null) {
					var content = newTabBrowser.contentDocument.getElementById("CONTENT");
					if ((content != null) && (content.innerHTML.match(/^\s*No results/))) {
						newTabBrowser.loadURI("https://archive.today/?run=1&url=" + encodeURI(orig));
					}
				}
			});
		}
	},

	observe: function(subject, topic, data) {
		if (topic != "http-on-modify-request") {
			return;
		}

		var channel = subject.QueryInterface(Ci.nsIHttpChannel);

		var host = channel.URI.host;
		var orig = channel.URI.spec;

		for (var i = 0; i < proxiedDomains.length; i++) {
			if (host.indexOf(proxiedDomains[i], host.length - proxiedDomains[i].length) !== -1) {
				this.redirect(subject, topic, data, channel, host, orig);
				break;
			}
		}
	},

	get observerService(){
		return Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
	},

	register: function() {
		this.observerService.addObserver(this,"http-on-modify-request",false);
		sprefs.on("proxiedDomains", this.reloadProxiedDomains);
	},

	unregister: function() {
		this.observerService.removeObserver(this,"http-on-modify-request")
	},

	reloadProxiedDomains: function() {
		var pds = sprefs.prefs["proxiedDomains"];
		var v = pds.split(",");
		proxiedDomains = [];
		for (var i = 0; i < v.length; i++) {
			var s = v[i].trim();
			if (s != "") {
				proxiedDomains.push(s);
			}
		}
	}
};

exports.main = function() {
	pLink = contextMenu.Item({
		context: contextMenu.PageContext(),
		label: "Archive this page",
		contentScriptFile: self.data.url("current.js"),
		onMessage: function(page){
			tabs.activeTab.url = "https://archive.today/?run=1&url=" + encodeURI(page);
		}
	});
	observer.register();
	observer.reloadProxiedDomains();
}

exports.onUnload = function(){
	observer.unregister();
};
