'use strict';

var coverage;

var COVERAGE_KEY = '__coverage__';

exports = module.exports = function (runner) {
	runner.on('end', function() {
		var cov = global[COVERAGE_KEY] || {};
		coverage.writeFile(JSON.stringify(cov), 'node_coverage.json');
		coverage.report();
	});
};

exports.setCoverage = function(cov) {
	coverage = cov;
};
