var assert = require('assert');
var _ = require('underscore');
var fs = require('fs');
var path = require('path');
var Module = require('module');


// Load wrappers
var wrappers = {};
fs.readdirSync(path.join(__dirname, 'wrappers')).forEach(function(name) {
    var match = name.match(/^(.+)\.(prefix|suffix)\.js$/);
    if (match) {
        wrappers[match[1]] = wrappers[match[1]] || {};
        wrappers[match[1]][match[2]] =
            fs.readFileSync(path.join(__dirname, 'wrappers', name), 'utf8');
    }
});

// Try catch suffix.
var suffix = "\n} catch(err) {" +
             "\n    var fixLines = new RegExp('(' + __filename + '):(\\\\d+)', 'g');" +
             "\n    err.stack = err.stack.replace(fixLines," +
             "\n    function(match, file, number) {" +
             "\n        return file + ':' + (parseInt(number, 10) - __LENGTH__);" +
             "\n    });" +
             "\n    throw err;" +
             "\n}";

// Wrap wrappers in try/catch
for (var name in wrappers) {
    wrappers[name].prefix = (wrappers[name].prefix || '') + ';try {\n';
    var lines = wrappers[name].prefix.split('\n').length - 1;
    wrappers[name].suffix = suffix.replace('__LENGTH__', lines) +
                            (wrappers[name].suffix || '');
}



function load(type, filename) {
    var name = path.basename(filename, '.js');
    filename = require.resolve(filename);

    if (Module._cache[filename]) {
        return Module._cache[filename].exports;
    }

    var plugin = Module._cache[filename] = new Module(filename, module.parent);

    try {
        assert.ok(!plugin.loaded);
        plugin.filename = filename;

        plugin.paths = Module._nodeModulePaths(path.dirname(filename));
        // Find the first intersection
        for (var i = 0; i < plugin.paths.length; i++) {
            if (module.parent.paths.indexOf(plugin.paths[i]) >= 0) {
                // Found intersection
                plugin.paths = _.first(plugin.paths, i).concat(module.parent.paths);
                break;
            }
        }

        plugin.plexus = {
            type: type,
            name: name
        };

        var content = fs.readFileSync(filename, 'utf8');
        if (wrappers[type]) {
            content = wrappers[type].prefix + content + wrappers[type].suffix;
        }

        plugin._compile(content, filename);
        plugin.loaded = true;
    } catch (err) {
        delete Module._cache[filename];
        throw err;
    }

    return plugin.exports;
}

module.exports = function(type, dir) {
    global.plexus[type] = global.plexus[type] || {};

    try {
        var files = fs.readdirSync(dir);
    } catch(err) {
        if (err.code !== 'ENOENT') throw err;
        else return;
    }

    files.forEach(function(name) {
        var file = path.join(dir, name);
        try {
            var stat = fs.statSync(file);
            if (stat.isDirectory() || (/\.js$/).test(name)) {
                load(type, file);
            }
        } catch(err) {
            console.warn("Couldn't load %s %s", type, file);
            throw err;
        }
    });
};