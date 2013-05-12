
// This prevent the browser to keep the connection open. It allows the server to exit quickly.
var NO_KEEP_ALIVE = {
	Connection: 'close'
};
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
	this.coverage = null;
};

Server.prototype.start = function() {
	console.log('starting server');
	var nodeStatic = require('node-static');
	var staticServer = new nodeStatic.Server(this.config.path, {headers: NO_KEEP_ALIVE});
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

Server.prototype.setCoverage = function(coverage) {
	this.coverage = coverage;
};

Server.prototype.handleRequest = function(staticServer, request, response) {
	if (request.url === '/postResults' && this.coverage && request.method === 'POST') {
		var qs = require('querystring');
		var body = '';
		request.on('data', function (data) {
			body += data;
		});
		request.on('end', function () {
			var postData = qs.parse(body);
			if (postData.coverage) {
				console.log('Adding coverage data for ' + (request.headers['user-agent'] || 'unknown browser'));
				this.coverage.writeFile(postData.coverage);
				response.writeHead(200, NO_KEEP_ALIVE);
				response.end('ok\n');
			} else {
				response.writeHead(400, NO_KEEP_ALIVE);
				response.end('Missing coverage data.\n');
			}
		}.bind(this));
	} else {
		request.addListener('end', function () {
			staticServer.serve(request, response);
		}).resume();
	}
};

module.exports = Server;
