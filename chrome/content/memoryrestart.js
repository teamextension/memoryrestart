if ("undefined" == typeof(TeamEXtension)) {
	var TeamEXtension = {};
};

TeamEXtension.MemoryRestart = {
	onLoad: function() {
		if (this.firstRun()) {
			this.addToolbarButton();
		}

		this.checkVersion();
		
		var interval = 1*60*1000; // 1 minute
		// var interval = 5*1*1000; // 5 seconds

		this.refreshMemory();
		window.setInterval(this.refreshMemory, interval);
	},
	
	isFF6Below: function() {
		var appInfo = Components.classes["@mozilla.org/xre/app-info;1"].getService(Components.interfaces.nsIXULAppInfo);
		var versionChecker = Components.classes["@mozilla.org/xpcom/version-comparator;1"].getService(Components.interfaces.nsIVersionComparator);
		return (versionChecker.compare(appInfo.version, "6.0") < 0);
	},

	refreshMemory: function()
	{
		var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
		var memoryReporterManager = Cc["@mozilla.org/memory-reporter-manager;1"].getService(Ci.nsIMemoryReporterManager);
		
		var check_malloc_mapped = TeamEXtension.MemoryRestart.isFF6Below();
		var check_resident = !check_malloc_mapped;
		var check_private = check_resident;
		
		var memoryUsed = 0;
		var e = memoryReporterManager.enumerateReporters();
		while (e.hasMoreElements() && (check_malloc_mapped || check_resident || check_private)) {
			var mr = e.getNext().QueryInterface(Ci.nsIMemoryReporter);
			
			// var consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
			// consoleService.logStringMessage("mr.path=" + mr.path);
			
			//if ((mr.path == "malloc/mapped") || (mr.path == "resident")) {
			//	memoryUsed = mr.memoryUsed;
			//	break;
			//}
			
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
		
		var memoryUsedInMb = memoryUsed / (1024 * 1024);
		memoryUsedInMb = memoryUsedInMb.toFixed();
		memoryrestartPanel.label = memoryUsedInMb + "Mb";

		var strings = document.getElementById("memoryrestart-strings");
		var memoryLimit = prefService.getIntPref("extensions.memoryrestart.memorylimit");
		if (memoryLimit < memoryUsedInMb) {
			var autoRestart = prefService.getBoolPref("extensions.memoryrestart.autorestart");
			if (autoRestart) {
				// this.quit is not a function
				// this.quit();
				var observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
				var canceled = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
				observerService.notifyObservers(canceled, "quit-application-requested", "restart");
				 
				if (canceled.data) return; // somebody canceled our quit request

				var appStartup = Cc['@mozilla.org/toolkit/app-startup;1'].getService(Ci.nsIAppStartup);
				appStartup.quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
			} else {
				var colorAboveLimit = prefService.getCharPref("extensions.memoryrestart.colorabovelimit");
				memoryrestartPanel.style.color = colorAboveLimit;
				memoryrestartPanel.tooltipText = strings.getString("extensions.memoryrestart.tooltip.high");
				if (memoryrestartToolbar != null) {
					memoryrestartToolbar.style.listStyleImage = "url('chrome://memoryrestart/skin/above16.png')";
					memoryrestartToolbar.tooltipText = memoryUsedInMb + "Mb";
				}
			}
		} else {
			var colorBelowLimit = prefService.getCharPref("extensions.memoryrestart.colorbelowlimit");
			memoryrestartPanel.style.color = colorBelowLimit;
			memoryrestartPanel.tooltipText = strings.getString("extensions.memoryrestart.tooltip.normal");
			if (memoryrestartToolbar != null) {
				memoryrestartToolbar.style.listStyleImage = "url('chrome://memoryrestart/skin/below16.png')";
				memoryrestartToolbar.tooltipText = memoryUsedInMb + "Mb";
			}
		}
	},

	restartFirefox: function()
	{
		var prompts = Cc["@mozilla.org/embedcomp/prompt-service;1"].getService(Ci.nsIPromptService);
		var strings = document.getElementById("memoryrestart-strings");
		
		if (prompts.confirm(window, strings.getString("extensions.memoryrestart.label"), strings.getString("extensions.memoryrestart.prompt"))) {
			this.quit();
		}
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

		var appStartup = Cc['@mozilla.org/toolkit/app-startup;1'].getService(Ci.nsIAppStartup);
		appStartup.quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);

		// Firefox 4
		// Components.utils.import("resource://gre/modules/Services.jsm");
		// if (Services.wm.getMostRecentWindow("navigator:browser").canQuitApplication()) {
		//     var appStartup = Cc['@mozilla.org/toolkit/app-startup;1'].getService(Ci.nsIAppStartup);
		//     appStartup.quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
		// }
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
	}
};

window.addEventListener("load", function(e) { TeamEXtension.MemoryRestart.onLoad(); }, false);
