/**
 * Process plain text GASM code into highlighted HTML.
 * @requires ECMAScript2015
 * @param {String} plainTextCode 
 * @param {!Object.<String, Consumer>} engineConsumers
 * @returns {String} Highlighted HTML code
 */
function gasmHTMLSyntaxHighlight(plainTextCode, engineConsumers) {
    "use strict";

    if (!plainTextCode || plainTextCode.length <= 0) {
        return plainTextCode;
    }

    let instructions = (Object.keys(engineConsumers) || []);
    let operators = '+-*/,;[]()<>{}|^&%$@#!~`=\\.?:';
    /** Matches GASM comments. The 'm' flag is very important 
     * in order to match each line, instead of the whole string */
    let commentRegex = /(;.*)($)/gm;

    var highlightedCode = (plainTextCode || "");

    for (var i = 0; i < instructions.length; i++) {
        const instruction = instructions[i];
        highlightedCode = highlightedCode.replace(
            new RegExp(
                // only matches the first occurrence in a line
                `(^|\\s+)(${instruction})(\\s+|$)`, 'gi' // replace all matches, ignore cases
            ),
            '$1<span class="gasm-instruction">$2</span>$3'
        );
    }
    // replace decimals
    highlightedCode = highlightedCode.replace(
        /(^|\s+|[^A-z0-9_<>;-]+)(-?[0-9]*\.[0-9]+)([A-z_0-9]*)/g,
        '$1<span class="gasm-decimal">$2$3</span>'
    );
    // replace integers
    highlightedCode = highlightedCode.replace(
        /(^|\s|[^A-z0-9_<>.;-]+)(-?[0-9]+)([A-z_0-9]*)/g,
        '$1<span class="gasm-integer">$2$3</span>'
    );
    // replace registers
    highlightedCode = highlightedCode.replace(
        /(^|\s)(\$[A-z_]+[A-z0-9_]*)/g,
        '$1<span class="gasm-register">$2</span>'
    );
    // replace variables
    highlightedCode = highlightedCode.replace(
        /(^|\s)(\$\.[A-z_\.]+[A-z0-9_\.]*)/g,
        '$1<span class="gasm-variable">$2</span>'
    );

    /* Some constant references to values used to process the lines */
    const lineSepRegex = /\r|\n|\r\n/;
    const lineSepMatchResult = highlightedCode.match(lineSepRegex);
    const lineSep = (((lineSepMatchResult || []).length > 0) ? lineSepMatchResult[0] : '\n');
    const lines = highlightedCode.split(lineSepRegex);

    highlightedCode = ""; // clear
    for (var i = 0; i < lines.length; i++) {
        let line = lines[i];
        let commentPos = line.indexOf(';');
        const lineEnd = ((i == (lines.length - 1)) ? '' : lineSep);
        if (commentPos >= 0) {
            /** Consists of two parts: uncommented and commented */
            let matches = [line.substring(0, commentPos), line.substring(commentPos + 1)];
            /** Has comments! Strip other highlights by parsing. */
            let dummyElement = document.createElement('div');
            dummyElement.innerHTML = matches[1]; // the comment part
            /** Automatically strips the tags. If not supported, then never mind. */
            let processedLine = (dummyElement.innerText || dummyElement.textContent || null);
            if (processedLine) {
                processedLine = matches[0] + ';' + processedLine;
            } else {
                processedLine = line;
            }
            highlightedCode += processedLine.replace(
                commentRegex, '<span class="gasm-comment">$1</span>$2'
            ) + lineEnd;
        } else {
            highlightedCode += line + lineEnd; // no comment found
        }
    }

    // parses the nested HTML contents...
    highlightedCode = highlightedCode.replace(
        // matching [tag] content... [/tag], e.g. [i]italicised text[/i]
        /\[([^\[\]\s]+)(\s*[^\[\]]*)\]([^\[\]]*)\[\/\1\]/g, 
        '<$1$2>$3</$1>'
    );

    console.debug({ // DEBUG INFO!!
        old: plainTextCode,
        new: highlightedCode
    });

    return highlightedCode;
}

/**
 * Automatically highlights all elements
 * under [parent] matched with [selector]
 * by changing their innerHTML.
 * @param {String} selector 
 * @param {?Document | Element} parent
 * @param {!Object.<String, Consumer>} engineConsumers
 * @returns {number} Number of elements highlighted
 */
function gasmHTMLSyntaxHighlightAuto(selector, engineConsumers, parent) {
    let highlightedElementCount = 0;
    (parent || document).querySelectorAll(selector).forEach(
        function (value, key, list) {
            // highlights each element's content
            value.innerHTML = gasmHTMLSyntaxHighlight(
                (value.innerText || value.textContent || value.innerHTML),
                engineConsumers
            )
                .replace(/<</g, '&lt;')
                .replace(/>>/g, '&gt;'); 
                // ^ replaces the '<' and '>' to prevent unintentional HTML parsing
            highlightedElementCount++;
        }
    );
    return highlightedElementCount;
}

