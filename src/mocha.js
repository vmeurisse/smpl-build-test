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
	// This reporter is a wrapper around the HTML reporter that also collect the results
	// Result format is the advanced format described here:
	// https://saucelabs.com/docs/javascript-unit-tests-integration
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
				// Format addition. Used for error reporting in the console.
				t.mochaTest = {
					fullTitle: test.fullTitle(),
					err: {
						message: test.err.message,
						stack: test.err.stack
					}
				};
			}
			currentSuite.specs.push(t);
		});
		
		runner.on('end', function() {
			postCoverage();
			window.mochaResults = result.suites[0];
			delete window.mochaResults.description;
		});
	};
	
	var stringify = window.JSON && JSON.stringify || function (obj) {
		var t = typeof obj;
		if (t !== 'object' || obj === null) {
			if (t === 'string') obj = '"' + obj.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
			return '' + obj;
		} else {
			var json = [], arr = (obj.constructor === Array);
			for (var k in obj) {
				json.push((arr ? '' : stringify(k) + ':') + stringify(obj[k]));
			}
			return (arr ? '[' : '{') + json + (arr ? ']' : '}');
		}
	};
	
	window.smpl_coverage_results = ''; //Prevent mocha to detect the iframe as new global
	var postCoverage = function() {
		var COVERAGE_KEY = '__coverage__';
		if (window[COVERAGE_KEY]) {
			// Poor man AJAX
			var iframe = document.createElement('iframe');
			iframe.style.display = 'none';
			iframe.name = 'smpl_coverage_results';
			document.body.appendChild(iframe);
			var input = document.createElement('input');
			input.name = 'coverage';
			input.value = stringify(window[COVERAGE_KEY]);
			var form = document.createElement('form');
			form.method = 'post';
			form.target = 'smpl_coverage_results';
			form.action = location.protocol + '//' + location.host + '/postResults';
			form.appendChild(input);
			form.style.display = 'none';
			document.body.appendChild(form);
			form.submit();
		}
	};
	
	mocha.setup('tdd');
	mocha.reporter(Reporter);
	
	// Load the CSS
	var link = document.createElement('link');
	link.type = 'text/css';
	link.rel = 'stylesheet';
	link.href = module.uri.split('/').slice(0, -1).join('/') + '/../node_modules/mocha/mocha.css';
	document.getElementsByTagName('head')[0].appendChild(link);
	
	function getQueryParam(key) {
		var match = location.search.match('[?&]' + key + '=([^#$&]*)');
		return match && match[1];
	}
	if (getQueryParam('coverage') === 'true') {
		window.process.env = {
			SMPL_COVERAGE: '1'
		};
	}
		
	return mocha;
});