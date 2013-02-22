/* jshint node: true, camelcase: false */
/* globals fail: false */ // Globals exposed by jake
var istanbul = require('istanbul');
var fs = require('fs');
var path = require('path');

var Report = istanbul.Report;
var Collector = istanbul.Collector;

var config = {
	baseDir: './coverage',
	minCoverage: null
};

var supplant = function(string, object) {
	return string.replace(/\{(\w+)\}/g, function(match, key) {
		var replacer = object[key];
		return (replacer !== undefined) ? replacer : match;
	});
};
var UNCOVERED_LINE = 'ERROR: Uncovered count for {0} ({1}) exceeds threshold ({2})';
var UNCOVERED_PERCENT = 'ERROR: Coverage for {0} ({1}%) does not meet threshold ({2}%)';

exports = module.exports = function (runner) {
	runner.on('end', function() {
		var reporters = [];
		reporters.push(Report.create('html', {
			dir: path.join(config.baseDir, 'html-report')
		}));
		reporters.push(Report.create('text-summary'));
		
		var cov = global.__coverage__ || {},
			collector = new Collector();
		
		fs.writeFileSync(path.join(config.baseDir, 'data', 'dacoverage.json'), JSON.stringify(cov), 'utf8');
		var baseline = JSON.parse(fs.readFileSync(path.join(config.baseDir, 'data', 'baseline.json'), 'utf8'));
		
		collector.add(cov);
		collector.add(baseline);
		
		reporters.forEach(function(reporter) {
			reporter.writeReport(collector, true);
		});
		
		if (config.minCoverage) {
			var errors = [];
			var actuals = istanbul.utils.summarizeCoverage(collector.getFinalCoverage());
			Object.keys(config.minCoverage).forEach(function (key) {
				var threshold = config.minCoverage[key];
				
				if (threshold < 0) {
					var actualUncovered = actuals[key].total - actuals[key].covered;
					if (threshold * -1 < actualUncovered) {
						errors.push(supplant(UNCOVERED_LINE, [key, actualUncovered, -threshold]));
					}
				} else {
					var actual = actuals[key].pct;
					if (actual < threshold) {
						errors.push(supplant(UNCOVERED_PERCENT, [key, actual, threshold]));
					}
				}
			});
			if (errors.length) {
				console.error(errors.join('\n'));
				fail();
			}
		}
	});
};

exports.setBaseDir = function(baseDir) {
	config.baseDir = baseDir;
};

exports.setMinCoverage = function(minCoverage) {
	config.minCoverage = minCoverage;
};
