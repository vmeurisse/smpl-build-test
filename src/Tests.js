
/**
 * Server used to run unit tests
 * 
 * @class Tests
 * @constructor
 * 
 * @param config {Object}
 * @param [config.server] {Object} config for {{#crossLink "Server"}}{{/crossLink}}
 * @param [config.remote] {Object} config for {{#crossLink "Remote"}}{{/crossLink}}
 * @param [config.node] {Object} config for {{#crossLink "NodeTests"}}{{/crossLink}}
 * @param [config.coverage] {Object} config for {{#crossLink "Coverage"}}{{/crossLink}}
 * @param [config.manualStop] {Boolean} If true, server is not stopped automatically and coverage repport is delayed.
 *                            You need to manually call the stop method to end the tests. 
 * 
 */
var Tests = function(config) {
	this.config = config;
	
	var actions = this.actions = {};
	actions.runServer = !!this.config.server;
	actions.runNodeTests = !!(this.config.node && (!this.config.coverage || !this.config.coverage.coverageOnly));
	actions.runNodeCoverage = !!(this.config.coverage && this.config.node);
	actions.prepareCoverage = !!this.config.coverage;
	actions.runRemote = !!this.config.remote;
	actions.runRemoteCoverage = !!(this.config.remote && this.config.coverage && this.config.remote.urlCoverage);
	actions.coverageReport = !!(this.config.coverage && this.config.server);
	
	var needStop = !!this.config.server;
	actions.autoStop = needStop && !this.config.manualStop;
	actions.manualStop = needStop && !!this.config.manualStop;
};


Tests.prototype.run = function(cb) {
	if (this.actions.runServer) {
		this.startServer();
	}
	
	var actions = [];
	
	if (this.actions.runNodeTests) actions.push(this.runTests.bind(this, 'standard'));
	if (this.actions.prepareCoverage) actions.push(this.prepareCoverage.bind(this));
	if (this.actions.runNodeCoverage) actions.push(this.runTests.bind(this, 'coverage'));
	if (this.actions.runRemote) actions.push(this.runRemote.bind(this));
	
	require('async').series(actions, function(err) {
		if (this.actions.autoStop) {
			this.stop();
		}
		if (cb) cb(err);
	}.bind(this));
	
	
	if (this.actions.manualStop) {
		return {
			stop: this.stop.bind(this)
		};
	}
};

Tests.prototype.stop = function() {
	if (this.actions.coverageReport) {
		this.coverage.report();
	}
	if (this.server) {
		this.stopServer();
	}
};

/**
 * Start the webserver
 * 
 * @method startServer
 * @private
 */
Tests.prototype.startServer = function() {
	if (!this.server) {
		var Server = require('./Server');
		
		this.server = new Server(this.config.server);
		this.server.start();
		if (this.config.url) {
			console.log('server ready: ' + this.config.url);
		}
	}
};

/**
 * Stop the webserver
 * 
 * @method stopServer
 * @private
 */
Tests.prototype.stopServer = function() {
	this.server.stop();
	delete this.server;
	console.log('server stoped');
};

Tests.prototype.runTests = function(type, cb) {
	var NodeTests = require('./NodeTests');
	var coverage = (type === 'coverage') ? this.coverage : null;
	new NodeTests(this.config.node).run(coverage, cb);
};

Tests.prototype.prepareCoverage = function(cb) {
	var Coverage = require('./Coverage');
	this.coverage = new Coverage(this.config.coverage);
	this.coverage.prepare();
	if (this.server) this.server.setCoverage(this.coverage);
	cb();
};

Tests.prototype.runRemote = function(cb) {
	var Remote = require('./Remote');
	new Remote(this.config.remote).run(cb);
};

module.exports = Tests;
