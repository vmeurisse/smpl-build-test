/* jshint node: true */
/* globals jake: false, task: false, fail: false, complete: false */ // Globals exposed by jake

task('test', ['lint']);

task('lint', [], {async: true}, function() {
	var smplBuild = require('./src/smpl-build-test');
	
	var files = new jake.FileList();
	files.include(__dirname + '/*.js');
	files.include(__dirname + '/*.json');
	files.include(__dirname + '/src/**/*.json');
	files.include(__dirname + '/src/**/*.js');
	
	var globals = {
	};
	
	smplBuild.lint({
		files: files.toArray(),
		globals: globals
	}, function(err) {
		if (err) fail();
		else complete();
	});
});
