if ("undefined" == typeof(TeamEXtension)) {
	var TeamEXtension = {};
};

TeamEXtension.previousMemoryLimit;

TeamEXtension.MemoryRestartOptions = {
	onLoad: function() {
		document.getElementById("error_memorylimit").setAttribute('style', 'display: none;');
		var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.memoryrestart.");
		TeamEXtension.previousMemoryLimit = prefs.getIntPref("memorylimit");
		var memoryLimitMinimum = prefs.getIntPref("minimummemorylimit");
		if (memoryLimitMinimum < 250) {
			prefs.setIntPref("minimummemorylimit", 250);
		}
	},
	onDialogCancel: function() {
		var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.memoryrestart.");
		var memorylimit = prefs.getIntPref("memorylimit");
		if (memorylimit != TeamEXtension.previousMemoryLimit) {
			prefs.setIntPref("memorylimit", TeamEXtension.previousMemoryLimit);
		}
		return true;
	},
	onDialogAccept: function() {
		var prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("extensions.memoryrestart.");
		var memoryLimitMinimum = prefs.getIntPref("minimummemorylimit");
		var memorylimit = prefs.getIntPref("memorylimit");
		
		var styleTextMemoryLimit = 'color: black;';
		var styleMemoryLimitError = 'display: none; color: red;';
		if (memorylimit < memoryLimitMinimum) {
			styleTextMemoryLimit = 'color: red;';
			styleMemoryLimitError = 'display:block; color: red;';
		}
		document.getElementById("textmemorylimit").setAttribute('style', styleTextMemoryLimit);
		document.getElementById("error_memorylimit").setAttribute('style', styleMemoryLimitError);
		
		return memorylimit >= memoryLimitMinimum; 
	},
};