'use strict';

/**
 * Class used to run tests on SauceLabs
 * 
 * @class Remote
 * @constructor
 * 
 * @param config {Object}
 * @param [config.webdriverURL='ondemand.saucelabs.com'] {String}
 * @param [config.webdriverPort=80] {String}
 * @param [config.user] {String} username for sauceLabs
 * @param [config.key] {String} key on sauceLabs
 * @param [config.sauceConnect] {Boolean} use Sauce Connect proxy
 * @param config.url {String} Url to point the browser to before test start
 * @param config.name {String} Name of the test on SauceLabs
 * @param config.browsers {Array.Object}
 * @param config.browsers.platform {String}
 * @param config.browsers.browserName {String}
 * @param config.browsers.version {String|Number}
 * @param config.onTest {Function}
 */
var Remote = function(config) {
	this.config = config;
	this.id = process.env.TRAVIS_BUILD_NUMBER;
	this.tags = [];
	if (this.id) {
		this.tags.push('travis');
	} else {
		this.tags.push('custom', '' + Math.floor(Math.random() * 100000000));
	}
	this.status = {};
};

/**
 * Start Sauce Connect
 * 
 * @method startSauceConnect
 * @private
 */
Remote.prototype.startSauceConnect = function(cb) {
	/* jshint camelcase: false */
	if (!this.config.sauceConnect) {
		cb();
		return;
	}
	var options = {
		username: this.config.user,
		accessKey: this.config.key,
		verbose: false,
		logger: console.log,
		no_progress: true // optionally hide progress bar
	};
	var sauceConnectLauncher = require('sauce-connect-launcher');
	var self = this;
	sauceConnectLauncher(options, function (err, sauceConnectProcess) {
		if (err) {
			if (!(err + '').match(/Exit code 143/)) {
				cb('Error launching sauce connect: ' + err);
			}
			return;
		}
		self.sauceConnect = sauceConnectProcess;
		cb();
	});
};

/**
 * Stop Sauce Connect
 * 
 * @method stopSauceConnect
 * @private
 */
Remote.prototype.stopSauceConnect = function() {
	if (this.sauceConnect) {
		this.sauceConnect.close();
		delete this.sauceConnect;
	}
};

/**
 * Run the tests
 * 
 * @method run
 * @param cb {Function} Callback when tests are finished running.
 * @param cb.failures {Number} Number of browsers that failled
 */
Remote.prototype.run = function(cb) {
	this.cb = cb;
	var self = this;
	this.startSauceConnect(function(err) {
		if (err) return self.cb(err);
		self.nbTests = self.config.browsers.length;
		self.startBrowser(0);
	});
};

/**
 * Start the browser at `index`. When browser is ready, will call `startBrowser(index + 1)` if possible.
 * 
 * @method startBrowser
 * @private
 * 
 * @param index {Number} Index of the browser to start. `index` is a reference to `config.browsers` in
 *        {{#crossLink "Remote"}}{{/crossLink}}
 */
Remote.prototype.startBrowser = function(index) {
	var webdriver = require('wd');
	
	var b = this.config.browsers[index];
	var browser = webdriver.remote(
			this.config.webdriverURL || 'ondemand.saucelabs.com',
			this.config.webdriverPort || 80,
			this.config.user,
			this.config.key
	);
	var name = this.getBrowserName(b);
	var desired = {
		name: this.config.name + ' - ' + name,
		browserName: b.browserName,
		platform: b.platform,
		version: b.version,
		build: this.id,
		tags: this.tags
	};
	browser.on('status', function(info) {
		console.log('%s: \x1B[36m%s\x1B[0m', name, info.trim());
	});
	
	browser.on('command', function(meth, path) {
		console.log('%s: > \x1B[33m%s\x1B[0m: %s', name, meth, path);
	});
	
	browser.init(desired, function(err, sessionID) {
		var testDone = this.testDone.bind(this, browser, name, sessionID);
		if (err) {
			console.log('%s: \x1B[31m%s\x1B[0m (%s)', name, err.message, JSON.stringify(desired));
			testDone(null);
		} else {
			var onTest = this.config.onTest.bind(null, browser, testDone);
			if (this.config.url) {
				this.loadUrl(browser, this.config.url, onTest);
			} else {
				onTest();
			}
			if (this.config.browsers[index + 1]) {
				process.nextTick(function() {
					this.startBrowser(index + 1);
				}.bind(this));
			}
		}
	}.bind(this));
};

