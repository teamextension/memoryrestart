if ("undefined" == typeof(TeamEXtension)) {
	var TeamEXtension = {};
};

TeamEXtension.intervalId;

TeamEXtension.intervalIdAutoRestart;

TeamEXtension.minimizeMemoryUsageCaller = false;

TeamEXtension.prevMinimizedMemory = -1;

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
					TeamEXtension.MemoryRestart.clearAllTimers();
					prefs.removeObserver("", this);
				},
			};
			AddonManager.addAddonListener(this.listener); 

			this.installListener = {
				onInstallEnded: function (install, addon) {
					TeamEXtension.MemoryRestart.prefCleanUp(addon);
					TeamEXtension.MemoryRestart.clearAllTimers();
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
		this.refreshMemory();
		this.setTimerRefreshMemory();
	},
	
	refreshMemory: function()
	{
		var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);		
		var memoryUsedInMB = this.getMemoryUsedInMB();		
		var memoryrestartToolbar = document.getElementById('memoryrestart-button');
		var memoryrestartPanel = document.getElementById('memoryrestart-panel');
		memoryrestartPanel.label = memoryUsedInMB + "MB";
		var strings = document.getElementById("memoryrestart-strings");
		var memoryLimit = prefService.getIntPref("extensions.memoryrestart.memorylimit");
		if (memoryLimit < memoryUsedInMB) {
			var colorAboveLimit = prefService.getCharPref("extensions.memoryrestart.colorabovelimit");
			memoryrestartPanel.style.color = colorAboveLimit;
			memoryrestartPanel.tooltipText = strings.getString("extensions.memoryrestart.tooltip.high");
			if (memoryrestartToolbar != null) {
				memoryrestartToolbar.style.listStyleImage = "url('chrome://memoryrestart/skin/above16.png')";
				var memoryrestartButtonTt = document.getElementById('memoryrestart-button-tt');
				memoryrestartButtonTt.label = memoryUsedInMB + "MB";
			}
			var minimizeMemory = prefService.getBoolPref("extensions.memoryrestart.minimizememory");
			if (minimizeMemory && TeamEXtension.minimizeMemoryUsageCaller == false) {								
				if (this.isToleranceReached(memoryUsedInMB)) {
					TeamEXtension.prevMinimizedMemory = memoryUsedInMB;
					TeamEXtension.minimizeMemoryUsageCaller = true; 
					this.minimizeMemoryUsage3x(function() { TeamEXtension.MemoryRestart.refreshMemory(); });
				}
			} else { // act as a callback of minimizeMemoryUsage3x when the indicator minimizeMemoryUsageCaller is set to false
				/* disable tooltip to notify user after memory is minimized
				if (minimizeMemory) {
					memoryrestartButtonTt.label = "Memory minimized to " + memoryUsedInMB + "MB";
					//relative to something, will display all over the place, solution is just to make coordinate fix
					//var x = memoryrestartButtonTt.popupBoxObject.x;
					//var y = memoryrestartButtonTt.popupBoxObject.y;
					var x = 15;
					var y = -15;
					memoryrestartButtonTt.openPopup(memoryrestartToolbar, "after_start", x, y, false, false);
				}				
				*/
				TeamEXtension.minimizeMemoryUsageCaller = false;
				var autoRestart = prefService.getBoolPref("extensions.memoryrestart.autorestart");
				if (autoRestart) {
					var autoRestartDelay = prefService.getIntPref("extensions.memoryrestart.autorestart.delay");
					this.quit(autoRestartDelay);
				}				
			}
		} else {
			TeamEXtension.prevMinimizedMemory = -1;
			TeamEXtension.minimizeMemoryUsageCaller = false;
			var colorBelowLimit = prefService.getCharPref("extensions.memoryrestart.colorbelowlimit");
			memoryrestartPanel.style.color = colorBelowLimit;
			memoryrestartPanel.tooltipText = strings.getString("extensions.memoryrestart.tooltip.normal");
			if (memoryrestartToolbar != null) {
				memoryrestartToolbar.style.listStyleImage = "url('chrome://memoryrestart/skin/below16.png')";
				var memoryrestartButtonTt = document.getElementById('memoryrestart-button-tt');
				memoryrestartButtonTt.label = memoryUsedInMB + "MB";
			}			
		}
	},
	
	isToleranceReached: function(currentMemory) {
		var toleranceReached = false;
		if (TeamEXtension.prevMinimizedMemory == -1) {
			toleranceReached = true;
			//this.logToConsole('memoryrestart.isToleranceReached toleranceReached='+toleranceReached+', negative prev mem');
		} else {
			var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);		
			var tolerancePercent = prefService.getIntPref("extensions.memoryrestart.minimizememory.tolerance.percent");
			if (tolerancePercent < 0) {
				tolerancePercent = 10;
				prefService.setIntPref("extensions.memoryrestart.minimizememory.tolerance.percent", tolerancePercent);
			}
			var upperTolerance = (TeamEXtension.prevMinimizedMemory * (100 + tolerancePercent) / 100);
			var lowerTolerance = (TeamEXtension.prevMinimizedMemory * (100 - tolerancePercent) / 100);
			toleranceReached = currentMemory <= lowerTolerance || currentMemory >= upperTolerance;
			//this.logToConsole('memoryrestart.isToleranceReached '+toleranceReached+' '+tolerancePercent+'% prev='+TeamEXtension.prevMinimizedMemory+
			//		' '+currentMemory+' <= '+lowerTolerance+' || '+currentMemory+' >= '+upperTolerance);
		}
		return toleranceReached;
	},
	
	getMemoryUsedInMB: function() {
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
		var memoryUsedInMB = memoryUsed / (1024 * 1024);
		return memoryUsedInMB.toFixed();
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
	
	quit: function(delay) {
		var observerService = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
		var canceled = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
		observerService.notifyObservers(canceled, "quit-application-requested", "restart");
		 
		if (canceled.data) return; // somebody canceled our quit request

		if (delay === undefined) {
			this.restartAPI();
		} else {
			if (TeamEXtension.intervalIdAutoRestart !== undefined) {
				window.clearInterval(TeamEXtension.intervalIdAutoRestart);
			}
			TeamEXtension.intervalIdAutoRestart = window.setTimeout(function() { TeamEXtension.MemoryRestart.restartAPI(); }, delay * 1000);
		}
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
	
	clearAllTimers: function() {
		if (TeamEXtension.intervalId !== undefined) {
			window.clearInterval(TeamEXtension.intervalId);
		}
		if (TeamEXtension.intervalIdAutoRestart !== undefined) {
			window.clearInterval(TeamEXtension.intervalIdAutoRestart);
		}
	},
	
	setTimerRefreshMemory: function() {
		var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
		var refreshInterval = prefService.getIntPref("extensions.memoryrestart.refreshinterval");
		if (TeamEXtension.intervalId !== undefined) {
			window.clearInterval(TeamEXtension.intervalId);
		}
		TeamEXtension.intervalId = window.setInterval(function() { TeamEXtension.MemoryRestart.refreshMemory(); }, refreshInterval * 1000);
	},
	
	observe: function(subject, topic, data) {
		if (topic != "nsPref:changed") {
			return;
		}
		this.refreshMemory();
		this.setTimerRefreshMemory();
	},
	
	// based on chrome://global/content/aboutMemory.js at page about:memory
	// For maximum effect, this returns to the event loop between each
	// notification.  See bug 610166 comment 12 for an explanation.
	// Ideally a single notification would be enough.
	minimizeMemoryUsage3x: function(fAfter) {
		var i = 0;

		function runSoon(f) {
			var tm = Cc["@mozilla.org/thread-manager;1"].getService(Ci.nsIThreadManager);
			tm.mainThread.dispatch({ run: f }, Ci.nsIThread.DISPATCH_NORMAL);
		}

		function sendHeapMinNotificationsInner() {
			var os = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
			// https://developer.mozilla.org/en/XPCOM_Interface_Reference/nsIMemory#Low_memory_notifications
			os.notifyObservers(null, "memory-pressure", "heap-minimize");
			if (++i < 3) {
				runSoon(sendHeapMinNotificationsInner);
			} else {
				runSoon(fAfter);
			}	
		}
		
		sendHeapMinNotificationsInner();
	}
};

window.addEventListener("load", function(e) { TeamEXtension.MemoryRestart.onLoad(); }, false);
