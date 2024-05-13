"use strict";

const fs = require("node:fs");
const processArgv = process.argv.slice(2);
const processWrite = (...args) => process.stdout.write(...args);
let processOnStdin = () => {}; // Do this.
const exit = process.exit;
const endl = "\n";
process.stdin.on("data", buff => processOnStdin(buff.toString("utf-8")));





const VERSION = "0.1.0";

const BIRRA_OPERATORS = [
	"=", "<", ">", "<=", ">=", "<>", "!=",
	
	",", ":", ";",
	
	"+", "-", "*", "/",
	"++", "--",
	"+=", "-=", "*=", "/=",
	
	"~", "&", "|", "^",
	"!", "&&", "||", "^^",
	"~=", "&=", "&&=", "|=", "||=", "^=", "^^=",
	
	"<<", ">>", "<<=", ">>=",
	
	"(", ")", "[", "]", "{", "}",
];

for(let i = 0; i < BIRRA_OPERATORS.length; i++) {
	BIRRA_OPERATORS[BIRRA_OPERATORS[i]] = BIRRA_OPERATORS[i];
};

class BirraLexer {
	error_at_line(err_str, show_column = true) {
		if(!this._lasting_line) {
			console.error(	err_str,
							(this._tokens_state.row + 1)
							+ ":" +
							(this._tokens_state.column + 1));
		} else {
			console.error(this._lasting_line);
			console.error(' '.repeat(this._tokens_state.column - 1) + '^');
			console.error('');
			console.error(	err_str, "at",
							(this._tokens_state.row + 1)
							+ ":" +
							(this._tokens_state.column + 1));
		}
		
		return -1;
	};
	
	read_character() {
		if(this._tokens_state.srcI >= this._tokens_state.src.length)
			return '\0';
		
		const c = this._tokens_state.src[this._tokens_state.srcI];
		this._tokens_state.srcI++;
		
		if(c === '\n') {
			this._tokens_state.row++;
			this._lastTokensColumn = this._tokens_state.column + 0;
			this._tokens_state.column = 0;
			this._lasting_line = "";
		} else {
			this._tokens_state.column++;
			this._lastTokensColumn = this._tokens_state.column;
			
			this._lasting_line =	((this._lasting_line ?? "") +
									((c === '\t') ? "    " : c)).slice(-2048);
		}
		
		return c;
	};
	
	back_a_character() {
		this._tokens_state.srcI -= 1;
		if(this._tokens_state.srcI < 0) this._tokens_state.srcI = 0;
		
		this._tokens_state.column = this._lastTokensColumn;
	};
	
	is_whitespace(c) {
		if(c.charCodeAt(0) <= 0x20) return true;
		if(c.charCodeAt(0) === 0x7f) return true;
		
		return false;
	};
	
	is_number(c) {
		return ("0123456789.".split('').includes(c));
	};
	
	is_operator(c) {
		return (BIRRA_OPERATORS.includes(c));
	};
	
	skip_whitespace() {
		let c = '\0';
		while(true) {
			c = this.read_character();
			
			if(c === '\0') break;
			
			if(this.is_whitespace(c) === false) {
				this.back_a_character();
				break;
			}
		};
	};
	
	parse_string(initial_c) {
		let str = "", c = '';
		
		while(true) {
			c = this.read_character();
			if(c === initial_c) break;
			
			if(c === '\0') {
				this.error_at_line(	"Unexpected EOF while in String " +
									"declaration");
				return -1;
			}
			
			str += c;
		};
		
		this._tokens.push({
			type: "STRING",
			value: str,
		});
		
		return 0;
	};
	
	parse_number(c) {
		let num = c, is_dot = false;
		
		while(true) {
			c = this.read_character();
			
			if(this.is_number(c)) {
				if((c === '.') && num.includes('.')) {
					this.error_at_line(	"Unexpected '.' in Number " +
										"declaration");
					return -1;
				}
				
				num += c;
			} else {
				if(num === ".") {
					is_dot = true;
					this.back_a_character();
					break;
				}
				
				if((c === 'x') || (c === 'b')) {
					if(num === "0") {
						num += c;
						continue;
					} else {
						this.error_at_line(	"Unexpected '" + c + "' in " +
											"Number declaration");
						return -1;
					}
				}
				
				this.back_a_character();
				break;
			}
		};
		
		if(is_dot) {
			this._tokens.push({
				type: "OPERATOR",
				value: ".",
			});
		} else {
			this._tokens.push({
				type: "NUMBER",
				value: num,
			});
		}
		
		return 0;
	};
	
	parse_operator(c) {
		let op = c;
		
		while(true) {
			c = this.read_character();
			
			if(c === '\0') {
				this.error_at_line(	"Unexpected EOF while in Operator " +
									"declaration");
				return -1;
			}
			
			if(this.is_operator(op + c)) {
				op += c;
			} else {
				this.back_a_character();
				break;
			}
		};
		
		this._tokens.push({
			type: "OPERATOR",
			value: op,
		});
		
		return 0;
	};
	
