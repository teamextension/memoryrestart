if ("undefined" == typeof(TeamEXtension)) {
	var TeamEXtension = {};
};

TeamEXtension.intervalIdAutoRestart;

TeamEXtension.minimizeMemoryUsageCaller = false;

TeamEXtension.prevMinimizedMemoryTS = -1;

TeamEXtension.prevMemWasBelowThreshold = true;

TeamEXtension.globalPreferences;

TeamEXtension.browserMemoryUsedInMb = -1;

TeamEXtension.mainTimer;

TeamEXtension.MemoryRestart = {
	onLoad: function() {
		TeamEXtension.globalPreferences = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
		
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
				}
			};
			AddonManager.addAddonListener(this.listener); 

			this.installListener = {
				onInstallEnded: function (install, addon) {
					TeamEXtension.MemoryRestart.prefCleanUp(addon);
					TeamEXtension.MemoryRestart.clearAllTimers();
					prefs.removeObserver("", this);
				}
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
	
	refreshMemory: function() {
		if (this.usingOldMemoryReporter()) {
			this.refreshMemoryOld();
		} else {
			this.refreshMemoryNew();
		}
	},
	
	refreshMemoryOld: function() {
		var memoryUsedInMB = this.getMemoryUsedInMB();		
		this.refreshMemoryCommon(memoryUsedInMB);
	},
	
	refreshMemoryCommon: function(memoryUsedInMB) {
		var prefService = TeamEXtension.globalPreferences;
		
		var memoryIncreased = prefService.getIntPref("extensions.memoryrestart.memoryincreased");
		var memoryGap = memoryUsedInMB - TeamEXtension.browserMemoryUsedInMb;
		if (memoryIncreased > 0 && TeamEXtension.browserMemoryUsedInMb != -1 && memoryGap >= memoryIncreased) {
			this.browserAlert('Firefox memory has increased by more than ' + memoryGap + 'Mb since last refresh interval. You can configure this alert via Memory Restart options.');
		}
		TeamEXtension.browserMemoryUsedInMb = memoryUsedInMB;
		
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
				var now = Date.now();
				if (this.shouldMinimize(now)) {
					TeamEXtension.prevMinimizedMemoryTS = now;
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
			TeamEXtension.prevMemWasBelowThreshold = false;			
		} else {
			TeamEXtension.minimizeMemoryUsageCaller = false;
			var colorBelowLimit = prefService.getCharPref("extensions.memoryrestart.colorbelowlimit");
			memoryrestartPanel.style.color = colorBelowLimit;
			memoryrestartPanel.tooltipText = strings.getString("extensions.memoryrestart.tooltip.normal");
			if (memoryrestartToolbar != null) {
				memoryrestartToolbar.style.listStyleImage = "url('chrome://memoryrestart/skin/below16.png')";
				var memoryrestartButtonTt = document.getElementById('memoryrestart-button-tt');
				memoryrestartButtonTt.label = memoryUsedInMB + "MB";
			}
			TeamEXtension.prevMemWasBelowThreshold = true;			
		}
	},
	
	//based on https://bugzilla.mozilla.org/show_bug.cgi?id=969407
	refreshMemoryNew: function() {
		var memoryReporterManager = Cc["@mozilla.org/memory-reporter-manager;1"].getService(Ci.nsIMemoryReporterManager);
		var memoryUsedInMB = (memoryReporterManager.residentFast / 1048576).toFixed();
		this.refreshMemoryCommon(memoryUsedInMB);
	},
	
	shouldMinimize: function(now) {
		var minimize = false;
		if (TeamEXtension.prevMemWasBelowThreshold) {
			if (TeamEXtension.prevMinimizedMemoryTS == -1) {
				minimize = true;
				//this.logToConsole('memoryrestart.shouldMinimize minimize='+minimize+', 1st time');
			} else {
				var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);		
				var intervalMins = prefService.getIntPref("extensions.memoryrestart.minimizememory.interval.mins");
				var gapMins = (now - TeamEXtension.prevMinimizedMemoryTS) / 1000 / 60;
				minimize = gapMins >= intervalMins;
				//this.logToConsole('memoryrestart.shouldMinimize '+minimize+' '+intervalMins+' mins prev='+TeamEXtension.prevMinimizedMemoryTS+' now='+now+
				//		' '+gapMins+' >= '+intervalMins);
			}
		}
		//this.logToConsole(now + ' memoryrestart.shouldMinimize minimize='+minimize+' prev='+ TeamEXtension.prevMinimizedMemoryTS);
		return minimize;
	},
	
	// https://bugzilla.mozilla.org/show_bug.cgi?id=910517
	// http://blog.mozilla.org/meeting-notes/archives/tag/mozillaplatform
	// https://wiki.mozilla.org/Platform/2013-09-17
	// nsIMemoryReporter is deprecated but the api name is repurposed
	// nsIMemoryMultiReporter is renamed to nsIMemoryReporter
	usingOldMemoryReporter: function() {
		var memoryReporterManager = Cc["@mozilla.org/memory-reporter-manager;1"].getService(Ci.nsIMemoryReporterManager);
		var e = memoryReporterManager.enumerateReporters();
		var mr = e.getNext().QueryInterface(Ci.nsIMemoryReporter);
		return (mr.path !== undefined);
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

	restartFirefox: function(checkPrompt)
	{
		var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
		var showprompt = prefService.getBoolPref("extensions.memoryrestart.showprompt");
		if ((checkPrompt == undefined || checkPrompt) && showprompt) {
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
	
	browserAlert: function(message) 
	{
		//https://developer.mozilla.org/en-US/Add-ons/Overlay_Extensions/XUL_School/User_Notifications_and_Alerts
		//try {
		//	var alertsService = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
		//	alertsService.showAlertNotification(null, '', message, false, '', null);
		//} catch (err) {
		//	alert(message);
		//}	
		var nb = gBrowser.getNotificationBox();
		var value = 'memory restart memory spike alert';
		var delayInSecs = 3;
		nb.appendNotification(message, value, null, nb.PRIORITY_WARNING_HIGH);
		//remove the notification
		setTimeout(function(){var notification = gBrowser.getNotificationBox().getNotificationWithValue(value); if (notification != null) notification.close();}, delayInSecs * 1000);
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
		if (TeamEXtension.mainTimer !== undefined) {
			TeamEXtension.mainTimer.cancel();
			TeamEXtension.mainTimer = undefined;
		}
		if (TeamEXtension.intervalIdAutoRestart !== undefined) {
			window.clearInterval(TeamEXtension.intervalIdAutoRestart);
		}
	},
	
	setTimerRefreshMemory: function() {
		var prefService = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefBranch);
		var refreshInterval = prefService.getIntPref("extensions.memoryrestart.refreshinterval");
		var event = {
			notify: function(timer) {
				TeamEXtension.MemoryRestart.refreshMemory(); 
			}
		}
		TeamEXtension.mainTimer = Components.classes["@mozilla.org/timer;1"].createInstance(Components.interfaces.nsITimer);
		TeamEXtension.mainTimer.initWithCallback(event, refreshInterval*1000, Components.interfaces.nsITimer.TYPE_REPEATING_SLACK);
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
	},

	restartFirefoxMenuFilePopup: function() {
		this.restartFirefox(false);
	},

	restartFirefoxAppmenuPrimaryPane: function() {
		this.restartFirefox();
	},

	restartFirefoxBrowserToolbarPalette: function() {
		this.restartFirefox();
	},

	restartFirefoxStatusBar: function(event) {
		if (this.isLeftClick(event)) {
			this.restartFirefox();
		}
	},

	isLeftClick: function(event) {
		return event.button == 0;
	}
};

window.addEventListener("load", function(e) { TeamEXtension.MemoryRestart.onLoad(); }, false);