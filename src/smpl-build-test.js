/* jshint node: true, camelcase: false */
/**
 * Set of utilities to build javascript projects
 *
 * @module smpl-build-test
 * @class smpl-build-test
 * @static
 */

var path = require('path');
var fs = require('fs');
var shjs = require('shelljs');
shjs.config.fatal = true; //tell shelljs to fail on errors

/**
 * Wraper arround [mocha](http://visionmedia.github.com/mocha/)
 * 
 * @method test
 * @param config {Object}
 * @param [config.reporter] {String|function} reporter to use for mocha
 * @param [config.globals] {Array.String} List of globals to ignore for the leak detection
 * @param config.tests {Array.String} Path of the files to use for tests
 * @param cb {Function} cb when the tests are finished
 * @param cb.failures {Number} Number of test failures
 */
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

/**
 * Test coverage using [mocha](http://visionmedia.github.com/mocha/) and
 * [istanbul](https://github.com/gotwarlost/istanbul)
 * 
 * @method coverage
 * @param config {Object}
 * @param [config.globals] {Array<String>} See {{#crossLink "smpl-build-test/test:method"}}{{/crossLink}}
 * @param config.tests {Array.String} {{#crossLink "smpl-build-test/test:method"}}{{/crossLink}}
 * @param [config.baseDir=process.cwd()] {String} Base project directory
 * @param [config.src=`config.baseDir`/src] {String} Source folder to instrument
 * @param [config.coverageDir=`config.baseDir`/coverage] {String} Folder to use for instrumented source and coverage
 *         results
 * @param [config.minCoverage] {Number|Object} Fail if coverage is lower than `minCoverage`. Positive values are treated
 *        as a minimum percentage of coverage. Negative values are a maximum number of uncovered lines.  
 *        Setting this a a number has the same effect as setting all four properties to the same value
 * @param [config.minCoverage.statements] {Number}
 * @param [config.minCoverage.branches] {Number}
 * @param [config.minCoverage.functions] {Number}
 * @param [config.minCoverage.lines] {Number}
 * @param cb {Function} Callback when the coverage report is ready
 * @param cb.failures {Number} Number of test failures
 */
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

/**
 * Lint files using [JSHint](http://jshint.com/)
 * 
 * @method lint
 * @param config {Object}
 * @param config.globals {Object} Map of <String, Boolean> to list predefined globals when linting files. Key is the
 *        global name. Value is `true` is code can redefine the value, `false` otherwise.
 * @param config.files {Array.String} List of files to lint.
 * @param cb {Function} Callback will take the following parameters
 * @param cb.failure {String} Will have the value `'Lint failed'` if there is errors, `undefine` otherwise.
 */
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
		console.log();
		console.log();
		cb();
	}
};

/**
 * Run tests on remote browsers using [SauceLabs](https://saucelabs.com/)
 * 
 * @method remote
 * @param config {Object} config for {{#crossLink "Remote"}}{{/crossLink}}
 * @param cb {Function} Callback when tests are finished running.
 * @param cb.failures {Number} Number of browsers that failled
 */
exports.remote = function(config, cb) {
	var Remote = require('./Remote');
	new Remote(config).run(cb);
};

/**
 * Generate documentation using [YUIDoc](http://yui.github.com/yuidoc/)
 * 
 * @method document
 * @param config {Object}
 * @param [config.linkNatives] {Boolean} Selects whether to autolink native types such as String and Object over to the
 *        Mozilla Developer Network.
 * @param config.paths {Array.String} Specifies an array of folders to search for source to parse
 * @param [config.exclude] {String} Specify a comma separated list of names you want to exclude from parses when YUIDoc
 *        recurses the source tree
 * @param config.outdir {String} Specifies the directory in which to place the rendered HTML files and assets
 * @param [config.project] {Object} Informations about the project
 * @param [config.project.name] {String} A short name for the project
 * @param [config.project.description] {String} A one or two sentence description of the project
 * @param [config.project.version] {String} The project's current version, as some kind of meaningful string
 * @param [config.project.url] {String} The project's primary URL. This does not necessarily have to be the URL of the
 *        generated API documentation
 * @param [config.project.logo] {String} The logo to add to the header of all generated HTML documentation. If you do
 *        not provide a header, YUIDoc will use the YUI logo by default
 * @param [config.project.dir] {String} If provided, will try to extract project's `name`, `description`, `version` and
 *        `url` from package.json
 * @param cb {Function} Callback when tests are finished running.
 * @param cb.failures {String} Error message if any.
 */
exports.document = function(config, cb) {
	var yuidocjs = require('yuidocjs');
	config.project = config.project || {};
	if (config.project.dir) {
		var packageJson = require(path.join(config.project.dir, 'package.json'));
		config.project.name = config.project.name || packageJson.name;
		config.project.description = config.project.description || packageJson.description;
		config.project.version = config.project.version || packageJson.version;
		config.project.url = config.project.url || packageJson.homepage;
		delete config.project.dir;
	}
	
	var json = (new yuidocjs.YUIDoc(config)).run();
	if (json.warnings.length) {
		cb('Error parsing doc tags');
	} else {
		if (!config.project.logo) {
			config.project.logo = 'logo.png';
			shjs.cp(path.join(__dirname, '..', 'logo.png'), config.outdir);
		}
		var builder = new yuidocjs.DocBuilder(config, json);
		builder.compile(function() {
			cb();
		});
	}
};
