/* jshint node: true, camelcase: false, latedef: false */

/**
 * Class used to run test on SauceLabs
 * @param {Object} config
 * @param {String} config.user username on sauceLabs
 * @param {String} config.key key on sauceLabs
 * @param {String} config.path Path to use as root web folder when calling `Remote.startServer`
 * @param {Number} config.port Port to use for web server when calling `Remote.startServer`
 * @param {Boolean} config.sauceConnect use Sauce Connect for the tests
 * @param {String} config.url Url to point the browser to before test start
 * @param {String} config.name Name of the test on SauceLabs
 * @param {Array} config.browsers
 * @param {String} config.browsers.os
 * @param {String} config.browsers.name
 * @param {String|Number} config.browsers.version
 * @param {Function} onTest
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

Remote.prototype.startServer = function() {
	if (!this.server && this.config.port) {
		var nodeStatic = require('node-static');
		var file = new nodeStatic.Server(this.config.path);
		this.server = require('http').createServer(function (request, response) {
			request.addListener('end', function () {
				file.serve(request, response);
			});
		});
		this.server.listen(this.config.port);
		
		if (this.config.url) {
			console.log('server ready: ' + this.config.url);
		}
	}
};

Remote.prototype.stopServer = function() {
	if (this.server) {
		this.server.close();
		delete this.server;
		console.log('server stoped');
	}
};

Remote.prototype.startSauceConnect = function(cb) {
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

Remote.prototype.stopSauceConnect = function() {
	if (this.sauceConnect) {
		this.sauceConnect.close();
		delete this.sauceConnect;
	}
};

Remote.prototype.run = function(cb) {
	this.cb = cb;
	this.startServer();
	var self = this;
	this.startSauceConnect(function(err) {
		if (err) return this.cb(err);
		self.nbTests = self.config.browsers.length;
		self.startBrowser(0);
	});
};

Remote.prototype.startBrowser = function(index) {
	var webdriver = require('wd');
	
	var b = this.config.browsers[index];
	var browser = webdriver.remote('ondemand.saucelabs.com', 80, this.config.user, this.config.key);
	var name = this.getBrowserName(b);
	var desired = {
		name: this.config.name + ' - ' + name,
		browserName: b.name,
		platform: b.os,
		version: b.version,
		build: this.id,
		tags: this.tags
	};
	browser.on('status', function(info) {
		console.log('%s : \x1b[36m%s\x1b[0m', name, info.trim());
	});
	
	browser.on('command', function(meth, path) {
		console.log('%s : > \x1b[33m%s\x1b[0m: %s', name, meth, path);
	});
	
	var self = this;
	browser.init(desired, function(err, sessionID) {
		var testDone = self.testDone.bind(self, browser, name, sessionID);
		var onTest = self.config.onTest.bind(null, browser, testDone);
		if (self.config.url) {
			self.loadUrl(browser, self.config.url, onTest);
		} else {
			onTest();
		}
		if (self.config.browsers[index + 1]) {
			process.nextTick(function() {
				self.startBrowser(index + 1);
			});
		}
	});
};

Remote.prototype.loadUrl = function(browser, url, cb) {
	browser.get(url, cb);
};

Remote.prototype.getBrowserName = function(browser) {
	var name = browser.name;
	if (browser.version) name += ' ' + browser.version;
	if (browser.os) name += ' (' + browser.os + ')';
	return name;
};

Remote.prototype.testDone = function(browser, name, id, status) {
	browser.quit();
	this.status[name] = status;
	this.report(id, status, name, this.finish.bind(this));
};

Remote.prototype.finish = function() {
	if (0 === --this.nbTests) {
		this.stopSauceConnect();
		this.stopServer();
		var self = this;
		setTimeout(function() {
			self.displayResults();
		}, 1000);
	}
};

Remote.prototype.report = function(jobId, status, name, done) {
	var request = require('request');
	
	var success = !!(status && status.ok && status.failed && status.ok.length && !status.failed.length);
	var user = this.config.user;
	var key = this.config.key;
	var httpOpts = {
		url: 'http://' + user + ':' + key + '@saucelabs.com/rest/v1/' + user + '/jobs/' + jobId,
		method: 'PUT',
		headers: {
			'Content-Type': 'text/json'
		},
		body: JSON.stringify({
			passed: success
		}),
		jar: false /* disable cookies: they break next request */
	};
	
	request(httpOpts, function(err) {
		if (err) {
			console.log('%s : > job %s: unable to set status:', name, jobId, err);
		} else {
			console.log('%s : > job %s marked as %s', name, jobId, success ? 'passed' : 'failed');
		}
		done();
	});
};

Remote.prototype.displayResults = function() {
	var failures = 0;
	var self = this;
	console.log();
	console.log();
	console.log('**********************************');
	console.log('*             Status             *');
	console.log('**********************************');
	console.log();
	console.log();
	this.config.browsers.forEach(function(browser) {
		var name = self.getBrowserName(browser);
		var status = self.status[name];
		
		var ok = status && status.ok && status.ok.length;
		var failed = status && status.failed && status.failed.length;

		if (!ok && !failed) {
			console.log('    %s: \033[31mno results\033[m', name);
			failures++;
		} else if (failed) {
			console.log('    %s: \033[31m%d/%d failed\033[m', name, failed, ok + failed);
			failures++;
		} else {
			console.log('    %s: \033[32m%d passed\033[m', name, ok);
		}
		
		if (failed) {
			failed = status.failed;
			var n = 0;
			failed.forEach(function(test) {
				var err = test.error;
				var msg = err.message || '';
				var stack = err.stack || msg;
				var i = stack.indexOf(msg) + msg.length;
				msg = stack.slice(0, i);
				console.log();
				console.log('      %d) %s', ++n, test.fullTitle);
				console.log('\033[31m%s\033[m', stack.replace(/^/gm, '        '));
			});
			console.log();
			console.log();
		}
	});
	console.log();
	console.log();
	if (this.cb) this.cb(failures);
};

exports = module.exports = Remote;