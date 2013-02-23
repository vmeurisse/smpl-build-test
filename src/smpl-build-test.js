/* jshint node: true, camelcase: false */

var path = require('path');
var fs = require('fs');
var shjs = require('shelljs');
shjs.config.fatal = true; //tell shelljs to fail on errors

var test = exports.test = function(config, cb) {
	var Mocha = require('mocha');
	
	var mocha = new Mocha({
		ui: 'tdd',
		reporter: config.reporter,
		globals: config.globals
	});
	config.tests.forEach(function(file) {
		// Force reimport
		require.cache[require.resolve(file)] = null;
		mocha.addFile(file);
	}, this);
	
	// Now, you can run the tests.
	mocha.run(function(failures) {
		cb(failures);
	});
};

exports.coverage = function(config, cb) {
	var istanbul = require('istanbul');
	
	config.baseDir = config.baseDir || process.cwd();
	config.src = config.src || path.join(config.baseDir, 'src');
	config.coverageDir = config.coverageDir || path.join(config.baseDir, 'coverage');
	var coverageDirSrc = path.join(config.coverageDir, 'src');
	var dataDir = path.join(config.coverageDir, 'data');
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
	
	
	process.env.SMPL_COVERAGE = '1';
	
	var reporter = require('./coverageReporter');
	reporter.setBaseDir(config.coverageDir);
	reporter.setMinCoverage(config.minCoverage);
	
	test({
		tests: config.tests,
		globals: config.globals,
		reporter: reporter
	}, function(err) {
		process.env.SMPL_COVERAGE = '';
		cb(err);
	});
};

exports.lint = function(config, cb) {
	config.globals = config.globals || {};
	var jshint = require('jshint').JSHINT;
	var options = JSON.parse(shjs.cat(path.join(__dirname, 'jshint.json')));
	var jsonOptions = Object.create(options);
	jsonOptions.quotmark = 'double';
	
	console.log('Linting ' + config.files.length + ' files...');

	var hasErrors = false;
	config.files.forEach(function (file) {
		var opts = (file.slice(-5) === '.json') ? jsonOptions : options;
		jshint(shjs.cat(file), opts, config.globals);
		var passed = true;
		var errors = jshint.data().errors;
		if (errors) {
			errors.forEach(function(err) {
				if (!err) {
					return;
				}
				// Tabs are counted as 4 spaces for column number.
				// Lets replace them to get correct results
				var line = err.evidence.replace(/\t/g, '    ');
				
				// ignore trailing spaces on indentation only lines
				if (err.code === 'W102' && err.evidence.match(/^\t+$/)) {
					return;
				}
				// Do no require {} for one line blocks
				if (err.code === 'W116' && err.a === '{' &&
					err.evidence.match(/^\t* *(?:(?:(?:if|for|while) ?\()|else).*;(?:\s*\/\/.*)?$/)) {
					return;
				}
				
				// Allow double quote string if they contain single quotes
				if (err.code === 'W109') {
					var i = err.character - 2; //JSHINT use base 1 for column and return the char after the end
					var singleQuotes = 0;
					var doubleQuotes = 0;
					while (i-- > 0) {
						if (line[i] === "'") singleQuotes++;
						else if (line[i] === '"') {
							var nb = 0;
							while (i-- && line[i] === '\\') nb++;
							if (nb % 2) doubleQuotes++;
							else break;
						}
					}
					if (singleQuotes > doubleQuotes) {
						return;
					}
				}
				
				// Do not require a space after `function`
				if (err.code === 'W013' && err.a === 'function') {
					return;
				}
				
				// bug in jslint: `while(i--);` require a space before `;`
				if (err.code === 'W013' && line[err.character - 1] === ';') {
					return;
				}
				
				// Indentation. White option turn this on. Need to fix indentation for switch case before activating
				if (err.code === 'W015') return;
				
				if (passed) {
					// First error in the file. Display filename
					console.log('\n', file);
					passed = false;
					hasErrors = true;
				}
				line = '[L' + err.line + ':' + err.code + ']';
				while (line.length < 15) {
					line += ' ';
				}
				
				console.log(line, err.reason);
				console.log(err.evidence.replace(/\t/g, '    '));
				console.log(new Array(err.character).join(' ') + '^');
			});
		}
	});
	if (hasErrors) {
		cb('Lint failed');
	} else {
		console.log('ok');
		cb();
	}
};

exports.remote = function(config, cb) {
	var Remote = require('./Remote');
	new Remote(config).run(cb);
};
