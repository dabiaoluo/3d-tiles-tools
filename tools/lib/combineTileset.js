'use strict';

var Cesium = require('cesium');
var fsExtra = require('fs-extra');
var path = require('path');
var Promise = require('bluebird');
var zlib = require('zlib');

var fsExtraCopyFile = Promise.promisify(fsExtra.copy);
var fsExtraOutputFile = Promise.promisify(fsExtra.outputFile);
var fsExtraOutputJson = Promise.promisify(fsExtra.outputJson);
var fsExtraReadFile = Promise.promisify(fsExtra.readFile);
var zlibGunzip = Promise.promisify(zlib.gunzip);
var zlibGzip = Promise.promisify(zlib.gzip);

var defaultValue = Cesium.defaultValue;
var defined = Cesium.defined;
var DeveloperError = Cesium.DeveloperError;

module.exports = combineTileset;

/**
 * Combines all external tilesets into a single tileset.json file.
 *
 * @param {String} inputPath Path to the tileset directory or tileset.json file.
 * @param {Object} [outputDirectory] Path to the output directory.
 */
function combineTileset(inputPath, outputDirectory) {
    if (!defined(inputPath)) {
        return Promise.reject(new DeveloperError('inputPath is required'));
    }

    inputPath = path.normalize(inputPath);

    var tilesetPath = inputPath;
    if (!isJson(tilesetPath)) {
        tilesetPath = path.join(inputPath, 'tileset.json');
    }

    var tilesetDirectory = path.dirname(tilesetPath);
    var tilesetDirectoryName = path.basename(tilesetDirectory);
    outputDirectory = path.normalize(defaultValue(outputDirectory, path.join(path.dirname(tilesetDirectory), tilesetDirectoryName + '-combined')));
    var outputTilesetPath = path.join(outputDirectory, path.basename(tilesetPath));

    return loadTileset(tilesetPath, tilesetDirectory)
        .then(function (json) {
            return isGzippedFile(tilesetPath)
                .then(function (gzipped) {
                    var promises = [];
                    if (gzipped) {
                        promises.push(outputJsonGzipped(outputTilesetPath, json));
                    } else {
                        promises.push(outputJson(outputTilesetPath, json));
                    }
                    promises.push(copyFiles(tilesetDirectory, outputDirectory));
                    return Promise.all(promises);
                });
        });
}

function loadTileset(tilesetPath, rootDirectory, parentTile) {
    return readTileset(tilesetPath)
        .then(function (json) {
            var tilesetDirectory = path.dirname(tilesetPath);
            var promises = [];
            var root = json.root;

            if (defined(root)) {
                // Modify the parent tile if it exists
                if (defined(parentTile)) {
                    parentTile.content = root.content;
                    parentTile.children = root.children;
                }
                // Loop over all the tiles
                var stack = [];
                stack.push(root);
                while (stack.length > 0) {
                    var tile = stack.pop();
                    // Look for external tilesets
                    if (defined(tile.content)) {
                        var url = tile.content.url;
                        if (isJson(url)) {
                            url = path.join(tilesetDirectory, url);
                            var promise = loadTileset(url, rootDirectory, tile);
                            promises.push(promise);
                        } else {
                            // Make all content urls relative to the root tileset directory
                            url = path.normalize(path.relative(rootDirectory, path.join(path.dirname(tilesetPath), tile.content.url)));
                            tile.content.url = url.replace(/\\/g, '/');
                        }
                    }
                    // Push children to the stack
                    var children = tile.children;
                    if (defined(children)) {
                        var length = children.length;
                        for (var i = 0; i < length; ++i) {
                            stack.push(children[i]);
                        }
                    }
                }
            }
            // Waits for all the external tilesets to finish loading before the promise resolves
            return Promise.all(promises)
                .then(function () {
                    return json;
                });
        });
}

function readTileset(tilesetJson) {
    return fsExtraReadFile(tilesetJson)
        .then(function (data) {
            if (isGzipped(data)) {
                return zlibGunzip(data)
                    .then(function (data) {
                        return JSON.parse(data);
                    });
            } else {
                return JSON.parse(data);
            }
        });
}

function isGzipped(data) {
    return (data[0] === 0x1f) && (data[1] === 0x8b);
}

function isGzippedFile(path) {
    return fsExtraReadFile(path)
        .then(function (data) {
            return isGzipped(data);
        });
}

function isJson(path) {
    return path.slice(-5) === '.json';
}

function outputJson(path, json) {
    return fsExtraOutputJson(path, json);
}

function outputJsonGzipped(path, json) {
    var jsonString = JSON.stringify(json);
    var buffer = new Buffer(jsonString);
    return zlibGzip(buffer)
        .then(function (buffer) {
            return fsExtraOutputFile(path, buffer);
        });
}

function copyFiles(inputDirectory, outputDirectory) {
    return new Promise(function (resolve, reject) {
        var files = [];
        fsExtra.walk(inputDirectory)
            .on('data', function (item) {
                // Don't copy json files
                if (!item.stats.isDirectory() && !isJson(item.path)) {
                    files.push(path.relative(inputDirectory, item.path));
                }
            })
            .on('end', function () {
                Promise.map(files, function (file) {
                    return fsExtraCopyFile(path.join(inputDirectory, file), path.join(outputDirectory, file));
                }, {concurrency: 1024})
                    .then(resolve)
                    .catch(reject);
            })
            .on('error', reject);
    });
}
