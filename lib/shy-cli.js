var cp      = require('child_process'),
    fs      = require('fs'),
    path    = require('path');

module.exports = function(ctx, cb) {
    var cmd = ctx.argv._[0];

    if (!validateWs(ctx.ws)) {
        cb(1);
        return;
    }

    switch(cmd) {
        case "print":
            print(ctx, cb);
            return;
        case "track":
            track(ctx, cb);
            return;
        case "assert":
            assert(ctx, cb);
            return;
        case "file":
            file(ctx, cb);
            return;
    }

    err('invalid command');
    cb(1);
}

function file(ctx, cb) {
    var file = ctx.argv._[1];

    ensureDir(file);
    var outStream = fs.createWriteStream(file);

    process.stdin.pipe(outStream);
    process.stdin.on('close', function() {
        cb();
    });

    function ensureDir(file) {
        var x = path.parse(file);
        if (x.dir && !fs.existsSync(x.dir)) {
            ensureDir(x.dir);
            fs.mkdirSync(x.dir);
        }
    }
}

function print(ctx, cb) {
    var ref = ctx.argv._[1];
    var file = resolveRefFile(ref);

    if (!file) {
        err('invalid param: ' + ref);
        cb(1);
    }

    var fullPath = getPath(ctx, file);

    if (!fs.existsSync(fullPath)) {
        cb(0);
    }

    var stream = fs.createReadStream(fullPath);

    stream.pipe(process.stdout);
    stream.on('end', function() {
        cb(0);
    })
}

function track(ctx, cb) {
    var cmd = ctx.argv._.slice(1).join(' ');
    var ps = cp.exec(cmd);

    var fout = writeStream(ctx, 'track_stdout');
    var ferr = writeStream(ctx, 'track_stderr');

    connectStreams(process.stdin, [ ps.stdin ], []);
    connectStreams(ps.stdout, [ fout ], [ process.stdout ]);
    connectStreams(ps.stderr, [ ferr ], [ process.stderr ]);

    ps.on('close', function(code) {
        write(ctx, 'track_code', code);
        cb(0);
    });
}

function assert(ctx, cb) {
    var argv = ctx.argv;
    var actual = argv._[1];
    var op = argv._[2];
    var expected = ensure(argv._[3], '');

    var expr = argv._.slice(1).join(' ');

    if (actual == null || op == null) {
        err('invalid shy assert expression: ' + expr);
        cb(1);
        return;
    }

    expected = expected
        .toString()
        .replace(/\\n/g, '\n')
        .replace(/\\\\/g, '\\');

    var assert = createAssert(op);

    if (!assert) {
        err('invalid "shy assert" operator: ' + expr);
        cb(1);
        return;
    }

    if (!assert.unary && expected == null) {
        err('invalid "shy assert" expression: ' + expr);
        cb(1);
        return;
    }

    var actualRef = resolveRefFile(actual);

    if (actualRef) {
        var actualPath = getPath(ctx, actualRef);

        if (!fs.existsSync(actualPath)) {
            err('use "shy track" before "shy assert"');
            cb(1);
            return;
        }

        actual = (fs.readFileSync(actualPath, 'utf8') || '');
    } 

    var res = false;
    var op = '=='

    if (assert.unary) {
        expected = 'true';
        res = assert.fn(actual);
        actual = res ? 'true' : 'false';
    }
    else {
        res = assert.fn(actual, expected);
        op = assert.op;
    }

    if (res) {
        cb(0);
        return;
    }

    var msg = argv.message || argv.msg || ('assertion failed: ' + expr);

    write(ctx, 'result_expected', expected);
    write(ctx, 'result_actual', actual);
    write(ctx, 'result_op', op);
    write(ctx, 'result_message', msg);

    cb(1);
}

function resolveRefFile(ref) {
    var refs = {
        '{stderr}': 'track_stderr',
        '{stdout}': 'track_stdout',
        '{code}': 'track_code'
    };

    return refs[ref];
}

function ensure(x, fallback) {
    return typeof x == 'undefined' ? fallback : x;
}

function createAssert(op) {
    switch (op) {
        case '=':
        case '==':
            return {
                op: '==',
                fn: function(l, r) {
                    return l == r;
                }
            }
        case '!=':
            return {
                op: '!=',
                fn: function(l, r) {
                    return l != r;
                }
            }
        case "exists":
            return {
                unary: true,
                fn: function(x) {
                    return fs.existsSync(x);
                }
            }
        case "not-exists":
            return {
                unary: true,
                fn: function(x) {
                    return !fs.existsSync(x);
                }
            }
    }
}

function write(ctx, file, content) {
    if (!fs.existsSync(ctx.ws)) {
        return;
    }

    var filePath = getPath(ctx, file);
    fs.writeFileSync(filePath, content);
}

function writeStream(ctx, name) {
    if (!fs.existsSync(ctx.ws)) {
        return null;
    }

    var filePath = getPath(ctx, name);
    return fs.createWriteStream(filePath);
}

function getPath(ctx, name) {
    return path.join(ctx.ws, name);
}

function err(msg) {
    process.stderr.write(msg + '\n');
}

function connectStreams(src, d1, d2) {
    d1.concat(d2).forEach(function(x) {
        if (x) {
            src.pipe(x);
        }
    });
    src.on('end', function() {
        d1.forEach(function(x) {
            x.end();
        });
    });
}

function validateWs(dir) {
    if (!dir) {
        err('err: missing shy workspace');
        return false;
    }

    if (!fs.existsSync(dir)) {
        err('err: non existing shy workspace');
        return false;
    }

    if (!fs.statSync(dir).isDirectory()) {
        err('err: shy workspace is not a directory')
        return false;
    }

    return true;
}