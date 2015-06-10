shy
===

shy is a simple [mocha](https://www.npmjs.com/package/mocha) extension that enables to write functional tests for your node based command line application.

Let's create the simplest cli app possible: `echojs`

First install the required dependencies

```
npm install mocha shy --save-dev
```
Create the executable js file (`./bin/echojs.js`)

```
#!/usr/bin/env node
process.stdout.write(process.argv.slice(2).join(' ') + '\n');
``` 
Configure `package.json` properly

```
...
"bin": {
	"echojs": "./bin/echojs.js"
},
"scripts": {
    "test": "./node_modules/.bin/_mocha --compilers shy:shy 
}
...
```

Write a simple functional test (`./test/multi_input.shy`)

```
shy track 'echojs hello world'

shy assert {stdout} = "hello world\n"
```

Run the tests

```
npm test
```

