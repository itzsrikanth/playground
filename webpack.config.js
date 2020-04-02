const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const NunjucksWebpackPlugin = require('nunjucks-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const WebpackManifestPlugin = require('webpack-manifest-plugin');
const CaseSensitivePathsPlugin = require('case-sensitive-paths-webpack-plugin');
const WatchMissingNodeModulesPlugin = require('react-dev-utils/WatchMissingNodeModulesPlugin');
const clearConsole = require('react-dev-utils/clearConsole');
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
/**
 * Optimizing TS build
 * https://medium.com/webpack/typescript-webpack-super-pursuit-mode-83cc568dea79
 */
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
/**
 * Uglify is deprecated
 */
const TerserPlugin = require('terser-webpack-plugin');
const OptimizeCSSAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const HappyPack = require('happypack');
const yaml = require('js-yaml');

clearConsole();

const BUILD_DIR = path.join(__dirname, 'dist');

const data = yaml.safeLoad(
    fs.readFileSync(
        path.join(__dirname, 'data.yaml'),
        'utf8'
    )
);

const templates = data.map(value => {
    if (value.slug.startsWith('/')) {
        value.slug.replace('^/', '');
    }
    const path = /^(.*?)(\w[\w\-\.]*\/?)$/.exec(value.slug);
    if (path && path[2]) {
        /**
         * path is identified as file if it contains a dot
         * else it is identified as directory
         * When directory is specified, index.html is appended
         * If any other filename is specified instead of 'index.html',
         * that file name is used to create a directory, followed by
         * appending 'index.html'
         */
        if (path[2].indexOf('.') === -1) {
            path[1] += path[2].endsWith('/') ? `${path[2]}index.html` : `${path[2]}/index.html`;
        }
        else if (path[2] !== 'index.html') {
            path[1] += `${path[2].replace(/\.\w+$/, '')}/index.html`;
        } else {
            path[1] += 'index.html'
        }
    } else {
        throw Error(`Incorrect slug: ${value.slug}`);
    }
    return {
        from: `${__dirname}/${value.template}`,
        to: `${BUILD_DIR}/${path[1]}`,
        context: value.context
    }
});

module.exports = function (_, argv) {
    /**
     * Common definitions for dev and prod
     */
    const { parsed, error } = dotenv.config({
        path: path.join(__dirname, `.${argv.mode}.env`)
    });
    if (error) throw error;
    const sassConfig = [
        'css-loader',
        {
            loader: 'postcss-loader', // Run post css actions
            options: {
                plugins: function () { // post css plugins, can be exported to postcss.config.js
                    return [
                        require('precss'),
                        require('autoprefixer')
                    ];
                }
            }
        },
        'sass-loader'
    ];
    const plugins = [
        new NunjucksWebpackPlugin({
            templates,
            configure: {
                autoescape: true,
                throwOnUndefined: false,
                trimBlocks: true,
                watch: false,
                noCache: true
            }
        }),
        new HappyPack({
            id: 'ts',
            threads: 4,
            loaders: [
                {
                    path: 'ts-loader',
                    query: { happyPackMode: true }
                }
            ]
        }),
        new ForkTsCheckerWebpackPlugin({
            tsconfig: path.resolve(__dirname, './tsconfig.json'),
            checkSyntacticErrors: true
        }),
        new CleanWebpackPlugin(),
        // To ease debugging files generated in webpack
        new WebpackManifestPlugin(),
        new CaseSensitivePathsPlugin(),
        new WatchMissingNodeModulesPlugin(path.resolve('node_modules')),
        new BundleAnalyzerPlugin({
            analyzerMode: 'disabled',
            openAnalyzer: false,
            generateStatsFile: true
        })
    ];
    let config = {
        entry: {
            index: ['./assets/ts/index.ts', './assets/scss/styles.scss']
        },
        output: {
            filename: '[name].[hash].js?',
            path: BUILD_DIR
        },
        context: __dirname,
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    loader: 'babel-loader'
                },
                /**
                 * Inspiration behind using typescript:
                 * https://iamturns.com/typescript-babel/
                 */
                {
                    test: /\.ts$/,
                    exclude: /node_modules/,
                    use: [
                        { loader: 'cache-loader' },
                        {
                            loader: 'thread-loader',
                            options: {
                                // there should be 1 cpu for the fork-ts-checker-webpack-plugin
                                workers: require('os').cpus().length - 1,
                            },
                        },
                        {
                            loader: 'ts-loader',
                            options: {
                                // to speed-up compilation and reduce errors reported to webpack
                                happyPackMode: true
                            }
                        },
                        'eslint-loader'
                    ]
                },
                {
                    test: /\.scss$/,
                    use: sassConfig
                }
            ]
        },
        plugins
    };
    if (argv.mode !== 'production') {
        config = {
            ...config,
            devtool: 'source-map'
        };
    } else {
        config = {
            ...config,
            optimization: {
                minimize: true,
                minimizer: [
                    new TerserPlugin(),
                    new OptimizeCSSAssetsPlugin()
                ]
            }
        }
    }
    if (process.env.WEBPACK_DEV_SERVER) {
        config = {
            ...config,
            devServer: {
                contentBase: __dirname,
                compress: true,
                port: parsed.SERVER_PORT,
                host: 'localhost',
                hot: true,
                writeToDisk: true,
                inline: true
            }
        };
        sassConfig.unshift('style-loader');
        console.log(JSON.stringify(config.devServer));
    } else {
        sassConfig.unshift({
            loader: MiniCssExtractPlugin.loader,
            options: {
                publicPath: '/assets/css/',
                esModule: true,
                hmr: true
            }
        });
        plugins.push(new MiniCssExtractPlugin({
            filename: '[name].[hash].css',
            chunkFilename: '[id].css'
        }));
    }
    return config;
}
