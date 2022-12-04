/*  Graphics ASM Lexer Main File (JS-GASM). Hongtian Yu 2020 */

// Requires ECMAScript 2015 (ES6) +

"use strict";

/**
 * Representing A Single GASM Instruction
 * @class
 * @param {!string} operation name of operation
 * @param {!string[]} params parameters for this operation
 */
function GasmInstruction(operation, params)
{
	/** 
	 * @callback GasmInstructionExecuteWithCallback
	 * @param {GasmInstruction} instruction
	 */
	/** the operation of this instruction */
	this.operation = operation;
	/** the parameters to the operation (optional) */
	this.params = params;
	
	// param {GasmInstructionExecuteWithCallback} consumer 
	/** 
	 * @method 
	 * @param {(instruction: GasmInstruction)} consumer
	 */
	this.executeWith = function(consumer) {
		return consumer(this);
	}
}

/**
 * @class
 * @param {Object} textObject textObject.text is passed by reference for optimization
 * @param {string} textObject.text 
 */
function GasmLexer(textObject)
{
    /** a local (shallow) copy of textObject */
    this.textObject = Object.assign({}, textObject);

    /** 
     * the current character scanned/processed 
     * @private
     * */
    this.currentCharacter = '';

    /* the constants */
    /** delimiter, too, counts as an identifier */
    const delimiter = '\n', comment = ';', argsep = ',';

    /**
     * check is character has white space (except for '\n')
     * @param {string} character 
     * @returns {boolean}
     */
    function isWhitespace(character) {
        return (!character) || (
            character != delimiter 
            && character != argsep
            && /\s/g.test(character)
        ); // regex test
    }

				
    /** 
     * A simple closure for EOF checking
     * @param {?()} eofCallback
     */
    this.checkEOF = function(eofCallback) {
        if(this.textObject.text.length <= 0) {
            if(eofCallback) { // not null?
                eofCallback();
            }
            return true; // stop loop.
        }
        return false;
    }

    /** 
     * For the comment skipper, etc. 
     * @param {string} delimiter
     * @param {?() => string} nextCharacter The next character getter. [Default = nextCharacterRaw]
     * @param {?boolean} doNotEatDelimiter
     */
    this.skipTillDelimiter = function(delimiter, nextCharacter, doEatDelimiter) {
        let inst = this;
        if(!nextCharacter) {
            nextCharacter = function() { return inst.nextCharacterRaw(); };
        }
        while(inst.currentCharacter != delimiter) {
            if(inst.checkEOF()) { break; }
            nextCharacter();
        }
        if(doEatDelimiter) {
            nextCharacter(); // eat the delimiter
        }
    }
	
	/**
	 * scan the next character
	 * @returns {string} the character
	 */
    this.nextCharacter = function() {
        let inst = this;
        inst.nextCharacterRaw();
        if(inst.currentCharacter == comment) { // skipping comment...
            inst.skipTillDelimiter(delimiter);
        }
        return this.currentCharacter;
    }

    /** 
     * [This does not skip the comments] 
     * @returns {void}
     */
	this.nextCharacterRaw = function() {
		let inst = this;
		if(inst.textObject.text.length <= 0) {
			inst.currentCharacter = '{( - ## ! EOF ! ## - )}';
			return;
		}
		inst.currentCharacter = inst.textObject.text[0];
        inst.textObject.text = inst.textObject.text.substr(1);
	}

    /**
     * Try to parse the next identifier
     * @private @method
     * @returns {?string} the identifier (nullable)
     */
    this.parseIdentifier = function() {
        while(isWhitespace(this.currentCharacter) && !this.checkEOF()) {
            this.nextCharacter();
        } 

        if(this.currentCharacter == delimiter) {
            this.nextCharacter();
            return delimiter;
        }

        var identifier = '';
        while(!isWhitespace(this.currentCharacter) && !this.checkEOF()) {
            identifier += this.currentCharacter;
            var c = this.currentCharacter;
            this.nextCharacter();
            if(
                this.currentCharacter == delimiter ||
                this.currentCharacter == argsep ||
                c == delimiter || c == argsep
            ) {
                break;
            }
        }
        if(identifier.length > 0) {
            return identifier;
        }

        return null;
    }

    /** 
     * Try to parse a single instruction
     * @private @method
     * @returns {?GasmInstruction} the instruction parsed (nullable)
     * */
    this.parseInstruction = function() {
        /** @type {string[]} */
        var identifiers = [];
        var identifier = this.parseIdentifier();
        var theTest = function() { 
            return identifier != delimiter && identifier != null 
        };

        while(theTest()) {

            if(identifier == argsep) {
                // eat the comma and get the next identifier...
                identifier = this.parseIdentifier();
                if(!theTest()) {
                    break;
                }
            }

            identifiers.push(identifier);
            identifier = this.parseIdentifier();
        }
        if(identifiers.length > 0) {
            var instruction = new GasmInstruction(identifiers[0], []);
            for(var i = 1; i < identifiers.length; i++) { // skipping the first one (the operation)
                instruction.params.push(identifiers[i]);
            }
            return instruction;
        }
        else if(identifier == null) {
            return GasmLexer.eofInstruction; // special EOF instruction
        }
        return null;
    }

    /**
     * @public @method
     * @returns {!GasmInstruction} instruction parsed (non-null)
     */
    this.nextInstruction = function() {
        var instruction = this.parseInstruction();
        while(instruction == null) {
            instruction = this.parseInstruction();
        }
        return instruction;
    }
}

