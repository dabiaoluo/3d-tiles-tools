'use strict';

var fsExtra = require('fs-extra');
var path = require('path');
var Promise = require('bluebird');

var combineTileset = require('../../lib/combineTileset');
var gzipTileset = require('../../lib/gzipTileset');

var fsExtraReadFile = Promise.promisify(fsExtra.readFile);
var fsExtraReadJson = Promise.promisify(fsExtra.readJson);
var fsExtraRemove = Promise.promisify(fsExtra.remove);

var tilesetDirectory = './specs/data/TilesetOfTilesets/';
var tilesetJson = './specs/data/TilesetOfTilesets/tileset.json';
var combinedDirectory = './specs/data/TilesetOfTilesets-combined';
var combinedJson = './specs/data/TilesetOfTilesets-combined/tileset.json';
var gzippedDirectory = './specs/data/TilesetOfTilesets-gzipped';

function isGzipped(path) {
    return fsExtraReadFile(path)
        .then(function (data) {
            return (data[0] === 0x1f) && (data[1] === 0x8b);
        });
}

function getFilesInDirectory(directory) {
    return new Promise(function (resolve, reject) {
        var files = [];
        fsExtra.walk(directory)
            .on('data', function (item) {
                if (!item.stats.isDirectory()) {
                    files.push(path.relative(directory, item.path));
                }
            })
            .on('end', function () {
                resolve(files);
            })
            .on('error', reject);
    });
}

function isJson(path) {
    return path.slice(-5) === '.json';
}

describe('combineTileset', function() {
    afterEach(function(done) {
        Promise.all([
            fsExtraRemove(gzippedDirectory),
            fsExtraRemove(combinedDirectory)
        ]).then(function() {
            done();
        });
    });

    it('combines external tilesets into a single tileset', function (done) {
        expect(combineTileset(tilesetDirectory, combinedDirectory)
            .then(function() {
                return getFilesInDirectory(combinedDirectory)
                    .then(function(files) {
                        // Check that only one tileset.json exists in the new directory
                        var length = files.length;
                        var numberOfJsonFiles = 0;
                        for (var i = 0; i < length; ++i) {
                            if (isJson(files[i])) {
                                ++numberOfJsonFiles;
                            }
                        }
                        expect(numberOfJsonFiles).toBe(1);
                        return fsExtraReadJson(combinedJson)
                            .then(function(json) {
                                // TODO : check that json is correct
                            });
                    });
            }), done).toResolve();
    });

    it('works when supplying a json file instead of a directory', function (done) {
        expect(combineTileset(tilesetJson, combinedDirectory)
            .then(function() {
                // Just check that the output file exists
                return fsExtraReadFile(combinedJson)
            }), done).toResolve();
    });

    it('works when no output directory is supplied', function (done) {
        expect(combineTileset(tilesetDirectory)
            .then(function() {
                // Just check that the output file exists
                return fsExtraReadFile(combinedJson);
            }), done).toResolve();
    });

    it('gzips if the original tileset.json is gzipped', function (done) {
        expect(gzipTileset(tilesetDirectory, gzippedDirectory)
            .then(function() {
                return combineTileset(gzippedDirectory, combinedDirectory)
                    .then(function() {
                        return isGzipped(combinedJson)
                            .then(function(gzipped) {
                                expect(gzipped).toBe(true);
                            });
                    });
            }), done).toResolve();
    });

    it('throws error when no input tileset is given ', function (done) {
        expect(combineTileset(), done).toRejectWith(Error);
    });

    it('throws error when input tileset does not exist', function (done) {
        expect(combineTileset('non-existent-tileset', combinedDirectory), done).toRejectWith(Error);
    });
});
