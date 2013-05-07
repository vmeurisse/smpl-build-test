/**
 * Set of utilities to build javascript projects
 *
 * @module smpl-build-test
 * @class smpl-build-test
 * @static
 */
'use strict';

var path = require('path');

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
	var coverage = require('./coverage');
	coverage.normalizeConfig(config);
	coverage.prepare(config);
	
	process.env.SMPL_COVERAGE = '1';
	
	var reporter = require('./coverageReporter');
	reporter.setCoverageDir(config.coverageDir);
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
 * Lint files using [JSHint](http://jshint.com/) and [json-lint](https://npmjs.org/package/json-lint)
 * 
 * @method lint
 * @param config {Object}
 * @param config.files {Array.String} List of files to lint.
 * @param [config.js] {Object} Configuration for js files
 * @param [config.js.options] {JSHintOptions}
 * @param [config.js.globals] {Object} Map of `<String, Boolean>` to list predefined globals when linting files. Key is
 *                            the global name. Value is `true` if code can redefine the value, `false` otherwise.
 * @param [config.json] {Object}
 * @param [config.json.options] {Object}
 * @param [config.json.options.comments=false] {boolean} Allows comments inside the json file
 * @param [config.fileConfig] {Object} Specific config per file. The key is the file name (it must match the name
 *                            passed in `config.files`. The values are Objects with the following syntax:
 * @param [config.fileConfig.type] {String} `'json'` or `'js'`. Default to file extention
 * @param [config.fileConfig.options] {Object} See `config.js.options` or `config.json.options`
 * @param [config.fileConfig.globals] {Object} Only for `js` files. See `config.js.globals`.
 * @param cb {Function} Callback will take the following parameters
 * @param cb.failure {String} Will have the value `'Lint failed'` if there is errors, `undefine` otherwise.
 */
exports.lint = function(config, cb) {
	require('./lint')(config, cb);
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
 * @param config.basePath {String} Project base directory. This part of the path will be hidden from the generated doc
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
 * @param cb.failures {number} Error count
 */
exports.document = function(config, cb) {
	var yuidocjs = require('yuidocjs');
	console.log('Generating documentation...');
	//yuidocjs.config.debug = false;
	
	config.project = config.project || {};
	if (config.project.dir) {
		var packageJson = require(path.join(config.project.dir, 'package.json'));
		config.project.name = config.project.name || packageJson.name;
		config.project.description = config.project.description || packageJson.description;
		config.project.version = config.project.version || packageJson.version;
		config.project.url = config.project.url || packageJson.homepage;
		delete config.project.dir;
	}

	// Avoid having full path in the generated docs
	var originalDir = process.cwd();
	if (config.basePath) {
		process.chdir(config.basePath);
		delete config.basePath;
	}
	
	for (var i = 0; i < config.paths.length; i++) {
		config.paths[i] = path.relative(process.cwd(), config.paths[i]) || '.';
	}
	config.quiet = true;
	config.extension = config.extension || '.js,.json';
	var json = (new yuidocjs.YUIDoc(config)).run();
	process.chdir(originalDir);
	
	if (json.warnings.length) {
		var count = 0;
		console.log('YUIDoc found', json.warnings.length, 'lint errors in your docs');
		json.warnings.forEach(function(item) {
			count++;
			console.log('#' + count, item.message, item.line + '\n');
		});
		cb(count);
	} else {
		if (!config.project.logo) {
			config.project.logo = 'logo.png';
			shjs.cp(path.join(__dirname, '..', 'logo.png'), config.outdir);
		}
		var builder = new yuidocjs.DocBuilder(config, json);
		builder.compile(function() {
			console.log('ok');
			cb(0);
		});
	}
};

/**
 * Generate the configuration needed by require.js for a package installed by npmjs
 * 
 * @method requireConfig
 * @param name {String} Name of the package
 * @param [base] {String} Base used by require.js. If not passed, will return absolute folders
 * @param req {Function} require function from your module. Needed to correctly find packages.
 */
exports.requireConfig = function(name, base, req) {
	req = req || require;
	var packageJson = req(name + '/package.json');
	var location = path.dirname(req.resolve(name + '/package.json'));
	var main = req.resolve(name);
	var libDir = path.resolve(location, packageJson.directories && packageJson.directories.lib || location);
	main = path.relative(libDir, main);
	if (base) {
		libDir = path.relative(base, libDir);
	}
	
	return {
		name: name,
		location: libDir,
		main: main
	};
};
