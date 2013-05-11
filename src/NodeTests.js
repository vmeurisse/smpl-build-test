/**
 * Run test on node using [mocha](http://visionmedia.github.com/mocha/)
 * 
 * @class NodeTests
 * @constructor
 * 
 * @param config {Object}
 * @param [config.reporter] {String|function} reporter to use for mocha
 * @param [config.globals] {Array.String} List of globals to ignore for the leak detection
 * @param config.tests {Array.String} Path of the files to use for tests
 */
var NodeTests = function(config) {
	this.config = config;
};

/**
 * Run the tests
 * 
 * @method run
 * 
 * @param [coverage] {Coverage} If provided, will use {{#crossLink "coverageReporter"}}{{/crossLink}} instead of the
 *                              requested reporter. Will also set environement variable `SMPL_COVERAGE` to `1` to allow
 *                              your scripts to require the correct source version.
 * @param cb {function} callback
 */
NodeTests.prototype.run = function(coverage, cb) {
	var Mocha = require('mocha');
	var reporter;
	
	if (coverage) {
		process.env.SMPL_COVERAGE = '1';
		reporter = require('./coverageReporter');
		reporter.setCoverage(coverage);
	}
	var mocha = new Mocha({
		ui: 'tdd',
		reporter: reporter || this.config.reporter,
		globals: this.config.globals
	});
	this.config.tests.forEach(function(file) {
		// Force reimport
		require.cache[require.resolve(file)] = null;
		mocha.addFile(file);
	}, this);
	
	// Now, you can run the tests.
	mocha.run(function(failures) {
		process.env.SMPL_COVERAGE = '';
		cb(failures);
	});
};

exports = module.exports = NodeTests;
