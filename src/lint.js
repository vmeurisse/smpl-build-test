var path = require('path');
var shjs = require('shelljs');
shjs.config.fatal = true; //tell shelljs to fail on errors
var jshint = require('jshint').JSHINT;

var has = function(o, p) {
	return Object.prototype.hasOwnProperty.call(o, p);
};

var combine = function(a, b) {
	for (var key in b) {
		if (has(b, key)) {
			a[key] = b[key];
		}
	}
};

var combineOptions = function(def, overides) {
	if (!overides) return def;
	var options = {};
	combine(options, def);
	combine(options, overides);
	return options;
};
var lintJS = function(filePath, options, globals) {
	jshint(shjs.cat(filePath), options, globals);
	var hasErrors = false;
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
			// Do not require {} for one line blocks
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
			
			if (!hasErrors) {
				// First error in the file. Display filename
				console.log('\n' + filePath);
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
	return hasErrors;
};

var lintJson = function(filePath, options) {
	var jsonLint = require('json-lint');
	
	// Run the JSON string through the linter
	var lint = jsonLint(shjs.cat(filePath), options);
	
	// Do something with the error
	if (lint.error) {
		console.log('\n' + filePath);
		console.log('line ' + lint.line + ', char ' + lint.character + ': ' + lint.error);
	}
	return !!lint.error;
};

exports = module.exports = function(config, cb) {
	config.js = config.js || {};
	config.json = config.json || {};
	
	if (config.fileConfig) {
		var fileConfig = config.fileConfig;
		config.fileConfig = {};
		for (var file in fileConfig) {
			config.fileConfig[path.normalize(file)] = fileConfig[file];
		}
	} else {
		config.fileConfig = {};
	}
	
	var compress = require('json-compressor');
	var jsOptions = JSON.parse(compress(shjs.cat(path.join(__dirname, 'jshint.json'))));
	combine(jsOptions, config.js.options || {});
	var jsGlobals = config.js.globals || {};
	
	var jsonOptions = {
		comments: false
	};
	combine(jsonOptions, config.json.options || {});
	
	console.log('Linting ' + config.files.length + ' files...');

	var hasErrors = false;
	config.files.forEach(function (file) {
		/* jshint bitwise: false */
		
		file = path.normalize(file);
		var fileConfig = config.fileConfig[file] || {};
		var fileType = fileConfig.type || path.extname(file).slice(1);
		var options;
		switch (fileType) {
			case 'js':
				options = combineOptions(jsOptions, fileConfig.options);
				var globals = combineOptions(jsGlobals, fileConfig.globals);
				
				hasErrors |= lintJS(file, options, globals);
				break;
			case 'json':
				options = combineOptions(jsonOptions, fileConfig.options);
				hasErrors |= lintJson(file, options);
				break;
			default:
				console.log('\n', file);
				console.log('unknown file type: <' + fileType + '>');
				hasErrors = true;
		}
	});
	if (hasErrors) {
		cb('Lint failed');
	} else {
		console.log('ok');
		cb();
	}
};
