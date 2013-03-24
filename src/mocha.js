/* jshint browser: true */
/* globals Mocha, mocha, define */

if (window.ActiveXObject || !window.postMessage) {
	// fix for https://github.com/visionmedia/mocha/issues/502
	window.setImmediate = function(fn) {
		var scriptEl = global.document.createElement('script');
		scriptEl.onreadystatechange = function () {
			scriptEl.onreadystatechange = null;
			scriptEl.parentNode.removeChild(scriptEl);
			scriptEl = null;
			fn();
		};
		global.document.documentElement.appendChild(scriptEl);
	};
}

define(['module', '../node_modules/mocha/mocha'], function(module) {
	// This reporter is a shim over the
	var Reporter = function(runner) {
		new Mocha.reporters.HTML(runner);
		
		var result = {};
		var stack = [];
		var currentSuite = result;
		var testStart;
		
		runner.on('suite', function(suite) {
			var newSuite = {
				description: suite.title,
				start: new Date(),
				passed: true
			};
			stack.push(newSuite);
			if (!currentSuite.suites) currentSuite.suites = [];
			currentSuite.suites.push(newSuite);
			currentSuite = newSuite;
		});
		
		runner.on('suite end', function() {
			currentSuite.durationSec = (new Date() - currentSuite.start) / 1000;
			delete currentSuite.start;
			stack.pop();
			var parentSuite = stack[stack.length - 1];
			if (!currentSuite.passed && parentSuite) parentSuite.passed = false;
			currentSuite = parentSuite;
		});
		
		runner.on('test', function() {
			testStart = new Date();
		});
		runner.on('test end', function(test) {
			if (!currentSuite.specs) currentSuite.specs = [];
			var t = {
				description: test.title,
				durationSec: (new Date() - testStart) / 1000,
				passed: test.state === 'passed',
				totalCount: 1,
				passedCount: 1,
				failedCount: 0
			};
			if (!t.passed) {
				currentSuite.passed = false;
				t.failedCount = 1;
				t.passedCount = 0;
			}
			currentSuite.specs.push(t);
		});
		
		runner.on('end', function() {
			window.mochaResults = result.suites[0];
			delete window.mochaResults.description;
		});
	};
	
	mocha.setup('tdd');
	mocha.reporter(Reporter);
	
	// Load the CSS
	var link = document.createElement('link');
	link.type = 'text/css';
	link.rel = 'stylesheet';
	link.href = module.uri.split('/').slice(0, -1).join('/') + '/../node_modules/mocha/mocha.css';
	document.getElementsByTagName('head')[0].appendChild(link);
	
	return mocha;
});