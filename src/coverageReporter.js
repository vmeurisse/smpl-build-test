'use strict';

var fs = require('fs');
var path = require('path');

var coverage = require('./coverage');

var config = {
	baseDir: './coverage',
	minCoverage: null
};

var COVERAGE_KEY = '__coverage__';

exports = module.exports = function (runner) {
	runner.on('end', function() {
		var cov = global[COVERAGE_KEY] || {};
		fs.writeFileSync(path.join(config.baseDir, 'data', 'dacoverage.json'), JSON.stringify(cov), 'utf8');
		
		coverage.report(config);
	});
};

exports.setBaseDir = function(baseDir) {
	config.baseDir = baseDir;
};

exports.setMinCoverage = function(minCoverage) {
	config.minCoverage = minCoverage;
};
