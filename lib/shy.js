var assert  = require('assert'),
    cp      = require('child_process'),
    fs      = require('fs'),
    path    = require('path'),
    temp    = require('temp');

var _execDir    = null,
    _scriptDir  = __dirname;

require.extensions['.shy'] = function(module, filename) {
    var file = path.parse(filename);

    it(file.name, function(done) {
        temp.track();

        var projRoot = findRoot(file.dir);
        var shyRoot = path.resolve(path.join(_scriptDir, '..'));
        var pkgBinDir = path.join(projRoot, 'node_modules/.bin');

        var execDir = ensureExecDir([shyRoot, projRoot]);

        var origPath = process.env.PATH;
        process.env.PATH = execDir + ':' + pkgBinDir + ':' + process.env.PATH;

        runTest(filename, {}, function() {
            process.env.PATH = origPath;
            done();
        });
    });
};

function ensureExecDir(dirs) {
    if (_execDir) {
        return _execDir;
    }

    var execDir = temp.track().mkdirSync();

    dirs.forEach(function(x) {
        if (x && fs.existsSync(x)) {
            link(x, execDir);
        }
    });

    _execDir = execDir;
    return execDir;
}

function link(src, dest) {
    var pkg = require(path.join(src, 'package.json'));
    var bin = pkg.bin || {};

    Object.keys(bin).forEach(function(key) {
        var val = bin[key];
        var link = path.join(dest, key);
        var orig = path.resolve(path.join(src, val));

        fs.symlinkSync(orig, link);
        fs.chmodSync(link, '755');
    });
}

function runTest(filename, opts, done) {
    var sandbox = temp.track().mkdirSync();
    var shyDir = temp.track().mkdirSync();

    var origWd = process.cwd();

    process.chdir(sandbox);
    fs.mkdirSync('.shy');

    process.env['SHY_DIR'] = shyDir;

    var ps = cp.spawn('sh', [ '-e', filename]);

    var fout = writeStream(shyDir, 'stdout');
    var ferr = writeStream(shyDir, 'stderr');

    ps.stdout.pipe(fout);
    ps.stderr.pipe(ferr);

    ps.on('close', function(code) {
        fout.end();
        ferr.end();

        delete process.env['SHY_DIR'];

        if (code == 0) {
            done();
            return;
        }

        var msg = readFile(shyDir, 'result_message');

        if (!msg) {
            var fullErr = readFile(shyDir, 'stderr');

            assert(false, 'unexpected error, stderr:\n\n' + fullErr);
            done();
            return;
        }

        var args = ['actual', 'expected', 'op'].map(function(x) {
            return readFile(shyDir, 'result_' + x);
        });

        assert.fail(
            string_norm(args[0]), 
            string_norm(args[1]), 
            msg, 
            args[2]);

        done();
    });
}

function string_norm(x) {
    return x
        .replace(/\\/g, '\\\\')
        .replace(/\n/g, '\\n');
}

function readFile(dir, file) {
    var filePath = path.join(dir, file);

    if (!fs.existsSync(filePath)) {
        return;
    }
 
    return fs.readFileSync(filePath, 'utf8');
}

function writeStream(dir, name) {
    var dirPath = path.join(dir, name);
    return fs.createWriteStream(dirPath);
}

function findRoot(dir) {
    if (!fs.existsSync(dir)) {
        return;
    }

    var parent = path.parse(dir).dir;

    if (parent == dir) {
        return;
    }

    var pkg = path.join(dir, 'package.json');

    if (fs.existsSync(pkg)) {
        return dir;
    }

    return findRoot(parent);
}