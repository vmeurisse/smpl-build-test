/* globals fail: false */ // Globals exposed by jake
'use strict';

var fs = require('fs');
var path = require('path');

var istanbul = require('istanbul');
var shjs = require('shelljs');
shjs.config.fatal = true; //tell shelljs to fail on errors

var supplant = function(string, object) {
	return string.replace(/\{(\w+)\}/g, function(match, key) {
		var replacer = object[key];
		return (replacer !== undefined) ? replacer : match;
	});
};
var UNCOVERED_LINE = 'ERROR: Uncovered count for {0} ({1}) exceeds threshold ({2})';
var UNCOVERED_PERCENT = 'ERROR: Coverage for {0} ({1}%) does not meet threshold ({2}%)';

var coverage = {};

coverage.normalizeConfig = function(config) {
	config.baseDir = config.baseDir || process.cwd();
	config.src = config.src || path.join(config.baseDir, 'src');
	config.coverageDir = config.coverageDir || path.join(config.baseDir, 'coverage');
};

coverage.prepare = function(config) {
	var coverageDirSrc = path.join(config.coverageDir, 'src');
	var dataDir = path.join(config.coverageDir, 'data');
	shjs.rm('-rf', dataDir);
	shjs.mkdir('-p', dataDir);
	if (typeof config.minCoverage === 'number') {
		config.minCoverage = {
			statements: config.minCoverage,
			branches: config.minCoverage,
			functions: config.minCoverage,
			lines: config.minCoverage
		};
	}
	
	var files = shjs.find(config.src).filter(function (file) {
		return file.match(/\.js$/);
	});
	var instrumenter = new istanbul.Instrumenter();
	var collector = new istanbul.Collector();
	
	files.forEach(function(file) {
		file = path.normalize(file);
		
		var dest = path.resolve(coverageDirSrc, path.relative(config.src, file));
		var destDir = path.dirname(dest);
		
		shjs.mkdir('-p', destDir);
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
};

coverage.report = function(config) {
	var Report = istanbul.Report;
	var Collector = istanbul.Collector;
	
	var reporters = [];
	reporters.push(Report.create('html', {
		dir: path.join(config.baseDir, 'html-report')
	}));
	reporters.push(Report.create('text-summary'));
	
	var collector = new Collector();
	shjs.find(path.join(config.baseDir, 'data')).forEach(function (file) {
		if (file.match(/\.json$/)) {
			var cov = JSON.parse(fs.readFileSync(file, 'utf8'));
			collector.add(cov);
		}
	});
	
	reporters.forEach(function(reporter) {
		reporter.writeReport(collector, true);
	});
	console.log('\n');
	if (config.minCoverage) {
		var errors = [];
		var actuals = istanbul.utils.summarizeCoverage(collector.getFinalCoverage());
		Object.keys(config.minCoverage).forEach(function (key) {
			var threshold = config.minCoverage[key];
			
			if (threshold < 0) {
				var actualUncovered = actuals[key].total - actuals[key].covered;
				if (-threshold < actualUncovered) {
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
};

exports = module.exports = coverage;
