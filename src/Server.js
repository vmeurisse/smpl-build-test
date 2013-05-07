
/**
 * Server used to run unit tests
 * 
 * @class Server
 * @constructor
 * 
 * @param config {Object}
 * @param config.path {String} Path to use as root web folder
 * @param config.port {Number} Port to use for web server
 * @param [config.url] {String} Url to point the browser to before test start
 */
var Server = function(config) {
	this.config = config;
};

Server.prototype.start = function() {
	var nodeStatic = require('node-static');
	var file = new nodeStatic.Server(this.config.path);
	this.server = require('http').createServer(function (request, response) {
		request.addListener('end', function () {
			file.serve(request, response);
		});
	});
	this.server.listen(this.config.port);
};

Server.prototype.stop = function() {
	if (this.server) {
		this.server.close();
		delete this.server;
	}
};

module.exports = Server;
