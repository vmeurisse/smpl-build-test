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
 * Run unit tests
 * 
 * @method tests
 * @param config {Object} config. See {{#crossLink "Tests"}}{{/crossLink}}
 * @param cb {Function} Callback when tests are finished running.
 * @param cb.err {*} Errors, if any.
 * @return {Object} If `config.manualStop` is `true`, return an object with a `stop` method.
 */
exports.tests = function(config, cb) {
	var Tests = require('./Tests');
	return new Tests(config).run(cb);
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
