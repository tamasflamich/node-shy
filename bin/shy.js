#!/usr/bin/env node

require('../lib/shy-cli.js')({
    argv: require('minimist')(process.argv.slice(2)),
    ws: process.env['SHY_DIR']
}, function(code) {
    process.exit(code || 0);
});