GasmLexer.eofInstruction = new GasmInstruction("EOF", []);

/**
 * A test for GasmLexer.
 * @param {HTMLElement} eIn 
 * @param {HTMLElement[]} eOuts
 * @param {?*} clearEOut
 */
function gasmLexerTest(eIn, eOuts, clearEOut) {
	if(clearEOut) { 
        eOuts[0].innerHTML = 
        eOuts[1].innerHTML = 
        ""; 
    }

    var tests = [gasmLexerIdentifierTest, gasmLexerInstructionTest];

    for(var i = 0; i < tests.length; i++) {
        let lexer = new GasmLexer({text : (eIn.innerHTML || eIn.value)});
        tests[i](lexer, eOuts[i]);
    }
}

function gasmLexerIdentifierTest(lexer, eOut) {
    var identifier = lexer.parseIdentifier();
    while(identifier != null) {
        eOut.innerHTML += '"' + ((identifier == '\n') ? "\\n" : identifier) + '"';
        identifier = lexer.parseIdentifier();
        if(identifier) {
            eOut.innerHTML += ' | ';
        }
    }
}

/**
 * @param {GasmLexer} lexer 
 * @param {HTMLElement} eOut 
 */
function gasmLexerInstructionTest(lexer, eOut) {
    var instruction = lexer.nextInstruction();
    function printInstruction() {
        eOut.innerHTML += `[${instruction.operation}('`;
        for(var i = 0; i < instruction.params.length; i++) {
            eOut.innerHTML += instruction.params[i];
            if(i < (instruction.params.length - 1)) {
                eOut.innerHTML += "', '";
            }
        }
        eOut.innerHTML += "')]\n";
        instruction = lexer.nextInstruction();
    }
    // console.log(instruction);
    while(instruction.operation != GasmLexer.eofInstruction.operation) {
        printInstruction();
    }
    printInstruction(); // prints EOF
}

/** Here lies the old parseIdentifier 
 *  @deprecated
 *  this. */ 
    var parseIdentifier_Old = function() {
    let inst = this;

    if(this.textObject.text) {
        /** 
         * a local function/closure to skip whitespaces and scan characters 
         * @param {?*} eofCallback (optional)
         */
        function loopCheck(conditionCallback, callback, delimCallback, eofCallback) 
        {	
            // var firstLoop = true;
            
            let checkEOF = function() {
                return inst.checkEOF(eofCallback);
            }

            if(inst.currentCharacter == delimiter) {
                inst.nextCharacter();
                delimCallback(delimiter);
                return;
            }

            /* Here starts the main body */

            while(conditionCallback() && inst.currentCharacter != delimiter) {
                if(checkEOF()) { 
                    eofCallback ? eofCallback() : null;
                    break; 
                }
                callback(inst.currentCharacter);
                inst.nextCharacter();
            }
        
        }

        /** skippin' the white spaces... */
        loopCheck(
            function() {
                return (
                    isWhitespace(inst.currentCharacter) 
                    // || inst.currentCharacter == delimiter
                );
            },
            function(char) {
                return; // do nothing... just skip it
            }
        );

        /** 
         * the identifer!
         */
        var identifier = '';

        /** gettin' the identifier... */
        loopCheck(
            function() {
                return (
                    !isWhitespace(inst.currentCharacter)
                    // && inst.currentCharacter != delimiter 
                );
            },
            function(char) {
                identifier += char;
            }
        );

        if(identifier.length > 0) {
            return identifier;
        }
    }

    return null;
}
/** Here lies the old body of parseIdentifier.loopCheck ... */
/* while(conditionCallback()) {
    if(checkEOF()) { break; }
    if(inst.currentCharacter == ';') { // skip comment
        while(inst.currentCharacter != delimiter) {
            if(checkEOF()) { break; }
            inst.nextCharacter();
        }
        break;
    }
    
    if(inst.currentCharacter == delimiter && !firstLoop) {
        break; // new line reached
    }
    callback(inst.currentCharacter); // shifts 1 char
    inst.nextCharacter();
    if(inst.currentCharacter == delimiter) {
        break; // new line reached
    }
    
    if(firstLoop) {
        firstLoop = false;
    }
}*/

