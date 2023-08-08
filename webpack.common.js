const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
	entry: './public/js/main.js',
	plugins: [
		new HtmlWebpackPlugin({
			filename: 'index.html',
			template: 'public/index.html'
		})	
	],
	module: {
		rules: [
			{
				test: /\.html$/i,
				loader: "html-loader",
			},
			{
				test: /\.(png|svg|jpg|jpeg|gif)$/i,
				type: 'asset/resource',
				generator: {
					filename: 'icons/[hash][ext]'
				}
			}
		]
	},
	output: {
		filename: 'main.js',
		path: path.resolve(__dirname, 'package'),
		clean: true
	}
};