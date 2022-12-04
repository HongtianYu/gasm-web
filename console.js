(function () {
    "use strict";

    /** @type {HTMLInputElement} */
    let stdinElement = document.getElementById('stdin');
    /** @type {HTMLDivElement} */
    let stdinHighlightedElement = document.getElementById('stdin-highlighted');
    /** @type {HTMLDivElement} */
    let stdoutElement = document.getElementById('stdout');
    /** @type {HTMLCanvasElement} */
    let outputCanvas = document.getElementById('canvas-out');

    /**
     * GasmEngine print callback related typedefs...
     * @typedef {'debug'|'log'|'info'|'warn'|'error'} PrintLevel
     * @typedef {(type : PrintLevel, content : any) => any} PrintCallback
     */


    /** 
     * @type {HTMLDivElement} 
     * @private
     */
    var lastElementPrinted = null;
    /**
     * Function to print a line to GASM stdout / console.
     * Could also be used as PrintCallback in the GASM Engine.
     * @param {PrintLevel} level The level. Affects the default styles, prefixes and looks.
     * @param {String} content
     * @param {?String} color the color of the line, in CSS notation
     * @param {?Boolean} rawHTML is the content in raw HTML code?
     * @param {?'r'|'l'|''} type The type / mode used for writing to the console
     *  - "r" => removes / overrides the previous line;  
     *  - "l" => prints on the same line;  
     *  - ""  => default (new line). falsey values or unspecified arg works too.
     */
    function print(level, content, color, rawHTML, type) {
        level = (level || 'log');
        let prefix = '';
        let cssColor = 'inherit';
        switch (level) {
            case 'debug':
                cssColor = 'lightgray';
                break;
            case 'log':
                cssColor = 'lightgray';
                break;
            case 'info':
                cssColor = 'white';
                prefix = '[INFO]: ';
                break;
            case 'warn':
                cssColor = 'yellow';
                prefix = '[WARN]: ';
                break;
            case 'error':
                cssColor = 'red';
                prefix = '[ERROR]: ';
                break;
            default:
                return -1; // error.
        }

        switch (type) {
            case 'l':
                if (lastElementPrinted)
                    if (rawHTML) lastElementPrinted.innerHTML += content;
                    else lastElementPrinted.innerText += content;
                break;
            case 'r':
                if (lastElementPrinted)
                    stdoutElement.removeChild(lastElementPrinted);
            // continues to default...
            default: {
                let line = document.createElement('div');
                // use cssColor if color isn't set
                line.style.color = (color || cssColor);
                // don't use the prefix if the string is empty
                let textContent = ((content.length > 0) ? prefix + content : '');
                if (rawHTML) line.innerHTML = textContent;
                else line.textContent = textContent;

                lastElementPrinted = stdoutElement.appendChild(line);
            }
        }

        // success; returns the length of the string printed
        return content.length;
    }

    /**
     * Prints an empty new line...
     */
    function printNewLine() {
        return print(null, ' ');
    }

    /** @type {GasmEngine} */
    let engine = null;

    (async function initialiseConsole() {
        print('debug', "Loading console...");
        printNewLine(); // to be overridden with the progress bar

        /** debug sleep to emulate low-end slow devices */
        function debugSleep(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }

        /** 
         * a closure for progress bar drawing... 
         * @param {number} n
         */
        function progress(n) {
            print('debug', "[", null, false, 'r');
            for (let i = 0; i < 10; i++) {
                if (i < n)
                    print('debug', '&#x2588;', null, true, 'l');
                else
                    print('debug', "<!--&centerdot;-->=", null, true, 'l');
            }
            print('debug', "]", null, false, 'l');
        }

        engine = new GasmEngine(outputCanvas, { text: '' }, print);

        progress(3); // 30%

        (function addListeners() {

            /** @type {() => void} */
            let updateHighlight = null;
            /** The records/history of the user's input */
            let inputRecords = [];
            /** -1 (current) --> records' length (oldest) */
            let inputRecordPosition = -1;

            stdinElement.addEventListener('keyup', function (ev) {
                if (ev.key == 'Enter') {
                    let input = stdinElement.value;
                    if (input.length <= 0) return; // empty
                    // print('debug', input);

                    engine.resetLexer({ text: (input + '\n') });

                    inputRecords.unshift(input); // push to front
                    stdinElement.value = ''; // clear input
                    let oldHighlight = stdinHighlightedElement.innerHTML;
                    updateHighlight();
                    inputRecordPosition = -1; // reset position...

                    (async function() { // creates another thread to be more flexible...
                        "use strict";
                        let oldHighlightHTML = oldHighlight;
                        let result = null;
                        let feedback = () => print(
                            "log", 
                            `<span class="er"><span class="highlight">&nbsp;&gt;&nbsp;</span>&nbsp;<i>${oldHighlightHTML}</i>&nbsp;&nbsp;</span>`, 
                            null, 
                            true
                        );

                        while (
                            (result = engine.interpretInstruction()), 
                            !(typeof(result) === 'boolean' && result /* is EOF */)
                        ) { // executes till EOF
                            if(result !== 'error') {
                                feedback();
                                if(result instanceof GasmInstruction) {
                                    let evalResult = 'undefined';
                                    if(result.operation.toLowerCase() == 'call') {
                                        evalResult = engine.registers.$ret;
                                    } 
                                    else if (result.operation.toLowerCase() == 'set') {
                                        evalResult = engine.variables[result.params[0]];
                                    }
                                    print(
                                        "log", 
                                        `<span class="er"><span class="highlight">&nbsp;=&nbsp;</span>&nbsp;<i>${evalResult}</i>&nbsp;&nbsp;</span>`, 
                                        null, 
                                        true
                                    );

                                    printNewLine();
                                }
                            }
                        }
                    })();
                }
            }), progress(4);

            stdinElement.addEventListener('input', updateHighlight = function (ev) {
                stdinHighlightedElement.innerHTML = gasmHTMLSyntaxHighlight(
                    stdinElement.value,
                    engine.consumers
                );
            }), progress(5);


            stdinElement.addEventListener('keydown', function (ev) {
                function updateInputRecord() {
                    if (inputRecordPosition >= inputRecords.length)
                        inputRecordPosition = inputRecords.length - 1;

                    if (inputRecordPosition <= -1) {
                        inputRecordPosition = -1;
                        stdinElement.value = '';
                    }
                    else
                        stdinElement.value = inputRecords[inputRecordPosition];
                }
                if (ev.key == 'ArrowDown') {
                    inputRecordPosition--;
                } else if (ev.key == 'ArrowUp') {
                    inputRecordPosition++;
                } else {
                    return;
                }

                updateInputRecord();
                updateHighlight();
            }), progress(6);

        })();

        stdinElement.addEventListener('focus', function (ev) {
            // the .input-line div
            this.parentElement.parentElement.classList.add('active');
        }), progress(7);

        stdinElement.addEventListener('blur', function (ev) {
            this.parentElement.parentElement.classList.remove('active');
        }, progress(8));

        (function initializeCanvas() {
            //get DPI
            let dpi = window.devicePixelRatio;
            //get canvas
            /** @type {HTMLCanvasElement} */
            let canvas = outputCanvas;
    
            /** 
             * A solution for the blurry stuff. 
             * I didn't come up with this, but I did modify it.
             * @see https://medium.com/wdstack/fixing-html5-2d-canvas-blur-8ebe27db07da 
             */
            function fix_dpi() {
                //get CSS height
                //the + prefix casts it to an integer
                //the slice method gets rid of "px"
                let style_height = +getComputedStyle(canvas).getPropertyValue("height").slice(0, -2);
                //get CSS width
                let style_width = +getComputedStyle(canvas).getPropertyValue("width").slice(0, -2);
                //scale the canvas
                canvas.height = style_height * dpi;
                canvas.width = style_width * dpi;

                engine.updateSize();
            }
            
            fix_dpi();

            window.addEventListener('resize', fix_dpi);
        })(), progress(9);

        progress(10);

        printNewLine();
        print('info', "The GASM Console is now successfully initialised and ready.");
        printNewLine();
    })();

})();