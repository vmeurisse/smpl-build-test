'use strict';

var fs = require('fs');
var path = require('path');

var coverage = require('./coverage');

var config = {
	coverageDir: './coverage',
	minCoverage: null
};

var COVERAGE_KEY = '__coverage__';

exports = module.exports = function (runner) {
	runner.on('end', function() {
		var cov = global[COVERAGE_KEY] || {};
		fs.writeFileSync(path.join(config.coverageDir, 'data', 'dacoverage.json'), JSON.stringify(cov), 'utf8');
		coverage.report(config);
	});
};

exports.setCoverageDir = function(coverageDir) {
	config.coverageDir = coverageDir;
};

exports.setMinCoverage = function(minCoverage) {
	config.minCoverage = minCoverage;
};