	parse_keyword(c) {
		let word = c;
		
		while(true) {
			c = this.read_character();
			
			if(this.is_whitespace(c)) break;
			if(c === '.') {
				this.back_a_character();
				break;
			}
			
			if(
				(this.is_operator(c)) ||
				(c === '"') ||
				(c === '\'')
			) {
				this.back_a_character();
				break;
			}
			
			word += c;
		};
		
		this._tokens.push({
			type: "KEYWORD",
			value: word,
		});
		
		return 0;
	};
	
	parse(src) {
		this._tokens_state = {
			eof: false, src, srcI: 0,
			row: 0, column: 0,
		};
		
		this._tokens = [];
		
		let	c = '\0', onComment = false, onMultilineComment = false,
			lastCommentThingy = "";
		
		while(this._tokens_state.eof === false) {
			c = this.read_character();
			if(c === '\0') break;
			
			if(onMultilineComment !== false) {
				lastCommentThingy = (lastCommentThingy + c).slice(-8);
				
				if(lastCommentThingy.endsWith(onMultilineComment)) {
					lastCommentThingy = "";
					onMultilineComment = false;
				}
				
				continue;
			}
			
			if(onComment) {
				if(c === '\n') onComment = false;
				continue;
			}
			
			if(this.is_whitespace(c)) continue;
			
			// Detect "#" single-line comments.
			if(c === '#') {
				onComment = true;
				continue;
			}
			
			// Detect "//" single-line coments.
			if(c === '/') {
				const nextC = this.read_character();
				
				if(nextC === '/') {
					onComment = true;
					continue;
				} else {
					this.back_a_character();
				}
			}
			
			// Detect "--" single-line coments.
			if(c === '-') {
				const nextC = this.read_character();
				
				if(nextC === '-') {
					onComment = true;
					continue;
				} else {
					this.back_a_character();
				}
			}
			
			// Detect "~~" single-line coments.
			if(c === '~') {
				const nextC = this.read_character();
				
				if(nextC === '~') {
					onComment = true;
					continue;
				} else {
					this.back_a_character();
				}
			}
			
			// Detect "/*" multi-line comments.
			if(c === '/') {
				const nextC = this.read_character();
				
				if(nextC === '*') {
					onMultilineComment = "*/";
					continue;
				} else {
					this.back_a_character();
				}
			}
			
			if((c === '"') || (c === '\'')) {
				if(this.parse_string(c) < 0)
					return -1;
			} else if(this.is_number(c)) {
				if(this.parse_number(c) < 0)
					return -1;
			} else if(this.is_operator(c)) {
				if(this.parse_operator(c) < 0)
					return -1;
			} else {
				if(this.parse_keyword(c) < 0)
					return -1;
			}
		};
		
		this._tokens.push({
			type: "EOF",
			value:	(this._tokens_state.row + 1) + ":" +
					(this._tokens_state.column + 1),
		});
		
		return this._tokens;
	};
	
	print_lexer_tokens(tokens) {
		if(tokens < 0) return -1;
		
		for(const token of tokens) {
			console.log(token.type.padStart(8, ' ') + ": " + token.value);
		};
	};
};

class BirraParser {
	parse(tokens) {
	};
};

function handleScriptFile(scriptFile, scriptArgv) {
	fs.readFile(scriptFile, (err, buff) => {
		if(err) {
			console.error("Couldn't read the script:", err);
			return exit(1);
		}
		
		const birra = new BirraLexer();
		const tokens = birra.parse(buff.toString("utf-8"));
		
		birra.print_lexer_tokens(tokens);
	});
};

class BirraREPL {
	static handle(scriptArgv) {
		const birra = new BirraLexer();
		
		BirraREPL.showWelcome();
		BirraREPL.showInput();
		
		processOnStdin = str => {
			const tokens = birra.parse(str);
			birra.print_lexer_tokens(tokens);
			
			BirraREPL.showInput();
		};
		
		return birra;
	};
	
	static showWelcome() {
		processWrite("BirraScript " + VERSION + " 🍺🍻🍺" + endl);
	};
	
	static showInput() {
		processWrite("> ");
	};
};

function main(argv) {
	let scriptFile = false, scriptArgv = [];
	
	for(const arg of argv) {
		if(scriptFile) {
			scriptArgv.push(arg);
		} else {
			if(arg.startsWith('-')) {
				console.log("El intérprete no sabe lidiar con ese " +
							"argumento \"" + arg + "\".");
				return exit(1);
			}
		
			scriptFile = arg;
		}
	};
	
	if(scriptFile === false) {
		BirraREPL.handle(scriptArgv);
	} else {
		handleScriptFile(scriptFile, scriptArgv);
	}
};

main(processArgv);
