/* jshint node: true, camelcase: false */
/* globals task: false, fail: false, namespace: false */ // Globals exposed by jake
/* globals cat: false, config: false, echo: false */ // Globals exposed by shelljs

var path = require('path');
//var child_process = require('child_process');
require('shelljs/global');
config.fatal = true; //tell shelljs to fail on errors

var EXIT_CODES = {
	lintFailed: 101,
	remoteTests: 3,
	sauceLabsCredentials: 4,
	sauceConnect: 5
};

namespace('smpl-build-test', function() {
	task('lint', [], function(files, globals) {
		globals = globals || {};
		var jshint = require('jshint').JSHINT;
		var options = JSON.parse(cat(path.join(__dirname, 'jshint.json')));
		
		echo('Linting ' + files.length + ' files...');

		var hasErrors = false;
		files.forEach(function (file) {
			jshint(cat(file), options, globals);
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
						// https://github.com/jshint/jshint/issues/824
						if (err.character === 0) {
							return;
						}
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
						echo('\n', file);
						passed = false;
						hasErrors = true;
					}
					line = '[L' + err.line + ':' + err.code + ']';
					while (line.length < 15) {
						line += ' ';
					}
					
					echo(line, err.reason);
					console.log(err.evidence.replace(/\t/g, '    '));
					console.log(new Array(err.character).join(' ') + '^');
				});
			}
		});
		if (hasErrors) {
			fail('FAIL !!!', EXIT_CODES.lintFailed);
		} else {
			echo('ok');
		}
	});
});