/**
 * @method loadUrl
 * @private
 */
Remote.prototype.loadUrl = function(browser, url, cb) {
	browser.get(url, cb);
};

/**
 * @method getBrowserName
 * @private
 */
Remote.prototype.getBrowserName = function(browser) {
	var name = browser.browserName;
	if (browser.version) name += ' ' + browser.version;
	if (browser.platform) name += ' (' + browser.platform + ')';
	return name;
};

/**
 * @method testDone
 * @private
 */
Remote.prototype.testDone = function(browser, name, id, status) {
	browser.quit();
	this.status[name] = this.getReport(status);
	this.report(id, this.status[name], name, this.finish.bind(this));
};

/**
 * @method finish
 * @private
 */
Remote.prototype.finish = function() {
	if (0 === --this.nbTests) {
		this.stopSauceConnect();
		var self = this;
		setTimeout(function() {
			self.displayResults();
		}, 1000);
	}
};

/**
 * @method report
 * @private
 */
Remote.prototype.report = function(jobId, status, name, done) {
	if (!this.config.webdriverURL) {
		var Sauce = require('saucelabs');
		
		var success = !!(status.full && status.full.passed);
		
		var myAccount = new Sauce({
			username: this.config.user,
			password: this.config.key
		});
		
		myAccount.updateJob(jobId, {
			passed: success,
			'custom-data': {
				mocha: status.simple // Cannot send full report: http://support.saucelabs.com/entries/23287242
			}
		}, function(err) {
			if (err) {
				console.log('%s : > job %s: unable to set status:', name, jobId, err);
			} else {
				console.log('%s : > job %s marked as %s', name, jobId, success ? 'passed' : 'failed');
			}
			done();
		});
	} else {
		done();
	}
};

Remote.prototype.getReport = function(fullReport) {
	if (!fullReport) return {};
	
	var simple = {
		failed: 0,
		passed: 0,
		total: 0,
		runtime: fullReport.durationSec * 1000
	};
	var errors = [];
	
	var suite = function(s) {
		if (s.specs) s.specs.forEach(test);
		if (s.suites) s.suites.forEach(suite);
	};
	var test = function(t) {
		simple.total++;
		if (t.passed) {
			simple.passed++;
		} else {
			errors.push(t.mochaTest);
			delete t.mochaTest;
			simple.failed++;
		}
	};
	suite(fullReport);
	
	return {
		simple: simple,
		full: fullReport,
		errors: errors
	};
};

/**
 * @method displayResults
 * @private
 */
Remote.prototype.displayResults = function() {
	var failures = 0;
	console.log();
	console.log();
	console.log('**********************************');
	console.log('*             Status             *');
	console.log('**********************************');
	console.log();
	console.log();
	this.config.browsers.forEach(function(browser) {
		var name = this.getBrowserName(browser);
		var status = this.status[name];
		
		var ok = status.simple && status.simple.passed;
		var failed = status.simple && status.simple.failed;

		if (!ok && !failed) {
			console.log('    %s: \x1B[31mno results\x1B[m', name);
			failures++;
		} else if (failed) {
			console.log('    %s: \x1B[31m%d/%d failed\x1B[m', name, failed, ok + failed);
			failures++;
		} else {
			console.log('    %s: \x1B[32m%d passed\x1B[m', name, ok);
		}
		
		if (failed) {
			var n = 0;
			status.errors.forEach(function(test) {
				var stack = test.err.stack || test.err.message || '';
				console.log();
				console.log('      %d) %s', ++n, test.fullTitle);
				if (stack) console.log('\x1B[31m%s\x1B[m', stack.replace(/^/gm, '        '));
				console.log();
				console.log();
			}, this);
		}
	}, this);
	console.log();
	console.log();
	if (this.cb) this.cb(failures);
};

exports = module.exports = Remote;
