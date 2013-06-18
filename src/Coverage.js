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

/**
 * Wraper around [istanbul](https://github.com/gotwarlost/istanbul) for code coverage.
 * 
 * @class Coverage
 * @constructor
 * 
 * @param config {Object}
 * @param [config.baseDir=process.cwd()] {String} Base project directory
 * @param [config.src=`config.baseDir`/src] {String} Source folder to instrument
 * @param [config.coverageDir=`config.baseDir`/coverage] {String} Folder to use for instrumented source and coverage
 *         results
 * @param [config.copyall=false] {Boolean} Copy files that are not covered to the output dir. Useful if your JS files
 *         are using some resources.
 * @param [config.filter] {Function} Method used to check if a file/folder need to be processed. The method should
 *                         return a boolean. Returning true on a directory just create or not a directory in
 *                         the destination folder. Returning false as no effect (It doesn't stop the processing of the
 *                         files in that directory). It take the following parameters:
 * @param config.filter.file {Object}
 * @param config.filter.file.path {String} Full path of the file
 * @param config.filter.file.relative {String} Path relative from the base dir
 * @param config.filter.file.stat {fs.Stat} Info on the file/directory
 * @param [config.minCoverage] {Number|Object} Fail if coverage is lower than `minCoverage`. Positive values are treated
 *        as a minimum percentage of coverage. Negative values are a maximum number of uncovered lines.  
 *        Setting this a a number has the same effect as setting all four properties to the same value
 * @param [config.minCoverage.statements] {Number}
 * @param [config.minCoverage.branches] {Number}
 * @param [config.minCoverage.functions] {Number}
 * @param [config.minCoverage.lines] {Number}
 */
var Coverage = function(config) {
	this.config = config;
	this.normaliseConfig();
};

/**
 * Prepare the source code for code coverage. All files with `.js` extension in `config.src` will be
 * copied to `config.coverageDir + "/src"` and instrumented.
 *
 * @method prepare
 */
Coverage.prototype.prepare = function() {
	var coverageDirSrc = path.join(this.config.coverageDir, 'src');
	var dataDir = path.join(this.config.coverageDir, 'data');
	shjs.rm('-rf', dataDir);
	shjs.mkdir('-p', dataDir);
	
	var files = shjs.find(this.config.src);
	var instrumenter = new istanbul.Instrumenter();
	var collector = new istanbul.Collector();
	
	process.stdout.write('Instrumenting files');
	var filesPerDot = Math.ceil(files.length / 50);
	
	if (!this.config.filter) {
		this.config.filter = function(file) {
			return file.stat.isFile() && file.path.match(/\.js$/);
		};
	}
	
	files.forEach(function(file, index) {
		var stat = fs.statSync(file);
		var relPath = path.relative(this.config.src, file);
		if (path.sep === '\\') relPath = relPath.replace(/\\/g, '/');
		
		var instrument = this.config.filter({
			path: file,
			stat: stat,
			relative: relPath
		});
		
		if (index % filesPerDot === 0) process.stdout.write('.');
		
		if (!instrument && !this.config.copyall) return;
		
		file = path.normalize(file);
		
		var dest = path.resolve(coverageDirSrc, relPath);
		var destDir = path.dirname(dest);
		
		shjs.mkdir('-p', destDir);
		
		if (stat.isFile()) {
			var data = fs.readFileSync(file, 'utf8');
			
			if (instrument) {
				data = instrumenter.instrumentSync(data, file);
				var baseline = instrumenter.lastFileCoverage();
				var coverage = {};
				coverage[baseline.path] = baseline;
				collector.add(coverage);
			}
			
			fs.writeFileSync(dest, data, 'utf8');
		}
	}, this);
	fs.writeFileSync(dataDir + '/baseline.json', JSON.stringify(collector.getFinalCoverage()), 'utf8');
	process.stdout.write(' ok\n');
};

/**
 * Write a coverage report.
 *
 * @method writeFile
 * 
 * @param data {String} Coverage report
 * @param [filename] {String} name of the file
 */
Coverage.prototype.writeFile = function(data, filename) {
	filename = filename || (Math.random() * 99999999).toFixed(0) + '.json';
	fs.writeFileSync(path.join(this.config.coverageDir, 'data', filename), data, 'utf8');
};

/**
 * Prepare the source code for code coverage. All files with `.js` extension in `config.src` will be
 * copied to `config.coverageDir + "/src"` and instrumented.
 *
 * @method report
 */
Coverage.prototype.report = function() {
	var Report = istanbul.Report;
	var Collector = istanbul.Collector;
	
	var reporters = [];
	reporters.push(Report.create('html', {
		dir: path.join(this.config.coverageDir, 'html-report')
	}));
	reporters.push(Report.create('text-summary'));
	
	var collector = new Collector();
	shjs.find(path.join(this.config.coverageDir, 'data')).forEach(function (file) {
		if (file.match(/\.json$/)) {
			var cov = JSON.parse(fs.readFileSync(file, 'utf8'));
			collector.add(cov);
		}
	});
	
	reporters.forEach(function(reporter) {
		reporter.writeReport(collector, true);
	});
	console.log('\n');
	if (this.config.minCoverage) {
		var errors = [];
		var actuals = istanbul.utils.summarizeCoverage(collector.getFinalCoverage());
		Object.keys(this.config.minCoverage).forEach(function (key) {
			var threshold = this.config.minCoverage[key];
			
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
		}, this);
		if (errors.length) {
			console.error(errors.join('\n'));
			fail();
		}
	}
};

/**
 * Make sure that `config.src` and `config.coverageDir` exist.
 * Normalise `config.minCoverage`
 *
 * @method normaliseConfig
 * @private
 */
Coverage.prototype.normaliseConfig = function() {
	this.config.baseDir = this.config.baseDir || process.cwd();
	this.config.src = this.config.src || path.join(this.config.baseDir, 'src');
	this.config.coverageDir = this.config.coverageDir || path.join(this.config.baseDir, 'coverage');
	if (typeof this.config.minCoverage === 'number') {
		this.config.minCoverage = {
			statements: this.config.minCoverage,
			branches: this.config.minCoverage,
			functions: this.config.minCoverage,
			lines: this.config.minCoverage
		};
	}
};

exports = module.exports = Coverage;
