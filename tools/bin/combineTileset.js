#!/usr/bin/env node
'use strict';

var yargs = require('yargs');

var combineTileset = require('../lib/combineTileset');

var argv = yargs
    .help('help')
    .alias('help', 'h')
    .string('input')
    .demand('input')
    .describe('input', 'Input directory or tileset.json path')
    .alias('input', 'i')
    .string('output')
    .describe('output', 'Output directory')
    .alias('output', 'o')
    .argv;

combineTileset(argv.input, argv.output)
    .then(function() {
        console.log('Done');
    });
