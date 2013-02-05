/* jshint node: true, camelcase: false */
/* globals jake: false, task: false */ // Globals exposed by jake
var path = require('path');

task('test', ['lint'], function() {
	
});
task('lint', [], function() {
	require('./smpl-build-test');
	var files = [];
	files.push(path.join(__dirname, 'Jakefile.js'));
	files.push(path.join(__dirname, 'package.json'));
	files.push(path.join(__dirname, 'smpl-build-test.js'));

	var globals = {
	};
	
	jake.Task['smpl-build-test:lint'].invoke(files, globals);
});