/* globals jake: false, task: false, fail: false, complete: false */ // Globals exposed by jake
'use strict';

var smplBuild = require('./src/smpl-build-test');

task('test', ['lint', 'doc']);

task('lint', [], {async: true}, function() {
	var files = new jake.FileList();
	files.include(__dirname + '/*.js');
	files.include(__dirname + '/*.json');
	files.include(__dirname + '/src/**/*.json');
	files.include(__dirname + '/src/**/*.js');
	
	var options = {
		files: files.toArray(),
		js: {
			options: {
				node: true
			}
		},
		fileConfig: {}
	};
	options.fileConfig[__dirname + '/src/jshint.json'] = {
		options: {
			comments: true
		}
	};
	
	smplBuild.lint(options, function(err) {
		if (err) fail();
		else complete();
	});
});

task('doc', [], {async: true}, function() {
	smplBuild.document({
		paths: [__dirname + '/src'],
		outdir: __dirname + '/docs',
		basePath: __dirname,
		project: {
			dir: __dirname,
			logo: '../logo.png'
		}
	}, function(err) {
		if (err) fail();
		else complete();
	});
});