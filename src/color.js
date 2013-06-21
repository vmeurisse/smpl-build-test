/*jshint camelcase: false*/

var codes = {
	red: [31, 39],
	green: [32, 39],
	white: [37, 39],
	cyan: [36, 39],
	margenta: [35, 39],
	black: [30, 39],
	yellow: [33, 39],
	blue: [34, 39],
	red_bg: [41, 49],
	green_bg: [42, 49],
	white_bg: [47, 49],
	cyan_bg: [46, 49],
	margenta_bg: [45, 49],
	black_bg: [40, 49],
	yellow_bg: [43, 49],
	blue_bg: [44, 49],
	reverse: [7, 0],
	forward: [27, 0],
	bold: [1, 22],
	italic: [3, 23],
	underline: [4, 24],
	strike: [9, 29]
};

var colorize = function(color, txt) {
	var colors = color.split('+');
	
	var ansi = '';
	for (var i = 0; i < colors.length; i++) {
		ansi += '\x1B[' + codes[colors[i]][0] + 'm';
	}
	ansi += txt;
	i = colors.length;
	while (i--) {
		ansi += '\x1B[' + codes[colors[i]][1] + 'm';
	}
	return ansi;
};

if (process.stdout.isTTY) {
	colorize.auto = colorize;
} else {
	colorize.auto = function(color, txt) {
		return txt;
	};
}

exports = module.exports = colorize;
