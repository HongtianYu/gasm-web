/* JS for the Playground */

(function () {

    var codeInput = document.getElementById('code-input'),
        codeEditor = document.getElementById('code-editor');
    /** @type {HTMLCanvasElement} */
    let canvasOut = document.getElementById('canvas-out'),
        lineNumbers = document.getElementById('line-numbers');

    /**
     * @type {GasmEngine}
     */
    var engine = new GasmEngine(canvasOut, {
        text: (codeInput.innerText || codeInput.textContent || '')
    });

    // init canvas...
    (function initializeCanvas() {
        //get DPI
        let dpi = window.devicePixelRatio;
        //get canvas
        /** @type {HTMLCanvasElement} */
        let canvas = canvasOut;

        /** A solution for the blurry stuff. I didn't invent this, but I did modify it.
         * @see https://medium.com/wdstack/fixing-html5-2d-canvas-blur-8ebe27db07da */
        function fix_dpi() {
            //get CSS height
            //the + prefix casts it to an integer
            //the slice method gets rid of "px"
            let style_height = +getComputedStyle(canvas).getPropertyValue("height").slice(0, -2);
            //get CSS width
            let style_width = +getComputedStyle(canvas).getPropertyValue("width").slice(0, -2);
            //scale the canvas
            //canvas.setAttribute('height', style_height * dpi);
            //canvas.setAttribute('width', style_width * dpi);
            canvas.height = style_height * dpi;
            canvas.width = style_width * dpi;

            engine.updateSize();
        }

        fix_dpi();

        window.addEventListener('load', fix_dpi);
        window.addEventListener('resize', () => fix_dpi()); // listen
    })();

    /**
     * Initialising the .code-editor & related elements
     */
    function initializeCodeEditor() {
        /**
         * Set the function which reactes to the input's 
         * content change events
         * @param {MutationCallback} handler 
         * @param {MutationObserverInit} options
         */
        function setInputEventHandler(handler, options) {
            /* codeInput.addEventListener('change', function(ev) {
                console.log(this.innerHTML);
            }); */
            var observer = new MutationObserver(function (mutations, observer) {
                observer.disconnect();
                handler(mutations, observer);
                observer.observe(codeInput, options);
            });
            observer.observe(codeInput, options);

            // this 'prevent formatted clipboard content' idea
            // was got from http://jsfiddle.net/HBEzc/ 
            codeInput.addEventListener("paste", function (e) {
                e.preventDefault();
                console.debug("Performing plaintext pasting...");
                var text = e.clipboardData.getData("text/plain");
                document.execCommand("insertHTML", false, text);
            });
        }

        // [Updated on 2022-12-01]: Patched so it works after 2 years...
        let preset = document.getElementById('preset');
        preset.addEventListener("change", function (ev) {
            let t = null;
            if (t = document.getElementById(preset.value)) {
                // --PATCH.2022.12.01-START--
                // --@remove: 
                //  document.getElementById('code-input').innerHTML = t.innerHTML;
                // --@add:
                codeInput.innerHTML = (t.innerHTML
                    .replace(/^\r?\n/, "")
                    .split('\n')
                    .reduce(function (acc, line) {
                        return acc + "<div>" + (line ? line : "<br/>") + "</div>";
                    }, "")
                );
                // --PATCH.2022.12.01-END--
            }
        });


        setInputEventHandler(
            function (mutations, observer) {
                mutations.forEach(function (mutation, index) {
                    var plainTextCode = (codeInput.innerText || codeInput.textContent);

                    if (codeInput.innerHTML.search(/\s*<div><br\s?\/?>(?:<\/div>)?\s*/) != -1) {
                        // removes the doubled new lines caused by <div><br /></div> by Chromium
                        plainTextCode = plainTextCode.replace(/(\r\n|\r|\n){2}/g, '$1');
                    }

                    var highlightedCode = plainTextCode;
                    if (/\S/.test(plainTextCode)) {
                        highlightedCode = gasmHTMLSyntaxHighlight(plainTextCode, engine.consumers);
                    } else {
                        const lastLinePos = plainTextCode.lastIndexOf("\r\n");
                        highlightedCode = plainTextCode
                            .substring(0, (
                                (lastLinePos >= 0) ? lastLinePos : plainTextCode.lastIndexOf('\n')
                            ));
                    }

                    const lineCount = ((highlightedCode.split(/\r?\n/g) || []).length || 1);

                    const initialLineNumber = (
                        (lineCount != lineNumbers.childElementCount) ?
                            (lineNumbers.childElementCount + 1) :
                            ((lineCount + 1))
                    );

                    if (lineCount >= lineNumbers.childElementCount) {
                        for (var i = initialLineNumber; i <= lineCount; i++) {
                            let lineNumber = document.createElement('span');
                            lineNumber.innerText = i.toString(10); // base-10
                            lineNumbers.appendChild(lineNumber); // adds it to the line numbers
                            // DEBUG: console.log('+');
                        }
                    } else {
                        for (var i = initialLineNumber; i > lineCount; i--) {
                            if (lineNumbers.childElementCount > 1) {
                                lineNumbers.removeChild(lineNumbers.lastElementChild);
                            }
                        }
                    }

                    codeEditor.innerHTML = highlightedCode;
                });
            }, {
            subtree: true,
            childList: true,
            characterData: true,
            characterDataOldValue: true
        }
        );
    }

    initializeCodeEditor();

    var runButton = document.getElementById('run');
    var context = canvasOut.getContext("2d");

    function clearCanvas() {
        // Store the current transformation matrix
        context.save();

        // Use the identity matrix while clearing the canvas
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvasOut.width, canvasOut.height);
        context.beginPath();

        // Restore the transform
        context.restore();
    };

    (function registerRunBurronCallbacks() {
        clearCanvas();
        runButton.addEventListener('click', function (ev) {
            setTimeout(() => (async function () { // in async
                clearCanvas();
                let newSource = { text: (codeInput.innerText || codeInput.textContent || '') + '\n' };
                // let engine = new GasmEngine(canvasOut, { text: codeInput.innerText });
                engine.resetLexer(newSource);
                console.debug(newSource);
                let iCount = 0;
                while (engine.interpretInstruction() != true) {
                    iCount++;
                }
                console.info("[JS-GASM]: Excecuted " + iCount + " GASM instructions.");
            })(), 0);
        });
    })();

    (function registerSaveOutputButtonCallback() {
        document.getElementById('save-output').addEventListener('click', function (ev) {
            let encodedData = canvasOut.toDataURL();
            console.info(encodedData);
            let dummyAnchor = document.createElement('a');
            dummyAnchor.href = encodedData;
            dummyAnchor.download = "canvas.png";
            dummyAnchor.click();
        })
    })();

})();

