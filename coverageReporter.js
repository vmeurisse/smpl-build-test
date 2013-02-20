/* jshint node: true, camelcase: false */
var istanbul = require('istanbul'),
	Report = istanbul.Report,
	Collector = istanbul.Collector;

exports = module.exports = function (runner) {
	runner.on('end', function() {
		var reporters = [];
		reporters.push(Report.create('html', {
			dir: './coverage/html-report'
		}));
		reporters.push(Report.create('text-summary'));
		
		var cov = global.__coverage__ || {},
			collector = new Collector();
		
		collector.add(cov);
		
		reporters.forEach(function(reporter) {
			reporter.writeReport(collector, true);
		});
	});
};
