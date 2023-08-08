require('dotenv/config.js');
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
	mode: 'development',
	devtool: 'inline-source-map',
	devServer: {
		hot: true,
		port: 8080,
		proxy: [
			{
				context: [ '/api', '/f' ],
				target: `http://${process.env.EXPRESS_HOST ?? 'localhost'}:${process.env.EXPRESS_PORT ?? '3005'}`
			}
		]
	},
	module: {
		rules: [
			{
				test: /\.s[ac]ss$/i,
				use: [
					'style-loader',
					'css-loader',
					{
						loader: 'postcss-loader',
						options: {
							postcssOptions: {
								plugins: () => require('autoprefixer')
							}
						}
					},
					'sass-loader'
				]
			}
		]
	}
});