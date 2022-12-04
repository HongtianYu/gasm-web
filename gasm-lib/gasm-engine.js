/* Graphics ASM Engine Original Main File [Unminimized]. Hongtian Yu 2020 */

// Requires HTML 5+ and ECMAScript 2015 (ES6) +

"use strict";

// Documented in JSDoc format. Some TypeScript types/syntaxes may be used.

/* Implementation: JS-GASM with HTML5 Canvas */

/** 
 * Engine object main class
 * @class
 * @typedef {'debug'|'log'|'info'|'warn'|'error'} PrintLevel
 * @typedef {(type : PrintLevel, content : any) => any} PrintCallback
 * @param {!HTMLCanvasElement} canvas
 * @param {Object} source
 * @param {!String} source.text
 * @param {?PrintCallback} printCallback
 */
function GasmEngine(canvas, source, printCallback) {
	this.canvas = canvas;
	this.source = source;

	/**
	 * the lexer used (private)
	 * @private
	 */
	this.lexer = new GasmLexer(source);

	/**
	 * @typedef {{
		  argc : number,
		  argVerifier : (argn : number) => boolean,
			  consume : (argv : string[], engine : GasmEngine)
	   }} Consumer
	 */

	/**
	 * @type {Object.<string, Consumer>}
	 */
	this.consumers = Object.create(null);

	/**
	 * @type {PrintCallback}
	 */
	this.defaultCallback = function (type, content) {
		let f = console.log;
		switch (type) {
			case 'info':
				f = console.info;
				break;
			case 'warn':
				f = console.warn;
				break;
			case 'error':
				f = console.error;
				break;
			case 'debug':
				f = console.debug;
		}

		return f(content);
	}

	this.print = (printCallback || this.defaultCallback);

	this.originalSource = source.text;

	/** 
	 * the stack (unused - ran out of time to implement)
	 * @type {Object<string, number>[]}
	 */
	this.stack = [];

	/** 
	 * The default registers.
	 */
	this.registers = {
		'$ret': 0,

		'$add': 0,
		'$sub': 0,
		'$mul': 0,
		'$div': 0,

		'$cmp': 0b0000,

		'$argc': 0,

		'$var': '',
		'$func': null,

		// canvas dimensions
		'$w': canvas.width || 0,
		'$h': canvas.height || 0,

		// mathematical constants
		'$pi': Math.PI,
		'$deg2rad': Math.PI / 180,
		'$rad2deg': 180 / Math.PI
	};

	/** constant bits/flags for the "$cmp" register */
	const cmpFlags = new (function () {
		/** cmp_flag_equal */
		this.e = 0b1000;
		/** cmp_flag_not_equal */
		this.ne = 0b0100;
		/** cmp_flag_greater */
		this.g = 0b0010;
		/** cmp_flag_lesser */
		this.l = 0b0001;

		// compound flags
		/** cmp_flag_greater_or_equal */
		this.ge = this.g | this.e;
		/** cmp_flag_lesser_or_equal */
		this.le = this.l | this.e;
	})();

	/** @public */
	this.cmpFlags = cmpFlags;

	/** @type {Object.<string, number>} */
	this.variables = {
		'$.var': 0
	};

	/*(function (engine) {
		window.addEventListener('resize', this.updateSize = () => (
			engine.registers.$w = engine.canvas.width,
			engine.registers.$h = engine.canvas.height
		));
	})(this);*/

	this.updateSize = function () {
		this.registers.$w = this.canvas.width;
		this.registers.$h = this.canvas.height;
	}

	/** 
	 * AST-Like representation of a GASM function. 
	 * @param {string} name
	 * @param {number} argcMin
	 * @param {number} argcMax
	 * @param {string[]} argNames
	 * @param {?(engine : GasmEngine, args: number[]) => number} nativeImplementation
	 */
	function GasmFunction(name, argcMin, argcMax, argNames, nativeImplementation = null) {
		this.name = name;
		this.argcMin = argcMin;
		this.argcMax = argcMax;
		this.argNames = argNames;
		/**
		 * Body expressions.
		 * @type {GasmInstruction[]}
		 */
		this.body = [];
		/** 
		 * Native implementation (if available)
		 */
		this.nativeImplementation = nativeImplementation;
	}

	this.functions = {
		// test func
		'.func': new GasmFunction('.func', 0, Infinity, [], function (engine, args) {
			engine.print('info', ".func is called with " + args.length + " arguments!");
			return 0;
		}),

		// print multiple numbers
		'nprint': new GasmFunction('nprint', 0, Infinity, ["..."], function (engine, args) {
			let msg = '';
			for (let i = 0; i < args.length; i++) {
				msg += args[i] + ' ';
			}
			engine.print('log', msg);
			return args.length;
		}),

		log: new GasmFunction('log', 1, 1, ['n'], (engine, args) => Math.log10(engine.toNumber(args[0]))),

		// native trig functions (in radians)
		sin: new GasmFunction('sin', 1, 1, ['x'], (engine, args) => Math.sin(engine.toNumber(args[0]))),
		cos: new GasmFunction('cos', 1, 1, ['x'], (engine, args) => Math.cos(engine.toNumber(args[0]))),
		tan: new GasmFunction('tan', 1, 1, ['x'], (engine, args) => Math.sin(engine.toNumber(args[0]))),

		// random number generation functions
		rand: new GasmFunction('rand', 0, 0, [], (_) => Math.random()),
		sqrt: new GasmFunction('sqrt', 1, 1, ['n'], (engine, args) => Math.sqrt(engine.toNumber(args[0])))
	}

	/**
	 * Resets / updates the lexer to the newer source
	 * @param {{ text: String; }} newSource
	 */
	this.resetLexer = function (newSource) {
		console.debug({
			old: this.source,
			orig: this.originalSource,
			new: newSource.text,
			name: 'resetLexer.$debug_output'
		});
		delete this.lexer;
		this.lexer = new GasmLexer(newSource);
	};

	/**
	 * Executes the next/given instruction...
	 * @param {?GasmInstruction} givenInstruction (optional)
	 * @returns {GasmInstruction | "error" | boolean} is it the EOF Instruction
	 */
	this.interpretInstruction = function (givenInstruction = null) {
		let inst = this;
		let error = false;
		var instruction = (givenInstruction || this.lexer.nextInstruction());

		if (instruction.operation == GasmLexer.eofInstruction.operation) {
			return true; // is EOF!
		}

		instruction.executeWith((execInstruction) => error = inst.instructionConsumer(execInstruction));

		return (error ? 'error' : instruction);
	}

	/**
	 * My GASM parser & interpreter!
	 * @param {GasmInstruction} instruction
	 * @returns {boolean} error?
	 */
	this.instructionConsumer = function (instruction) {
		/** @type {Consumer} */
		var consumer;
		let inst = this;
		let error = false;
		if (consumer = this.consumers[
			instruction.operation.toLowerCase()
		]) {
			var argCountAllowed = false;
			if (consumer.argVerifier) {
				argCountAllowed = consumer.argVerifier(
					instruction.params.length
				);
			} else {
				argCountAllowed = expectArgNum(
					instruction,
					consumer.argc
				);
			}

			if (argCountAllowed) {
				try {
					consumer.consume(instruction.params, inst);
				} catch (e) {
					if (e instanceof FailedAssertionError) {
						console.debug('FailedAssertionError:', e.message);
						error = true;
					}
					else {
						throw e; // rethrowing... not my error
					}
				}
			} else {
				inst.print(
					'warn',
					"Invalid number of arguments (" + instruction.params.length.toString() + ") passed to '" +
					instruction.operation + "'."
				);
				error = true;
			}
		} else {
			inst.print(
				'warn',
				`Invalid Instruction "${instruction.operation}"`
			);
			error = true;
		}

		return error;
	}

	var context = canvas.getContext("2d");

	/**
	 * @deprecated
	 * @param {number} numberOfArgumentsExpected 
	 */
	function InvalidArgumentNumberError(numberOfArgumentsExpected, actualNumberGot) {
		this.expectedNumber = numberOfArgumentsExpected;
		this.actualNumber = actualNumberGot;
	}

	/**
	 * The error thrown on assert(false)
	 * @param {String} message 
	 */
	function FailedAssertionError(message) {
		this.name = 'FailedAssertionError';
		this.message = message;
	}

	/**
	 * Argument Number Assertion
	 * @param {GasmInstruction} instruction 
	 * @param {number} argCount 
	 * @returns {boolean} passed assertion?
	 */
	function expectArgNum(instruction, argCount) {
		if (instruction.params.length == argCount) {
			/* throw new InvalidArgumentNumberError(
				argCount,
				instruction.params.length
			); */
			return true;
		}
		// return instruction.params;
		return false;
	}

	/**
	 * Consumer / parser assertion helper
	 * @param {*} expression 
	 * @param {!String} error 
	 * @param {?PrintLevel} level [default = 'error']
	 */
	this.assert = function (expression, error, level) {
		if (!expression) {
			this.print((level || 'error'), error);
			throw new FailedAssertionError(error);
		}
	}

	/**
	 * Asserted GASM numerals converter
	 * @param {String | any} expression 
	 * @param {?String} error 
	 * @param {?number[]} range (inclusive)
	 * @param {?PrintLevel} level (optional)
	 * @param {?boolean} useAssert
	 * @returns {!number} Otherwise the assertion had failed
	 */
	this.toNumber = function (expression, error, range, level, useAssert) {
		// An interesting hack found from
		// https://stackoverflow.com/questions/33544827/convert-string-to-either-integer-or-float-in-javascript
		// It's much better and cleaner than Number.parse*(...) which I originally intended to use.
		let n = expression * 1;
		let isNumber = (n) => typeof (n) === "number";
		range = range || [];
		// range = [min, max]
		range = [(isNumber(range[0]) ? range[0] : -Infinity), (isNumber(range[1]) ? range[1] : Infinity)];
		useAssert = (
			useAssert === undefined ||
			useAssert === null ||
			typeof (useAssert) === "undefined") ?
			true : useAssert;
		let isInRange = (n) => (range[0]) <= n && n <= (range[1]);
		var isValid = (n) => typeof (n) === "number" && !isNaN(n) && isInRange(n);

		if (!isValid(n)) {
			if (expression && expression[0] == '$') {
				let found = null;
				if (isValid(found = this.registers[expression])) {
					n = found;
				} else if (this.haveVar(expression) && isValid(found = this.variables[expression])) {
					n = found;
				} else {
					n = NaN;
				}
			} else {
				n = NaN;
			}
		}

		if (useAssert) {
			this.assert(
				isInRange(n),
				(error || `Numeric value within ${range[0]} to ${range[1]} expected`)
			);
			this.assert(isValid(n), (error || "Numeric value expected"), level);
		}

		return n;
	}

	/** 
	 * GASM coomon coordinate converter 
	 * @param {GasmEngine} engine instance of the engine
	 * @returns {number[]} [x, y]
	 */
	this.toCoordinate = function (engine, argv_x, argv_y) {
		let x = engine.toNumber(argv_x);
		let y = engine.toNumber(argv_y);
		if (x < 0 || argv_x[0] == '-') x = this.registers.$w + x;
		if (y < 0 || argv_y[0] == '-') y = this.registers.$h + y;
		return [x, y];
	}

	/**
	 * Test if the given string is an identifier
	 * @param {string} str 
	 */
	this.isIdentifier = function (str) {
		return (
			isNaN(this.toNumber(str, '', [-Infinity, Infinity], 'log', false)) &&
			str[0] != '$' &&
			str[0] != '.'
		);
	}

	/** Test if the variable exists  */
	this.haveVar = (varName) =>
		!!this.variables[varName]
		|| typeof (this.variables[varName]) === "number";

	this.consumers["path"] = {
		argc: 1,
		consume: function (argv) {
			switch (argv[0].toLowerCase()) {
				case "begin":
					context.beginPath();
					break;
				case "end": // or...
				case "close":
					context.closePath();
					break;
			}
		}
	};

	this.consumers["fill"] = {
		argc: 0,
		consume: function (argv) {
			context.fill();
		}
	};

	this.consumers["movp"] = {
		argc: 2,
		consume: function (argv, engine) {
			let x, y;
			[x, y] = engine.toCoordinate(engine, argv[0], argv[1]);
			if (x == NaN || y == NaN) return;
			context.moveTo(x, y);
		}
	};

	this.consumers["line"] = {
		argc: 2,
		consume: function (argv, engine) {
			let x = 0, y = 0;
			[x, y] = engine.toCoordinate(engine, argv[0], argv[1]);
			if (x == NaN || y == NaN) return;

			context.lineTo(x, y);
			context.stroke();
		}
	};

	this.consumers["lwid"] = {
		argc: 1,
		consume: function (argv) {
			context.lineWidth = argv[0];
		}
	};

	this.consumers["rgba"] = {
		argVerifier: function (argc) {
			return argc >= 2 && argc <= 5;
		},
		consume: function (argv, engine) {
			let n = (expr, range) => Math.round(engine.toNumber(expr, null, range));
			const byteRange = [0x00, 0xFF]; // 0 - 255
			if (argv[0] == "line" || argv[0] == "fill") {
				engine.assert(
					argv.length == 5 || argv.length == 2,
					`"rgba" only receive 1 or 4 color arguments, but got ${argv.length - 1}!`
				);

				let color = argv[4] ?
					`rgba(${n(argv[1], byteRange)
					}, ${n(argv[2], byteRange)
					}, ${n(argv[3], byteRange)
					}, ${engine.toNumber(argv[4], null, [0, 1])
					})` :
					argv[1];

				if (argv[0] == 'line')
					context.strokeStyle = (
						color
					);
				else if (argv[0] == 'fill')
					context.fillStyle = color;

				// [DEBUG] console.debug(context.strokeStyle);
			} else {
				engine.assert(false, "setting color for '" + argv[0] + "' not supported");
			}
		}
	};

	this.consumers["set"] = {
		argc: 2,
		consume: function (argv, engine) {
			let name = argv[0];
			engine.assert(name[0] === '$', "Variable's name must start with '$'");
			engine.assert(name[1] === '.', "Variable's name must contain at least one namespace");
			let value = engine.toNumber(argv[1], "The value of a variable must be a number");
			engine.variables[name] = value;
		}
	};

	this.consumers["del"] = {
		argc: 1,
		consume: function (argv, engine) {
			let name = argv[0];
			engine.assert(
				engine.haveVar(name),
				`Variable "${name}" not found`
			);
			delete engine.variables[name]; // removes the variable
		}
	}

	this.consumers["print"] = {
		argVerifier: (argc) => argc >= 0,
		consume: function (argv, engine) {
			/** the separator for each argument */
			const sep = ' ';
			let line = '';
			for (let i = 0; i < argv.length; i++) {
				let arg = engine.toNumber(argv[i], null, null, null, false);
				if (isNaN(arg)) {
					arg = argv[i];
				}
				line += arg + sep;
			}
			engine.print('log', line);
			return argv.length;
		}
	};

	this.consumers["func"] = {
		argVerifier: argc => argc >= 1,
		consume: function (argv, engine) {
			let name = argv[0];
			// function name could not be 'end' as it's reserved
			engine.assert(name.toLowerCase() != 'end');
			let proto = new GasmFunction(name, 0, 0);
			for (let i = 1; (!!argv[i] && typeof (argv[i]) != 'number'); i++) {
				let argName = argv[i];
				engine.assert(
					argName && argName.length > 0 && engine.isIdentifier(argName),
					"Expected an identifier as argument name, but got \"" + argcName + '"'
				);
				proto.argNames += argName;
			}
			let instruction = null;
			while (
				instruction = engine.lexer.nextInstruction(),
				instruction.operation != GasmLexer.eofInstruction.operation
			) {
				if (instruction.operation.toLowerCase() == "func") {
					engine.assert(
						instruction.params[0].toLowerCase() == "end",
						"Nested functions not supported"
					);
					break; // end of func; stop...
				}

				proto.body.push(instruction);
			}

			engine.functions[proto.name] = proto;
		}
	};

	this.consumers["call"] = {
		argVerifier: argc => argc >= 1,
		consume: function (argv, engine) {
			/** @type {?GasmFunction} */
			let referencedFunc = engine.functions[argv[0]]
			let argc = argv.length - 1;
			engine.assert(
				referencedFunc,
				`Function ${argv[0]} not found`
			);
			engine.assert(
				referencedFunc.argcMin <= argc && argc <= referencedFunc.argcMax,
				`Mismatched argument count (${argc}) for function ${referencedFunc.name}`
			);

			let args = [];
			for (let i = 1; i < argv.length; i++) {
				args.push(engine.toNumber(argv[i]));
			}

			if (referencedFunc.nativeImplementation) {
				let retval = referencedFunc.nativeImplementation(engine, args);
				engine.registers.$ret = retval;
			}
			else {
				for (let i = 0; i < referencedFunc.body.length; i++) {
					let instruction = referencedFunc.body[i];
					engine.interpretInstruction(instruction);
					if (instruction.operation.toLowerCase() == 'ret') {
						break;
					}
				}
			}
		}
	};

	this.consumers["ret"] = {
		argc: 1,
		consume: function (argv, engine) {
			let value = engine.toNumber(argv[0]);
			//set the register for return
			engine.registers.$ret = value;
		}
	};

	/**
	 * A helper function for declaring common GASM operations
	 * @param {GasmEngine} engine the GasmEngine instance to add the operations to
	 * @param {String} name the name of the operation (e.g. add, div)
	 * @param {(a : number, b : number) => number} f a blackbox to provide the operation
	 */
	function declareOperation(engine, name, f) {
		engine.consumers[name] = {
			argc: 2,
			consume: (argv, engine) =>
				engine.registers['$' + name] = f(engine.toNumber(argv[0]), engine.toNumber(argv[1]))
		};

		// e.g. adds, subs which stores the result in the variable 
		// given as the first argument; applies to itself
		// instead of the register, hence 'self op'.
		let selfOpName = name + 's';
		engine.consumers[selfOpName] = {
			argc: 2,
			consume: function (argv, engine) {
				let varName = argv[0];
				engine.assert(
					engine.haveVar(varName),
					`The "${selfOpName}" operation must have a variable as its first argument`
				)
				engine.variables[varName] = f(engine.variables[varName], engine.toNumber(argv[1]));
			}
		};
	}

	// common arithmetic operations supported by this implementation (JS-GASM).
	declareOperation(this, 'add', (a, b) => a + b);
	declareOperation(this, 'sub', (a, b) => a - b);
	declareOperation(this, 'mul', (a, b) => a * b);
	declareOperation(this, 'div', (a, b) => a / b);
	declareOperation(this, 'mod', (a, b) => a % b); // the good ol' modulo
	declareOperation(this, 'pow', (a, b) => Math.pow(a, b)); // a to the power of b

	// common bitwise operations
	declareOperation(this, 'and', (a, b) => a & b);
	declareOperation(this, 'or', (a, b) => a | b);
	declareOperation(this, 'xor', (a, b) => a ^ b);

	/** 
	 * A helper function for declaring GASM's conditional calls & sets, etc.
	 * @param {GasmEngine} engine
	 * @param {String} name e.g. eq, ne, g, l
	 * @param {(r) => boolean} f checks if condition is true
	 */
	function declareCond(engine, name, f) {
		engine.consumers['c' + name] = {
			argVerifier: engine.consumers["call"].argVerifier,
			consume: function (argv, engine) {
				if (f(engine.registers.$cmp)) {
					engine.consumers["call"].consume(argv, engine);
				}
			}
		};
		engine.consumers['s' + name] = {
			argc: engine.consumers["set"].argc,
			consume: function (argv, engine) {
				if (f(engine.registers.$cmp)) {
					engine.consumers["set"].consume(argv, engine);
				}
			}
		};
	}

	declareCond(this, 'e', r => r & cmpFlags.e);
	declareCond(this, 'ne', r => r & cmpFlags.ne);

	declareCond(this, 'g', r => r & cmpFlags.g);
	declareCond(this, 'ge', r => r & cmpFlags.ge);

	declareCond(this, 'l', r => r & cmpFlags.l);
	declareCond(this, 'le', r => r & cmpFlags.le);

	this.consumers["cmp"] = {
		argc: 2,
		consume: function (argv, engine) {
			let a = engine.toNumber(argv[0]), b = engine.toNumber(argv[1]);
			let flag = 0;
			if (a > b) flag |= cmpFlags.g;
			else if (a < b) flag |= cmpFlags.l;
			if (a == b) flag |= cmpFlags.e;
			else if (a != b) flag |= cmpFlags.ne;
			// it is not need to set the compound flags... 
			// they're already set using the 'or' operation.
			engine.registers.$cmp = flag;
		}
	};

	// Debug dump: dumping all registers
	this.consumers["dump"] = this.consumers["dmp"] = {
		argc: 0,
		consume: function (_, engine) {
			for (let key of Object.keys(engine.registers)) {
				let r = engine.registers[key];
				if (typeof (r) === "number") {
					let line = '' + r;
					if (key == '$cmp') {
						const digit = 4;
						line = r.toString(2); // binary
						let origLen = line.length;
						for (let j = digit; j > origLen; j--) {
							line = '0' + line; // pad with zeros
						}
					}
					engine.print("log", `[${key}]:\t${line}`);
				}
			}
			engine.print("log", ' '); // new line
		}
	}
}
