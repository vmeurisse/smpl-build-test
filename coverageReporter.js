/* jshint node: true, camelcase: false */
var istanbul = require('istanbul');
var fs = require('fs');
var path = require('path');

var Report = istanbul.Report;
var Collector = istanbul.Collector;

var config = {
	baseDir: './coverage'
};

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
	});
};

exports.setBaseDir = function(baseDir) {
	config.baseDir = baseDir;
};