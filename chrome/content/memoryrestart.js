if ("undefined" == typeof(TeamEXtension)) {
	var TeamEXtension = {};
};

TeamEXtension.intervalId;

TeamEXtension.MemoryRestart = {
	onLoad: function() {
		var prefs = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).getBranch("extensions.memoryrestart.");
		prefs.QueryInterface(Ci.nsIPrefBranch2);
		prefs.addObserver("", this, false);
		
		try {
			Components.utils.import("resource://gre/modules/AddonManager.jsm");
			this.listener = {
				onUninstalling: function onUninstalling(addon) {
					TeamEXtension.MemoryRestart.prefCleanUp(addon);
					prefs.removeObserver("", this);
				},
			};
			AddonManager.addAddonListener(this.listener); 

			this.installListener = {
				onInstallEnded: function (install, addon) {
					TeamEXtension.MemoryRestart.prefCleanUp(addon);
					prefs.removeObserver("", this);
				},
			};
			AddonManager.addInstallListener(this.installListener);
		} catch(e) {
			//observerService.addObserver(this, "em-action-requested", false);
		}
		
		if (this.firstRun()) {
			this.addToolbarButton();
		}

		this.checkVersion();
		
		var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
		var refreshInterval = prefService.getIntPref("extensions.memoryrestart.refreshinterval");
				
		this.refreshMemory();
		TeamEXtension.intervalId = window.setInterval(function() { TeamEXtension.MemoryRestart.refreshMemory(); }, refreshInterval * 1000);
	},
	
	refreshMemory: function()
	{
		var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
		var memoryReporterManager = Cc["@mozilla.org/memory-reporter-manager;1"].getService(Ci.nsIMemoryReporterManager);
		
		var check_malloc_mapped = true;
		var check_resident = true;
		var check_private = true;
		
		var memoryUsed = 0;
		var e = memoryReporterManager.enumerateReporters();
		while (e.hasMoreElements() && (check_malloc_mapped || check_resident || check_private)) {
			var mr = e.getNext().QueryInterface(Ci.nsIMemoryReporter);
			
			if (check_malloc_mapped && (mr.path == "malloc/mapped")) { // ff6 below only
				var memoryUsed_malloc_mapped = mr.memoryUsed;
				if (memoryUsed_malloc_mapped != undefined && memoryUsed < memoryUsed_malloc_mapped) {
					memoryUsed = memoryUsed_malloc_mapped;
				}
				check_malloc_mapped = false;
			}
			if (check_resident && (mr.path == "resident")) { // starting ff6
				var memoryUsed_resident = mr.memoryUsed;
				if (memoryUsed_resident == undefined) { // ff7 started using "amount"
					memoryUsed_resident = mr.amount;
				}
				if (memoryUsed_resident != undefined && memoryUsed < memoryUsed_resident) {
					memoryUsed = memoryUsed_resident;
				}
				check_resident = false;
			}
			if (check_private && (mr.path == "private")) { // starting ff6
				var memoryUsed_private = mr.memoryUsed;
				if (memoryUsed_private == undefined) { // ff7 started using "amount"
					memoryUsed_private = mr.amount;
				}
				if (memoryUsed_private != undefined && memoryUsed < memoryUsed_private) {
					memoryUsed = memoryUsed_private;
				}
				check_private = false;
			}
		}

		var memoryrestartToolbar = document.getElementById('memoryrestart-button');
		var memoryrestartPanel = document.getElementById('memoryrestart-panel');
		
		var memoryUsedInMB = memoryUsed / (1024 * 1024);
		memoryUsedInMB = memoryUsedInMB.toFixed();
		memoryrestartPanel.label = memoryUsedInMB + "MB";

		var strings = document.getElementById("memoryrestart-strings");
		var memoryLimit = prefService.getIntPref("extensions.memoryrestart.memorylimit");
		if (memoryLimit < memoryUsedInMB) {
			var colorAboveLimit = prefService.getCharPref("extensions.memoryrestart.colorabovelimit");
			memoryrestartPanel.style.color = colorAboveLimit;
			memoryrestartPanel.tooltipText = strings.getString("extensions.memoryrestart.tooltip.high");
			if (memoryrestartToolbar != null) {
				memoryrestartToolbar.style.listStyleImage = "url('chrome://memoryrestart/skin/above16.png')";
				memoryrestartToolbar.tooltipText = memoryUsedInMB + "MB";
			}
			var autoRestart = prefService.getBoolPref("extensions.memoryrestart.autorestart");
			if (autoRestart) {
				var observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
				var canceled = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
				observerService.notifyObservers(canceled, "quit-application-requested", "restart");
				 
				if (canceled.data) return; // somebody canceled our quit request

				var autoRestartDelay = prefService.getIntPref("extensions.memoryrestart.autorestart.delay");
				window.setTimeout(function() { TeamEXtension.MemoryRestart.restartAPI(); }, autoRestartDelay * 1000);
			}
		} else {
			var colorBelowLimit = prefService.getCharPref("extensions.memoryrestart.colorbelowlimit");
			memoryrestartPanel.style.color = colorBelowLimit;
			memoryrestartPanel.tooltipText = strings.getString("extensions.memoryrestart.tooltip.normal");
			if (memoryrestartToolbar != null) {
				memoryrestartToolbar.style.listStyleImage = "url('chrome://memoryrestart/skin/below16.png')";
				memoryrestartToolbar.tooltipText = memoryUsedInMB + "MB";
			}
		}
	},

	restartFirefox: function()
	{
		var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
		var showprompt = prefService.getBoolPref("extensions.memoryrestart.showprompt");
		if (showprompt) {
			var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
			var strings = document.getElementById("memoryrestart-strings");
			
			if (prompts.confirm(window, strings.getString("extensions.memoryrestart.label"), strings.getString("extensions.memoryrestart.prompt"))) {
				this.quit();
			}
		} else {
			this.quit();
		}
	},
	
	restartAPI: function()
	{
		var appStartup = Cc['@mozilla.org/toolkit/app-startup;1'].getService(Ci.nsIAppStartup);
		appStartup.quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
		//appStartup.quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eForceQuit);
		
		// Firefox 4
		// Components.utils.import("resource://gre/modules/Services.jsm");
		// if (Services.wm.getMostRecentWindow("navigator:browser").canQuitApplication()) {
		//     var appStartup = Cc['@mozilla.org/toolkit/app-startup;1'].getService(Ci.nsIAppStartup);
		//     appStartup.quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
		// }
	},

	logToConsole: function(message)
	{
		var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
		consoleService.logStringMessage(message);
	},

	firstRun: function() {
		var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
		var version = prefService.getCharPref("extensions.memoryrestart.version");
		return version == "0";
	},
	
	quit: function() {
		var observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
		var canceled = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
		observerService.notifyObservers(canceled, "quit-application-requested", "restart");
		 
		if (canceled.data) return; // somebody canceled our quit request

		this.restartAPI();
	},

	addToolbarButton: function() {
		var toolbarId = "memoryrestart-button";
		var afterId = "urlbar-container";
		var navBar = document.getElementById("nav-bar");
		var curSet = navBar.currentSet.split(",");

		if (curSet.indexOf(toolbarId) == -1) {
		    var pos = curSet.indexOf(afterId) + 1 || curSet.length;
		    var set = curSet.slice(0, pos).concat(toolbarId).concat(curSet.slice(pos));

		    navBar.setAttribute("currentset", set.join(","));
		    navBar.currentSet = set.join(",");
		    document.persist(navBar.id, "currentset");
		    try {
		        BrowserToolboxCustomizeDone(true);
		    }
		    catch (e) {}
		}
	},

	checkVersion: function() {
		try {
		    // Firefox 4+
		    Components.utils.import("resource://gre/modules/AddonManager.jsm");
		    AddonManager.getAddonByID("memoryrestart@teamextension.com", function(addon) {
		    	TeamEXtension.MemoryRestart.checkVersionCallback(addon.version);
		    });
		} catch (e) {
		    // Firefox 3.6
		    var em = Cc["@mozilla.org/extensions/manager;1"].getService(Ci.nsIExtensionManager);
		    var addon = em.getItemForID("memoryrestart@teamextension.com");
		    this.checkVersionCallback(addon.version);
		}
	},
	
	checkVersionCallback: function(version) {
		var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
		var prevVersion = prefService.getCharPref("extensions.memoryrestart.version");
		
		if (version != prevVersion) {
			prefService.setCharPref("extensions.memoryrestart.version", version);
			var strings = document.getElementById("memoryrestart-strings");
			gBrowser.selectedTab = gBrowser.addTab(strings.getString("extensions.memoryrestart.url"));
		}
	},
	
	prefCleanUp: function(addon) {
		if (addon.id === "memoryrestart@teamextension.com") {
			var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
			prefService.setCharPref("extensions.memoryrestart.version", '0');
		}
	},
	
	observe: function(subject, topic, data) {
		if (topic != "nsPref:changed") {
			return;
		}
		var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
		var refreshInterval = prefService.getIntPref("extensions.memoryrestart.refreshinterval");
		
		this.refreshMemory();
		window.clearInterval(TeamEXtension.intervalId);
		TeamEXtension.intervalId = window.setInterval(function() { TeamEXtension.MemoryRestart.refreshMemory(); }, refreshInterval * 1000);
	}
};

window.addEventListener("load", function(e) { TeamEXtension.MemoryRestart.onLoad(); }, false);
