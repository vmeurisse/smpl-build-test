/* jshint node: true, camelcase: false, latedef: false */
/* globals jake: false, task: false, fail: false, namespace: false, complete: false */ // Globals exposed by jake
/* globals cat: false, config: false, echo: false, mkdir: false, find: false*/ // Globals exposed by shelljs

var path = require('path');
var fs = require('fs');
require('shelljs/global');
config.fatal = true; //tell shelljs to fail on errors

var EXIT_CODES = {
	lintFailed: 101,
	sauceConnect: 102
};

/**
 * Jake addition. Allows to easily run async tasks without tons of code
 * @param {String} name  name of the task to run
 * @param {Array} params parameters to pass to the task (optional)
 * @param {Function} cb  Callback when the task is finished (optional)
 */
jake.invokeTask = function(name, params, cb) {
	var t = jake.Task[name];
	
	if (typeof params === 'function') {
		cb = params;
		params = [];
	}
	
	if (cb) {
		t.addListener('complete', function () {
			cb();
		});
	}
	t.invoke.apply(t, params);
};

namespace('smpl-build-test', function() {
	task('coverage', [], {async: true}, function(config) {
		var istanbul = require('istanbul');
		
		config.baseDir = config.baseDir || process.cwd();
		config.src = config.src || path.join(config.baseDir, 'src');
		config.coverageDir = config.coverageDir || path.join(config.baseDir, 'coverage');
		var coverageDirSrc = path.join(config.coverageDir, 'src');
		var dataDir = path.join(config.coverageDir, 'data');
		mkdir('-p', dataDir);
		if (typeof config.minCoverage === 'number') {
			config.minCoverage = {
				statements: config.minCoverage,
				branches: config.minCoverage,
				functions: config.minCoverage,
				lines: config.minCoverage
			};
		}
		
		var files = find(config.src).filter(function (file) {
			return file.match(/\.js$/);
		});
		var instrumenter = new istanbul.Instrumenter();
		var collector = new istanbul.Collector();
		
		files.forEach(function(file) {
			var dest = path.resolve(coverageDirSrc, path.relative(config.src, file));
			var destDir = path.dirname(dest);
			
			mkdir('-p', destDir);
			var data = fs.readFileSync(file, 'utf8');
			var instrumented = instrumenter.instrumentSync(data, file);
			fs.writeFileSync(dest, instrumented, 'utf8');
			
			var baseline = instrumenter.lastFileCoverage();
			var coverage = {};
			coverage[baseline.path] = baseline;
			collector.add(coverage);
		}, this);
		fs.writeFileSync(dataDir + '/baseline.json', JSON.stringify(collector.getFinalCoverage()), 'utf8');
		console.log('Instrumented ' + files.length + ' files');
		
		
		process.env.SMPL_COVERAGE = '1';
		
		var reporter = require('./coverageReporter');
		reporter.setBaseDir(config.coverageDir);
		reporter.setMinCoverage(config.minCoverage);
		
		var Mocha = require('mocha');
		
		var mocha = new Mocha({
			ui: 'tdd',
			reporter: reporter
		});
		config.tests.forEach(function(file) {
			mocha.addFile(file);
		}, this);

		// Now, you can run the tests.
		mocha.run(function(failures) {
			if (failures) fail();
			process.env.SMPL_COVERAGE = '';
			complete();
		});
	});
	
	task('test', [], {async: true}, function(config) {
		var Mocha = require('mocha');
		
		var mocha = new Mocha({
			ui: 'tdd',
			reporter: config.reporter
		});
		
		config.tests.forEach(function(file) {
			mocha.addFile(file);
		}, this);
		
		// Now, you can run the tests.
		mocha.run(function(failures) {
			if (failures) fail();
			complete();
		});
	});
	
	task('lint', [], function(files, globals) {
		globals = globals || {};
		var jshint = require('jshint').JSHINT;
		var options = JSON.parse(cat(path.join(__dirname, 'jshint.json')));
		
		echo('Linting ' + files.length + ' files...');

		var hasErrors = false;
		files.forEach(function (file) {
			jshint(cat(file), options, globals);
			var passed = true;
			var errors = jshint.data().errors;
			if (errors) {
				errors.forEach(function(err) {
					if (!err) {
						return;
					}
					// Tabs are counted as 4 spaces for column number.
					// Lets replace them to get correct results
					var line = err.evidence.replace(/\t/g, '    ');
					
					// ignore trailing spaces on indentation only lines
					if (err.code === 'W102' && err.evidence.match(/^\t+$/)) {
						return;
					}
					// Do no require {} for one line blocks
					if (err.code === 'W116' && err.a === '{' &&
						err.evidence.match(/^\t* *(?:(?:(?:if|for|while) ?\()|else).*;(?:\s*\/\/.*)?$/)) {
						return;
					}
					
					// Allow double quote string if they contain single quotes
					if (err.code === 'W109') {
						// https://github.com/jshint/jshint/issues/824
						if (err.character === 0) {
							return;
						}
						var i = err.character - 2; //JSHINT use base 1 for column and return the char after the end
						var singleQuotes = 0;
						var doubleQuotes = 0;
						while (i-- > 0) {
							if (line[i] === "'") singleQuotes++;
							else if (line[i] === '"') {
								var nb = 0;
								while (i-- && line[i] === '\\') nb++;
								if (nb % 2) doubleQuotes++;
								else break;
							}
						}
						if (singleQuotes > doubleQuotes) {
							return;
						}
					}
					
					// Do not require a space after `function`
					if (err.code === 'W013' && err.a === 'function') {
						return;
					}
					
					// bug in jslint: `while(i--);` require a space before `;`
					if (err.code === 'W013' && line[err.character - 1] === ';') {
						return;
					}
					
					// Indentation. White option turn this on. Need to fix indentation for switch case before activating
					if (err.code === 'W015') return;
					
					if (passed) {
						// First error in the file. Display filename
						echo('\n', file);
						passed = false;
						hasErrors = true;
					}
					line = '[L' + err.line + ':' + err.code + ']';
					while (line.length < 15) {
						line += ' ';
					}
					
					echo(line, err.reason);
					console.log(err.evidence.replace(/\t/g, '    '));
					console.log(new Array(err.character).join(' ') + '^');
				});
			}
		});
		if (hasErrors) {
			fail('FAIL !!!', EXIT_CODES.lintFailed);
		} else {
			echo('ok');
		}
	});
		
	task('remote', [], {async: true}, function(config) {
		new Remote(config).run(complete);
	});
});

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
				console.log(err);
				fail('Error launching sauce connect', EXIT_CODES.sauceConnect);
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
	this.startSauceConnect(function() {
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
	if (this.cb) this.cb();
};
