
var path = require('path');
var fs = require('fs');
/**
 * Server used to run unit tests
 * 
 * @class Server
 * @constructor
 * 
 * @param config {Object}
 * @param config.path {String} Path to use as root web folder
 * @param config.port {Number} Port to use for web server
 * @param [config.coverageDir] {String} Path to coverage directory. Used to write reports from browsers
 */
var Server = function(config) {
	this.config = config;
};

Server.prototype.start = function() {
	var nodeStatic = require('node-static');
	var staticServer = new nodeStatic.Server(this.config.path);
	this.server = require('http').createServer(this.handleRequest.bind(this, staticServer));
	this.server.listen(this.config.port);
};

Server.prototype.stop = function() {
	if (this.server) {
		console.log('stoping server');
		this.server.close();
		delete this.server;
	}
};

Server.prototype.handleRequest = function (staticServer, request, response) {
	if (request.url === '/postResults' && this.config.coverageDir) {
		if (request.method == 'POST') {
			var qs = require('querystring');
			var body = '';
			request.on('data', function (data) {
				body += data;
			});
			request.on('end', (function () {
				var postData = qs.parse(body);
				if (postData.coverage) {
					console.log('Adding data for ' + (request.headers['user-agent'] || 'unknown broser'));
					var filename = (Math.random()*99999999).toFixed(0) + '.json';
					filename = path.join(this.config.coverageDir, 'data', filename);
					fs.writeFile(filename, postData.coverage, function (err) {
						if (err) throw err;
						response.writeHead(200);
						response.end("ok\n");
					});
				}
			}).bind(this));
		}
	} else {
		request.addListener('end', function () {
			staticServer.serve(request, response);
		});
	}
};

module.exports = Server;
